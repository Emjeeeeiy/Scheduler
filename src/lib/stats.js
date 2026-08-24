/* Aggregations behind the Dashboard and Review views.
 *
 * One convention throughout: *planned minutes* counts only tasks that occupy a
 * real slot (a startMin). An all-day item is a commitment to a day, not to a
 * span of hours — folding it into the hour totals would make "6 hours planned"
 * mean nothing. All-day items are still counted in the task counts.
 */

import { todayKey } from './date.js'

const isTimed = (task) => Number.isFinite(task.startMin)

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

/** Per-day totals across a window of day keys — the shape the bar charts take. */
export function rangeStats(tasksByDate, keys) {
  return keys.map((key) => ({ key, ...dayStats(tasksByDate.get(key) ?? []) }))
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
      tag: byId.get(bucket.id) ?? { id: bucket.id, name: 'Untagged', color: 'var(--text-muted)' },
    }))
    .sort((a, b) => b.plannedMin - a.plannedMin || b.count - a.count)
}

/** Open tasks whose day has already passed — the pile that quietly grows. */
export function overdueTasks(tasks, reference = todayKey()) {
  return tasks
    .filter((task) => !task.done && task.date !== null && task.date < reference)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startMin ?? 0) - (b.startMin ?? 0))
}

/** The next few open blocks from `fromMin` on `reference` onward. */
export function upcomingTasks(tasks, reference, fromMin, limit = 3) {
  return tasks
    .filter((task) => {
      if (task.done || task.date === null) return false
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

/** The tag with the worst completion rate over a set of tasks, ignoring tags
    with too little history to mean anything. */
export function weakestTag(tasks, tags, minimumCount = 3) {
  const rows = tagBreakdown(tasks, tags).filter((row) => row.count >= minimumCount)
  if (rows.length === 0) return null
  return rows
    .map((row) => ({ ...row, rate: row.count === 0 ? 1 : row.completedMin / (row.plannedMin || 1) }))
    .sort((a, b) => a.rate - b.rate)[0]
}
