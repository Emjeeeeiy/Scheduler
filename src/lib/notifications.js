import { isSeriesTemplate, overdueTasks } from './stats.js'
import { durationLabel, minToLabel, relativeDayLabel } from './date.js'

/** How far ahead "starting soon" looks. A whole day of lead time would just
    be a duplicate of the Day view; an hour is the window where a heads-up
    actually changes what you do next. */
export const SOON_WINDOW_MIN = 60

const isTimedToday = (task, reference) =>
  task.date === reference && Number.isFinite(task.startMin) && !isSeriesTemplate(task)

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
 *
 * `soonWindowMin` defaults to SOON_WINDOW_MIN so every existing call site
 * keeps working unchanged; NotificationBell passes the user's own
 * Settings → notification lead time instead.
 */
export function buildNotifications(tasks, reference, nowMin, soonWindowMin = SOON_WINDOW_MIN) {
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
    } else if (task.startMin > nowMin && task.startMin - nowMin <= soonWindowMin) {
      soon.push({ id: `soon-${task.id}`, kind: 'soon', task, minutesUntil: task.startMin - nowMin })
    }
  }

  now.sort((a, b) => a.task.startMin - b.task.startMin)
  soon.sort((a, b) => a.minutesUntil - b.minutesUntil)

  return [...overdue, ...now, ...soon]
}

/** The one line of "why this is here" text, shared by the bell panel and the
    desktop notification it can raise for the same item — so the two never
    drift into describing the same thing two different ways. */
export function describeNotification(item) {
  const { kind, task } = item
  if (kind === 'overdue') return `Overdue since ${relativeDayLabel(task.date)}`
  if (kind === 'now') return `Happening now · ${durationLabel(task.durationMin)}`
  return `Starts in ${item.minutesUntil}m · ${minToLabel(task.startMin)}`
}

/**
 * Page-context `new Notification()` throws a TypeError on nearly all mobile
 * browsers (Android Chrome: "Illegal constructor. Use
 * ServiceWorkerRegistration.showNotification() instead", iOS Safari likewise)
 * — it only ever worked on desktop. A synchronous throw inside the
 * desktop-alerts effect reaches the app's ErrorBoundary and, because the
 * opt-in is persisted in localStorage, re-crashes on every reload until that
 * stored value is cleared by hand.
 *
 * So this helper never throws: when a service-worker registration exists it
 * notifies through that (the one path mobile supports — clicks are routed by
 * sw.js's notificationclick handler), otherwise it falls back to the
 * constructor for desktop, and when neither works it resolves false so the
 * caller can simply move on. Fire-and-forget with `void` at call sites.
 */
export async function showLocalNotification(title, options = {}) {
  // Brand default: every device notification wears the project's own PWA
  // icon (see public/manifest.webmanifest) unless a caller passes its own.
  // Without this the OS shows a generic globe/chrome glyph. `badge` is the
  // small Android status-bar glyph; the same asset is fine for both.
  const branded = { icon: '/icon-192.png', badge: '/icon-192.png', ...options }
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration()
      if (registration) {
        await registration.showNotification(title, branded)
        return true
      }
    }
  } catch {
    /* fall through to the constructor path */
  }
  try {
    const notification = new Notification(title, branded)
    notification.onclick = () => window.focus()
    return true
  } catch {
    return false
  }
}
