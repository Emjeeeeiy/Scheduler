/* "Find me a slot": given how long a task needs, where could it actually go?
 *
 * Reuses the exact primitives the Day view already shows on screen —
 * visibleWindow decides what a day's own reasonable hours look like,
 * freeSlots finds the gaps in it — so a suggestion here is never a place the
 * Day view itself wouldn't also call free. Kept pure: the caller supplies
 * `dayItems(key)` (whatever ScheduleContext considers busy that day) rather
 * than this module reaching into ScheduleContext itself.
 */

import { addDays } from './date.js'
import { visibleWindow } from './layout.js'
import { freeSlots } from './slots.js'
import { TASK_PRIORITIES } from './normalize.js'

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
  const items = dayItems(key)
  const [dayStart, dayEnd] = visibleWindow(items)
  const windowStart = Math.max(
    hasWorkingHours(workingHours) ? Math.max(dayStart, workingHours.startMin) : dayStart,
    fromMin,
  )
  const windowEnd = hasWorkingHours(workingHours) ? Math.min(dayEnd, workingHours.endMin) : dayEnd
  if (!(windowEnd > windowStart)) return []

  const rank = (task) => TASK_PRIORITIES.indexOf(task.priority)
  const queue = [...inbox]
    .filter((task) => !task.done)
    .sort((a, b) => rank(b) - rank(a) || a.createdAt - b.createdAt || a.id.localeCompare(b.id))

  /* Gaps are consumed as they are filled, so the next task is offered what
     is genuinely left rather than the same slot again. Tracked as a mutable
     cursor per gap instead of recomputing freeSlots after every placement —
     nothing has been written, so there is nothing new for it to find. */
  const gaps = freeSlots(items, windowStart, windowEnd, 1).map((gap) => ({ ...gap }))
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
