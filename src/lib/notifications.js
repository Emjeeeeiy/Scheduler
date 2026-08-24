import { overdueTasks } from './stats.js'

/** How far ahead "starting soon" looks. A whole day of lead time would just
    be a duplicate of the Day view; an hour is the window where a heads-up
    actually changes what you do next. */
export const SOON_WINDOW_MIN = 60

const isTimedToday = (task, reference) => task.date === reference && Number.isFinite(task.startMin)

/**
 * The live "what needs attention" feed behind the notification bell. There is
 * no separate notification log to keep in sync or mark read/unread — every
 * item here is re-derived from the current task list and the clock on every
 * call, so it can never drift from reality the way a persisted log could, and
 * an item disappears on its own the moment it stops being true (rescheduled,
 * completed, or its window passes) rather than needing to be dismissed.
 *
 * Returns a flat list, most urgent first: overdue, then in progress right
 * now, then starting soon.
 */
export function buildNotifications(tasks, reference, nowMin) {
  const overdue = overdueTasks(tasks, reference).map((task) => ({
    id: `overdue-${task.id}`,
    kind: 'overdue',
    task,
  }))

  const now = []
  const soon = []

  for (const task of tasks) {
    if (task.done || !isTimedToday(task, reference)) continue

    const end = task.startMin + task.durationMin
    if (nowMin >= task.startMin && nowMin < end) {
      now.push({ id: `now-${task.id}`, kind: 'now', task })
    } else if (task.startMin > nowMin && task.startMin - nowMin <= SOON_WINDOW_MIN) {
      soon.push({ id: `soon-${task.id}`, kind: 'soon', task, minutesUntil: task.startMin - nowMin })
    }
  }

  now.sort((a, b) => a.task.startMin - b.task.startMin)
  soon.sort((a, b) => a.minutesUntil - b.minutesUntil)

  return [...overdue, ...now, ...soon]
}
