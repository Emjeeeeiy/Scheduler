/* "Find me a slot": given how long a task needs, where could it actually go?
 *
 * Reuses the exact primitives the Day view already shows on screen —
 * visibleWindow decides what a day's own reasonable hours look like,
 * freeSlots finds the gaps in it — so a suggestion here is never a place the
 * Day view itself wouldn't also call free. Kept pure: the caller supplies
 * `dayItems(key)` (whatever ScheduleContext considers busy that day) rather
 * than this module reaching into ScheduleContext itself.
 */

import { addDays, isValidKey } from './date.js'
import { visibleWindow } from './layout.js'
import { freeSlots } from './slots.js'
import { DEFAULT_DURATION_MIN, TASK_PRIORITIES } from './normalize.js'

const DEFAULT_LOOKAHEAD_DAYS = 14
const DEFAULT_LIMIT = 3

/** A gap left after each placement, so a proposed day is not a wall of
    back-to-back blocks with no room to stand up. */
const BREATHING_ROOM_MIN = 10

/** Whether a working-hours setting is actually usable, not just present —
    same guard TodayView's own free-slot finder applies. */
function hasWorkingHours(workingHours) {
  return (
    Number.isFinite(workingHours?.startMin) &&
    Number.isFinite(workingHours?.endMin) &&
    workingHours.endMin > workingHours.startMin
  )
}

/**
 * @param fromKey       first day to consider
 * @param durationMin   how long the task needs
 * @param dayItems      (key) => the day's scheduled tasks/events
 * @param lookaheadDays how many days forward to search before giving up
 * @param workingHours  optional { startMin, endMin } narrowing every day's
 *                      own visible window, the same way Settings' working
 *                      hours narrows the Day view's free-slot finder
 * @param limit         how many suggestions to return
 * @return [{ date, startMin }] — earliest first, at most `limit`
 */
export function suggestSlots({
  fromKey,
  durationMin,
  dayItems,
  lookaheadDays = DEFAULT_LOOKAHEAD_DAYS,
  workingHours = null,
  limit = DEFAULT_LIMIT,
}) {
  if (!Number.isFinite(durationMin) || durationMin <= 0) return []

  const suggestions = []
  for (let i = 0; i < lookaheadDays && suggestions.length < limit; i++) {
    const key = addDays(fromKey, i)
    const items = dayItems(key)
    const [dayStart, dayEnd] = visibleWindow(items)
    const windowStart = hasWorkingHours(workingHours) ? Math.max(dayStart, workingHours.startMin) : dayStart
    const windowEnd = hasWorkingHours(workingHours) ? Math.min(dayEnd, workingHours.endMin) : dayEnd

    for (const gap of freeSlots(items, windowStart, windowEnd, durationMin)) {
      if (suggestions.length >= limit) break
      suggestions.push({ date: key, startMin: gap.startMin })
    }
  }
  return suggestions
}

/**
 * The exact free-time window "Plan my day" reasons over for one day — its
 * own working-hours-narrowed window, with "now" as the earliest minute
 * worth offering when planning today. Split out from planDay so a second
 * caller can ask a question about the SAME free time the heuristic itself
 * used, rather than risk a slightly different computation quietly
 * disagreeing with it — see /api/plan-day and TodayView's AI enhancement,
 * which need to hand Gemini the identical slots planDay already found
 * before either can compare its answer against them.
 *
 * @return [{ startMin, endMin, lengthMin }], or [] if there is no usable
 *         window at all today (working hours already over, etc.)
 */
export function planningSlots({ dayItems, key, workingHours = null, fromMin = 0 }) {
  const items = dayItems(key)
  const [dayStart, dayEnd] = visibleWindow(items)
  const windowStart = Math.max(
    hasWorkingHours(workingHours) ? Math.max(dayStart, workingHours.startMin) : dayStart,
    fromMin,
  )
  const windowEnd = hasWorkingHours(workingHours) ? Math.min(dayEnd, workingHours.endMin) : dayEnd
  if (!(windowEnd > windowStart)) return []
  return freeSlots(items, windowStart, windowEnd, 1)
}

/**
 * "Plan my day": lay the open inbox out across one day's actual free time.
 *
 * The same free-slot machinery suggestSlots uses, run once for a single day
 * and asked to place as many tasks as will genuinely fit rather than to
 * offer alternatives for one. What comes back is a PROPOSAL — a list of
 * placements for the caller to show and have someone accept or discard.
 * Nothing here writes.
 *
 * Highest priority first, then oldest first: the point is to get the things
 * that have been waiting longest onto a day, and a tie broken by age means
 * running this repeatedly does not keep favouring whatever was added most
 * recently. Tasks that do not fit are simply left in the inbox, which is
 * the honest outcome — a day has the hours it has.
 *
 * @param inbox        undated, open tasks (ScheduleContext's own `inbox`)
 * @param dayItems     everything already on the day
 * @param key          the day being planned
 * @param workingHours optional { startMin, endMin }
 * @param fromMin      earliest minute to place into — "now", when planning
 *                     today, so this never proposes a slot in the past
 * @param limit        most placements to propose
 * @return [{ task, date, startMin }] in the order they would sit on the day
 */
export function planDay({
  inbox,
  dayItems,
  key,
  workingHours = null,
  fromMin = 0,
  limit = 8,
}) {
  /* Consumed as gaps are filled, so the next task is offered what is
     genuinely left rather than the same slot again. Tracked as a mutable
     cursor per gap instead of recomputing planningSlots after every
     placement — nothing has been written, so there is nothing new for it
     to find. */
  const gaps = planningSlots({ dayItems, key, workingHours, fromMin }).map((gap) => ({ ...gap }))
  if (gaps.length === 0) return []

  const rank = (task) => TASK_PRIORITIES.indexOf(task.priority)
  const queue = [...inbox]
    .filter((task) => !task.done)
    .sort((a, b) => rank(b) - rank(a) || a.createdAt - b.createdAt || a.id.localeCompare(b.id))

  const placements = []
  for (const task of queue) {
    if (placements.length >= limit) break
    const needed = task.durationMin
    const gap = gaps.find((candidate) => candidate.endMin - candidate.startMin >= needed)
    if (!gap) continue

    placements.push({ task, date: key, startMin: gap.startMin })
    gap.startMin += needed + BREATHING_ROOM_MIN
  }

  return placements
}

/** The most rows one note's plan ever proposes — what the AI route returns at
    most, and a screenful to read before accepting. */
export const NOTE_PLAN_LIMIT = 10

/** Two titles are "the same task" ignoring case, runs of spaces and trailing
    punctuation — what someone typing it twice would call the same. */
const titleKey = (title) =>
  String(title ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\s.!?,;:]+$/, '')
    .trim()

const isMinute = (value) => Number.isInteger(value) && value >= 0 && value <= 1439
const isLength = (value) => Number.isInteger(value) && value >= 5 && value <= 24 * 60

/**
 * A note's to-dos, as a proposal: where each would go on the calendar.
 * Nothing here writes — like planDay, this is for the caller to show and have
 * someone accept or discard.
 *
 * A time the writer stated is kept as stated. Everything else is fitted into the
 * day's real free time with planDay itself (the same free-slot machinery and
 * breathing room as "Plan my day", so a plan from a note agrees with one from the
 * Day view), in the order it was written, around what is already there AND around
 * the stated times. A past day is never planned onto: a stated date before today
 * means today.
 *
 * Each row is `{ title, date, startMin, durationMin, kind, duplicate, include }`:
 *   kind 'stated'  — the time came from the writer
 *   kind 'fitted'  — placed into free time
 *   kind 'untimed' — the writer's day, but nothing fit: no time yet
 *   kind 'inbox'   — no day stated and nothing fit: undated, like any inbox task
 * `duplicate` is a task already on that day with the same title — held back
 * (`include: false`) rather than dropped, so it can still be ticked on purpose.
 *
 * @param items    [{ title, date, startMin, durationMin }], each field but
 *                 `title` possibly null — parseQuickAdd's shape, or the AI
 *                 route's
 * @param planningDay the day an item with no date of its own is planned on
 * @param today    "today" — nothing is placed before it
 * @param nowMin   the minute of the day it is, for fitting into today
 * @param dayItems (key) => what is already on that day (tasks, and timed events)
 */
export function placeNoteTasks(
  items,
  { planningDay, today, nowMin = 0, dayItems, workingHours = null, limit = NOTE_PLAN_LIMIT },
) {
  // 1. Normalised, and the same task written twice proposed once.
  const seen = new Set()
  const rows = []
  for (const item of Array.isArray(items) ? items : []) {
    if (rows.length >= limit) break
    const title = String(item?.title ?? '').trim()
    if (!title) continue

    const statedDate = isValidKey(item.date) ? (item.date < today ? today : item.date) : null
    const day = statedDate ?? planningDay
    const key = `${day}|${titleKey(title)}`
    if (seen.has(key)) continue
    seen.add(key)

    rows.push({
      index: rows.length,
      title,
      statedDate,
      day,
      startMin: isMinute(item.startMin) ? item.startMin : null,
      durationMin: isLength(item.durationMin) ? item.durationMin : DEFAULT_DURATION_MIN,
    })
  }

  // 2. Fitted one day at a time. The stated times on that day count as busy, or
  //    a fitted task could be dropped on top of one the writer chose.
  const byDay = new Map()
  for (const row of rows) byDay.set(row.day, [...(byDay.get(row.day) ?? []), row])

  const fitted = new Map()
  for (const [day, group] of byDay) {
    const stated = group.filter((row) => row.startMin !== null)
    const loose = group.filter((row) => row.startMin === null)
    if (loose.length === 0) continue

    const proposals = planDay({
      inbox: loose.map((row) => ({
        id: String(row.index),
        done: false,
        priority: 'normal',
        createdAt: row.index, // note order is the order to place in
        durationMin: row.durationMin,
      })),
      dayItems: (key) => [
        ...dayItems(key),
        ...(key === day ? stated.map(({ startMin, durationMin }) => ({ startMin, durationMin })) : []),
      ],
      key: day,
      workingHours,
      fromMin: day === today ? nowMin : 0,
      limit: loose.length,
    })
    for (const placement of proposals) fitted.set(Number(placement.task.id), placement.startMin)
  }

  // 3. Each row says where it ended up, and whether the day already has it.
  return rows.map((row) => {
    const duplicate = dayItems(row.day).some((existing) => titleKey(existing.title) === titleKey(row.title))
    let kind
    let date = row.day
    let startMin = null
    if (row.startMin !== null) {
      kind = 'stated'
      startMin = row.startMin
    } else if (fitted.has(row.index)) {
      kind = 'fitted'
      startMin = fitted.get(row.index)
    } else if (row.statedDate !== null) {
      kind = 'untimed'
    } else {
      kind = 'inbox'
      date = null
    }
    return { title: row.title, date, startMin, durationMin: row.durationMin, kind, duplicate, include: !duplicate }
  })
}

/**
 * Where a day's unfinished tasks go when someone says "carry them over": today
 * when the day is past, tomorrow when it is today, and nowhere when it is still
 * ahead — there is nothing left behind on a day that has not happened yet.
 */
export function carryOverTarget(dayKey, today) {
  if (!isValidKey(dayKey) || !isValidKey(today) || dayKey > today) return null
  return dayKey < today ? today : addDays(today, 1)
}

/**
 * Whether an AI-proposed plan (see /api/plan-day) is safe to show at all.
 *
 * planDay's own greedy placements can be trusted because this module built
 * them from `freeSlots` itself — a model's placements cannot, since a model
 * asked to reason about times can still get the arithmetic wrong in a way
 * that reads as perfectly plausible right up until it overlaps something.
 * `false` here means "discard the whole proposal, keep the greedy one" —
 * deliberately all-or-nothing rather than salvaging whichever placements
 * happen to check out, so what's shown is either fully trustworthy or not
 * shown at all, never a plan that's silently missing pieces without saying
 * so.
 *
 * @param placements [{ taskId, startMin }] — the model's raw proposal
 * @param tasks      the real tasks the model was offered, [{ id, durationMin }]
 * @param slots      the real free slots the model was offered, [{ startMin, endMin }]
 */
export function isValidAiPlan(placements, { tasks, slots }) {
  if (!Array.isArray(placements) || placements.length === 0) return false

  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const seenTaskIds = new Set()
  const accepted = []

  for (const placement of placements) {
    const task = taskById.get(placement?.taskId)
    if (!task) return false
    // The same task placed twice is not a plan any greedy proposal could
    // ever produce either — a sign something upstream is confused, not a
    // shape worth partially trusting.
    if (seenTaskIds.has(task.id)) return false
    seenTaskIds.add(task.id)

    if (!Number.isInteger(placement.startMin)) return false
    const start = placement.startMin
    const end = start + task.durationMin

    const fitsARealSlot = slots.some((slot) => start >= slot.startMin && end <= slot.endMin)
    if (!fitsARealSlot) return false

    const overlapsAnAcceptedOne = accepted.some((a) => start < a.end && end > a.start)
    if (overlapsAnAcceptedOne) return false
    accepted.push({ start, end })
  }

  return true
}
