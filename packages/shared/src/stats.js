/* Aggregations behind the Dashboard, including its Trends section.
 *
 * One convention throughout: *planned minutes* counts only tasks that occupy a
 * real slot (a startMin). An all-day item is a commitment to a day, not to a
 * span of hours — folding it into the hour totals would make "6 hours planned"
 * mean nothing. All-day items are still counted in the task counts.
 */

import { todayKey, weekdayOf } from './date.js'

/** What counts as a full day, and the reference every load indicator scales
    against — the week header's bar, the month cell's strip, the mini
    calendar's dots, and the Dashboard hero's bar. It lives here rather than
    as a copy per component so the four can never disagree about how full a
    day is. */
export const HEAVY_DAY_MIN = 10 * 60

const isTimed = (task) => Number.isFinite(task.startMin)

/** A repeating task's own document is a rule, not something on the calendar —
    the days it lands on are expanded from it. Anything walking a flat task list
    has to skip it or the rule shows up as a task sitting on its anchor date. */
export const isSeriesTemplate = (task) =>
  task.recurrence != null && task.occurrenceDate === undefined

/** Totals for one day's tasks. */
export function dayStats(tasks) {
  let plannedMin = 0
  let completedMin = 0
  let doneCount = 0

  for (const task of tasks) {
    if (isTimed(task)) {
      plannedMin += task.durationMin
      if (task.done) completedMin += task.durationMin
    }
    if (task.done) doneCount += 1
  }

  return {
    plannedMin,
    completedMin,
    remainingMin: plannedMin - completedMin,
    count: tasks.length,
    doneCount,
    openCount: tasks.length - doneCount,
  }
}

/** Per-day totals across a window of day keys — the shape the bar charts take.
    Takes the day lookup rather than a map, because a day's tasks are partly
    stored and partly expanded from repeat rules. */
export function rangeStats(tasksOn, keys) {
  return keys.map((key) => ({ key, ...dayStats(tasksOn(key)) }))
}

/** Sum of a range, plus the completion rate over it. */
export function summarize(rows) {
  const totals = rows.reduce(
    (acc, row) => ({
      plannedMin: acc.plannedMin + row.plannedMin,
      completedMin: acc.completedMin + row.completedMin,
      count: acc.count + row.count,
      doneCount: acc.doneCount + row.doneCount,
    }),
    { plannedMin: 0, completedMin: 0, count: 0, doneCount: 0 },
  )
  return {
    ...totals,
    openCount: totals.count - totals.doneCount,
    // A day with nothing planned is not a 0% day — it is undefined, and
    // averaging it in as zero would quietly punish deliberate rest days.
    completionRate: totals.count === 0 ? null : totals.doneCount / totals.count,
    hourRate: totals.plannedMin === 0 ? null : totals.completedMin / totals.plannedMin,
  }
}

/** Minutes and counts grouped by tag, largest first. Untagged work is reported
    rather than dropped — an unlabelled majority is itself worth seeing. */
export function tagBreakdown(tasks, tags) {
  const buckets = new Map()
  const bump = (id, task) => {
    const bucket = buckets.get(id) ?? { id, plannedMin: 0, completedMin: 0, count: 0 }
    if (isTimed(task)) {
      bucket.plannedMin += task.durationMin
      if (task.done) bucket.completedMin += task.durationMin
    }
    bucket.count += 1
    buckets.set(id, bucket)
  }

  for (const task of tasks) bump(task.tagId ?? '__untagged', task)

  const byId = new Map(tags.map((t) => [t.id, t]))
  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      tag: byId.get(bucket.id) ?? { id: bucket.id, name: 'Untagged', color: 'var(--color-text-muted)' },
    }))
    .sort((a, b) => b.plannedMin - a.plannedMin || b.count - a.count)
}

/** Folds a tagBreakdown so a nested tag's time counts toward the tag it
    files under: "Work / Deep work" reports as Work. Child rows are merged
    away rather than kept alongside their parent — a chart showing both would
    draw the same hours twice, once under each name.
 *
 * The `seen` guard is not redundant with the cycle check ScheduleContext
 * already does: this is a pure module, tested and callable on any list of
 * tags, and a chart is not the place to discover a loop by hanging.
 */
export function rollUpTags(rows, tags) {
  const parentById = new Map(tags.map((t) => [t.id, t.parentId ?? null]))
  const rootOf = (id) => {
    let current = id
    const seen = new Set([id])
    let parent = parentById.get(current)
    while (parent && !seen.has(parent)) {
      seen.add(parent)
      current = parent
      parent = parentById.get(current)
    }
    return current
  }

  const byId = new Map(tags.map((t) => [t.id, t]))
  const buckets = new Map()
  for (const row of rows) {
    const id = rootOf(row.id)
    const bucket = buckets.get(id) ?? {
      id,
      plannedMin: 0,
      completedMin: 0,
      count: 0,
      // The root's own tag when it resolves; otherwise this row is already
      // standing in for something unnamed (untagged), so it keeps its own.
      tag: byId.get(id) ?? row.tag,
    }
    bucket.plannedMin += row.plannedMin
    bucket.completedMin += row.completedMin
    bucket.count += row.count
    buckets.set(id, bucket)
  }

  return [...buckets.values()].sort((a, b) => b.plannedMin - a.plannedMin || b.count - a.count)
}

/** Total focus-round minutes and round count across a set of day keys — one
    key for "today," seven for "this week." Callers pass whatever range they
    mean rather than this taking an opinion on it. */
export function focusStatsFor(sessions, keys) {
  const keySet = new Set(keys)
  let minutes = 0
  let count = 0
  for (const session of sessions) {
    if (!keySet.has(session.date)) continue
    minutes += session.minutes
    count += 1
  }
  return { minutes, count }
}

/** Focus minutes grouped by tag, largest first — the same shape and the
    same "report untagged rather than drop it" stance as tagBreakdown,
    just over completed focus rounds instead of scheduled tasks. */
export function focusByTag(sessions, tags) {
  const buckets = new Map()
  for (const session of sessions) {
    const id = session.tagId ?? '__untagged'
    const bucket = buckets.get(id) ?? { id, minutes: 0, count: 0 }
    bucket.minutes += session.minutes
    bucket.count += 1
    buckets.set(id, bucket)
  }

  const byId = new Map(tags.map((t) => [t.id, t]))
  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      tag: byId.get(bucket.id) ?? { id: bucket.id, name: 'Untagged', color: 'var(--color-text-muted)' },
    }))
    .sort((a, b) => b.minutes - a.minutes)
}

/** Open tasks whose day has already passed — the pile that quietly grows.
 *
 * A repeating task never joins that pile. Missing Tuesday's run is not work
 * left behind, it is a day of a habit that comes back tomorrow, and counting
 * every skipped morning would bury the one-off tasks this list exists for.
 */
export function overdueTasks(tasks, reference = todayKey()) {
  return tasks
    .filter(
      (task) =>
        !task.done && task.date !== null && task.date < reference && task.recurrence == null,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startMin ?? 0) - (b.startMin ?? 0))
}

/** The next few open blocks from `fromMin` on `reference` onward. */
export function upcomingTasks(tasks, reference, fromMin, limit = 3) {
  return tasks
    .filter((task) => {
      if (task.done || task.date === null || isSeriesTemplate(task)) return false
      if (task.date > reference) return true
      if (task.date < reference) return false
      return !isTimed(task) || task.startMin + task.durationMin > fromMin
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.startMin ?? -1) - (b.startMin ?? -1) ||
        a.createdAt - b.createdAt,
    )
    .slice(0, limit)
}

/** The still-open tasks a task is waiting on, out of the full task list —
    `[]` when it has none, or once every blocker is done. "Blocked by" is a
    reminder, not an enforced constraint (see BlockedByPicker), so this is
    the one place that reminder actually gets computed; TaskRow and
    ItemDetail both just ask "does this list have anything in it." */
export function openBlockers(task, tasks) {
  if (!task.blockedBy || task.blockedBy.length === 0) return []
  const byId = new Map(tasks.map((t) => [t.id, t]))
  return task.blockedBy.map((id) => byId.get(id)).filter((t) => t && !t.done)
}

/** Which weekday finishes the largest share of its planned work, aggregated
    across a range of `rangeStats` rows by the day-of-week each key falls on.
    Ignores weekdays with too little history to mean anything — the same
    minimum-count guard weakestTag uses, just over a range that's rarely more
    than 30 rows, so a single busy Tuesday can't crown itself "best day." */
export function bestDayOfWeek(rows, minimumCount = 2) {
  const buckets = new Map()
  for (const row of rows) {
    const day = weekdayOf(row.key)
    const bucket = buckets.get(day) ?? { day, count: 0, doneCount: 0 }
    bucket.count += row.count
    bucket.doneCount += row.doneCount
    buckets.set(day, bucket)
  }
  const eligible = [...buckets.values()].filter((b) => b.count >= minimumCount)
  if (eligible.length === 0) return null
  return eligible
    .map((b) => ({ ...b, rate: b.doneCount / b.count }))
    .sort((a, b) => b.rate - a.rate)[0]
}

/** The tag with the worst completion rate over a set of tasks, ignoring tags
    with too little history to mean anything. */
export function weakestTag(tasks, tags, minimumCount = 3) {
  const rows = tagBreakdown(tasks, tags).filter((row) => row.count >= minimumCount)
  if (rows.length === 0) return null
  return rows
    .map((row) => ({ ...row, rate: row.count === 0 ? 1 : row.completedMin / (row.plannedMin || 1) }))
    .sort((a, b) => a.rate - b.rate)[0]
}
