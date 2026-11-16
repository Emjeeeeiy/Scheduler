/* The MCP layer's read-side logic, kept free of I/O so it can be tested on its
 * own: given the normalized tasks, events and tags that store.js loaded, work
 * out what is on a day, what is free, and what matches a search.
 *
 * It deliberately reuses @cadence/shared rather than re-deriving anything — a
 * task the assistant reports must be the task the app shows. The one thing
 * redone here is the per-day expansion, because ScheduleContext builds it
 * inside closures over a Firestore snapshot that a serverless function does
 * not have (the same reason functions/lib/dayModel.js exists).
 */

import {
  DAY_LONG,
  addDays,
  isValidKey,
  minToTimeValue,
  weekdayOf,
} from '@cadence/shared/date.js'
import { eventOccurrenceOn, occurrenceOn, recurrenceLabel } from '@cadence/shared/recurrence.js'
import { freeSlots } from '@cadence/shared/slots.js'
import { overdueTasks } from '@cadence/shared/stats.js'

const NOTES_PREVIEW = 300
const UPCOMING_DAYS = 14
const MIN_FREE_WINDOW_MIN = 15

/* ------------------------------------------------------------------ time -- */

/** The calendar date and clock time right now in `timeZone`. The server runs in
    UTC, so "today" has to be asked of the zone the person actually lives in —
    otherwise "what's on today" is wrong for hours every evening or morning. */
export function todayIn(timeZone, at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at)
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '00'
  // Some engines report midnight as "24" even under h23.
  const hour = Number(get('hour')) % 24
  return {
    key: `${get('year')}-${get('month')}-${get('day')}`,
    min: hour * 60 + Number(get('minute')),
  }
}

/** 'YYYY-MM-DD' that names a real calendar day (not 2026-02-31). */
export function isRealDay(key) {
  if (!isValidKey(key)) return false
  // addDays/fromKey go through Date, which rolls an impossible day over — so a
  // key that does not survive a zero-day round trip was not a real date.
  return addDays(key, 0) === key
}

/** '09:30' -> 570. null for anything that is not a 24-hour HH:MM. */
export function parseTime(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(typeof value === 'string' ? value : '')
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

export const formatTime = (min) => minToTimeValue(min)

/* ------------------------------------------------------------------ tags -- */

/** "Work / Deep work" for each tag id. A parent that is missing, or a chain that
    loops, ends the path early rather than hanging the walk. */
export function tagPaths(tags) {
  const byId = new Map(tags.map((tag) => [tag.id, tag]))
  const paths = new Map()
  for (const tag of tags) {
    const names = [tag.name]
    const seen = new Set([tag.id])
    let parent = tag.parentId ? byId.get(tag.parentId) : null
    while (parent && !seen.has(parent.id)) {
      names.unshift(parent.name)
      seen.add(parent.id)
      parent = parent.parentId ? byId.get(parent.parentId) : null
    }
    paths.set(tag.id, names.join(' / '))
  }
  return paths
}

/** A tag named by the assistant, as an id, a name, or a full "Parent / Child"
    path. Never creates one: a tag is a deliberate choice of colour and place in
    the hierarchy, not something to invent from a free-text argument.

    @return {{ tag: object } | { error: string }} */
export function resolveTag(reference, tags) {
  const wanted = String(reference ?? '').trim()
  if (!wanted) return { error: 'Tag was empty.' }

  const byId = tags.find((tag) => tag.id === wanted)
  if (byId) return { tag: byId }

  const paths = tagPaths(tags)
  const lower = wanted.toLowerCase()
  const matches = tags.filter(
    (tag) => tag.name.toLowerCase() === lower || (paths.get(tag.id) ?? '').toLowerCase() === lower,
  )
  if (matches.length === 1) return { tag: matches[0] }
  if (matches.length > 1) {
    const options = matches.map((tag) => `"${paths.get(tag.id)}" (id ${tag.id})`).join(', ')
    return { error: `More than one tag is called "${wanted}": ${options}. Use the full path or the id.` }
  }
  const known = tags.map((tag) => `"${paths.get(tag.id)}"`).join(', ')
  return { error: `No tag called "${wanted}". Existing tags: ${known || '(none)'}.` }
}

/** The tag and every tag filed beneath it — "Work" should also find "Work /
    Deep work", the same roll-up the app's own breakdowns do. */
function tagWithDescendants(tag, tags) {
  const ids = new Set([tag.id])
  let grew = true
  while (grew) {
    grew = false
    for (const candidate of tags) {
      if (!ids.has(candidate.id) && candidate.parentId && ids.has(candidate.parentId)) {
        ids.add(candidate.id)
        grew = true
      }
    }
  }
  return ids
}

/* ----------------------------------------------------------------- views -- */

const trimNotes = (notes) => {
  const text = typeof notes === 'string' ? notes.trim() : ''
  if (!text) return undefined
  return text.length > NOTES_PREVIEW ? `${text.slice(0, NOTES_PREVIEW)}…` : text
}

/** A task as the assistant sees it. `id` is the occurrence id for one day of a
    repeating task — the id set_task_done needs — not the series' own. */
export function taskView(task, paths) {
  const view = {
    id: task.id,
    title: task.title,
    date: task.date,
    start: Number.isFinite(task.startMin) ? formatTime(task.startMin) : null,
    durationMin: task.durationMin,
    done: task.done,
    priority: task.priority,
    tag: task.tagId ? (paths.get(task.tagId) ?? null) : null,
  }
  if (task.recurrence) {
    view.repeats = recurrenceLabel(task.recurrence)
    if (task.seriesId) view.seriesId = task.seriesId
  }
  const notes = trimNotes(task.notes)
  if (notes) view.notes = notes
  if (task.subtasks?.length > 0) {
    view.checklist = task.subtasks.map((s) => ({ title: s.title, done: s.done }))
  }
  return view
}

export function eventView(event, paths) {
  const view = {
    id: event.id,
    title: event.title,
    startDate: event.startDate,
    endDate: event.endDate,
    start: Number.isFinite(event.startMin) ? formatTime(event.startMin) : null,
    end: Number.isFinite(event.endMin) ? formatTime(event.endMin) : null,
    allDay: !Number.isFinite(event.startMin),
    tag: event.tagId ? (paths.get(event.tagId) ?? null) : null,
  }
  if (event.recurrence) view.repeats = recurrenceLabel(event.recurrence)
  const notes = trimNotes(event.notes)
  if (notes) view.notes = notes
  return view
}

/* ----------------------------------------------------------- expansion -- */

// All-day items first, then by time, ties by creation then id — the order
// ScheduleContext uses, so a day reads the same here as it does in the app.
const byTimeOfDay = (a, b) =>
  (a.startMin ?? -1) - (b.startMin ?? -1) || a.createdAt - b.createdAt || a.id.localeCompare(b.id)

const bySpan = (a, b) =>
  a.startDate.localeCompare(b.startDate) ||
  b.endDate.localeCompare(a.endDate) ||
  a.id.localeCompare(b.id)

/** Everything on one day: one-off tasks dated that day plus that day's
    occurrence of every repeating task. A series' own document is a rule, not a
    thing on the calendar, so it never appears on its anchor date by itself. */
export function tasksOnDay(tasks, key) {
  const out = []
  for (const task of tasks) {
    if (task.recurrence) {
      const occurrence = occurrenceOn(task, key)
      if (occurrence) out.push(occurrence)
    } else if (task.date === key) {
      out.push(task)
    }
  }
  return out.sort(byTimeOfDay)
}

export function eventsOnDay(events, key) {
  const out = []
  for (const event of events) {
    if (event.recurrence) {
      const occurrence = eventOccurrenceOn(event, key)
      if (occurrence) out.push(occurrence)
    } else if (event.startDate <= key && key <= event.endDate) {
      out.push(event)
    }
  }
  return out.sort(bySpan)
}

/** Free windows on one day, matching what the app's own "free time" counts as
    busy: every timed task and every timed single-day event. For today the
    window starts no earlier than `fromMin` — time that has passed is not free. */
export function freeWindows(dayTasks, dayEvents, { fromMin, toMin }) {
  const busy = [
    ...dayTasks,
    ...dayEvents.filter((e) => Number.isFinite(e.startMin) && e.startDate === e.endDate),
  ]
  return freeSlots(busy, fromMin, toMin, MIN_FREE_WINDOW_MIN).map((slot) => ({
    start: formatTime(slot.startMin),
    end: formatTime(slot.endMin),
    lengthMin: slot.lengthMin,
  }))
}

/**
 * One entry per day for `days` days from `startDate`.
 *
 * @param nowMin  today's clock in the configured zone; only used to trim
 *                today's free windows, and only when `startDate..` includes today
 */
export function agendaForDays({
  tasks,
  events,
  tags,
  startDate,
  days,
  includeDone = true,
  dayStartMin = 8 * 60,
  dayEndMin = 20 * 60,
  today,
  nowMin = 0,
}) {
  const paths = tagPaths(tags)
  const out = []
  for (let i = 0; i < days; i += 1) {
    const key = addDays(startDate, i)
    const dayTasks = tasksOnDay(tasks, key)
    const dayEvents = eventsOnDay(events, key)
    const fromMin = key === today ? Math.max(dayStartMin, nowMin) : dayStartMin
    out.push({
      date: key,
      weekday: DAY_LONG[weekdayOf(key)],
      events: dayEvents.map((e) => eventView(e, paths)),
      tasks: dayTasks.filter((t) => includeDone || !t.done).map((t) => taskView(t, paths)),
      freeWindows:
        dayEndMin > fromMin ? freeWindows(dayTasks, dayEvents, { fromMin, toMin: dayEndMin }) : [],
    })
  }
  return out
}

/* ---------------------------------------------------------------- search -- */

const words = (text) =>
  String(text ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

/** Every word of the query appears somewhere in the title or notes. */
export function matchesText(task, query) {
  const wanted = words(query)
  if (wanted.length === 0) return true
  const haystack = `${task.title} ${task.notes ?? ''}`.toLowerCase()
  return wanted.every((word) => haystack.includes(word))
}

/**
 * @param view  'inbox' (no date) | 'overdue' (open, past) | 'upcoming' (next 14
 *              days, repeats expanded) | 'all' (every task, repeats as rules)
 * @return {{ tasks: object[], total: number, truncated: boolean, error?: string }}
 */
export function findTasks({
  tasks,
  tags,
  today,
  view,
  query,
  tag,
  includeDone = false,
  limit = 25,
}) {
  let tagIds = null
  if (tag) {
    const resolved = resolveTag(tag, tags)
    if (resolved.error) return { tasks: [], total: 0, truncated: false, error: resolved.error }
    tagIds = tagWithDescendants(resolved.tag, tags)
  }

  let pool
  if (view === 'inbox') {
    pool = tasks
      .filter((t) => !t.recurrence && t.date === null)
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
  } else if (view === 'overdue') {
    pool = overdueTasks(tasks, today)
  } else if (view === 'upcoming') {
    pool = []
    for (let i = 0; i < UPCOMING_DAYS; i += 1) pool.push(...tasksOnDay(tasks, addDays(today, i)))
    // Today's already-finished or already-passed ones are not "upcoming".
    pool = pool.filter((t) => t.date > today || !t.done)
  } else {
    pool = [...tasks].sort(
      (a, b) =>
        (a.date ?? '9999-99-99').localeCompare(b.date ?? '9999-99-99') ||
        (a.startMin ?? -1) - (b.startMin ?? -1) ||
        a.id.localeCompare(b.id),
    )
  }

  const matched = pool.filter(
    (t) =>
      (includeDone || view === 'overdue' || !t.done) &&
      (tagIds === null || (t.tagId !== null && tagIds.has(t.tagId))) &&
      matchesText(t, query),
  )

  const paths = tagPaths(tags)
  return {
    tasks: matched.slice(0, limit).map((t) => taskView(t, paths)),
    total: matched.length,
    truncated: matched.length > limit,
  }
}
