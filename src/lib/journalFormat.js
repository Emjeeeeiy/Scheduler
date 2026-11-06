/* Small display helpers for the Journal list. Kept out of the components so the
   wording is testable without rendering anything. */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

/** "just now" / "12m ago" / "3h ago" / "Yesterday" / "Tue" / "Nov 3" / "Nov 3, 2025".
    Relative while it is recent enough to be useful, a date once it is not. */
export function formatEdited(timestamp, now = Date.now()) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return ''
  const diff = now - timestamp
  if (diff < 45_000) return 'just now'
  const then = new Date(timestamp)
  const today = new Date(now)
  if (diff < HOUR) return `${Math.max(1, Math.round(diff / MINUTE))}m ago`
  if (sameDay(then, today)) return `${Math.round(diff / HOUR)}h ago`
  const yesterday = new Date(now - DAY)
  if (sameDay(then, yesterday)) return 'Yesterday'
  if (diff < 6 * DAY) return then.toLocaleDateString(undefined, { weekday: 'short' })
  const sameYear = then.getFullYear() === today.getFullYear()
  return then.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** "1 note" / "3 notes". */
export const noteCountLabel = (count) => `${count} ${count === 1 ? 'note' : 'notes'}`

/** The size of a body in a form a person reads: "312 KB". */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes < 1024) return '<1 KB'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
