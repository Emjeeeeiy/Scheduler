/* Date primitives for the scheduler.
 *
 * The whole app speaks two types and never a Date object across a boundary:
 *   - a *day key*, the string 'YYYY-MM-DD'
 *   - a *minute*, an integer count from local midnight (0..1439)
 *
 * That pairing is deliberate. A Timestamp is an absolute instant, so a 9:00
 * block drifts to 8:00 the moment a timezone or DST boundary moves under it.
 * "This day, this wall-clock time" is what a planner actually means, and it
 * survives travel, DST, and a server in another region untouched.
 *
 * Every Date built here uses the (y, m, d) constructor, never Date.parse of a
 * key: `new Date('2026-08-24')` is parsed as UTC and lands on the 23rd for
 * anyone west of Greenwich. That single rule is why these helpers exist.
 */

/** 0 = Sunday, 1 = Monday. Weeks start Monday so the weekend reads as a pair. */
export const WEEK_STARTS_ON = 1

export const MINUTES_PER_DAY = 1440

const pad = (n) => String(n).padStart(2, '0')

/* ------------------------------------------------------------------ keys -- */

/** Local calendar date of `date` as 'YYYY-MM-DD'. */
export function toKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Local midnight of a day key, as a Date. */
export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function todayKey() {
  return toKey(new Date())
}

export function isValidKey(key) {
  return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key)
}

export function addDays(key, days) {
  const date = fromKey(key)
  date.setDate(date.getDate() + days)
  return toKey(date)
}

/** Whole days from `a` to `b`; negative when `b` is earlier. DST-safe because
    both sides are local midnights, compared as calendar dates not elapsed ms. */
export function daysBetween(a, b) {
  const ms = fromKey(b).setHours(12, 0, 0, 0) - fromKey(a).setHours(12, 0, 0, 0)
  return Math.round(ms / 86_400_000)
}

/* ----------------------------------------------------------------- weeks -- */

/** `weekStartsOn` defaults to the app-wide constant so every existing call
    site keeps working unchanged; a caller that knows the user's own setting
    (from SettingsContext) passes it explicitly. */
export function startOfWeek(key, weekStartsOn = WEEK_STARTS_ON) {
  const date = fromKey(key)
  const shift = (date.getDay() - weekStartsOn + 7) % 7
  date.setDate(date.getDate() - shift)
  return toKey(date)
}

/** The 7 day keys of the week containing `key`, in display order. */
export function weekKeys(key, weekStartsOn = WEEK_STARTS_ON) {
  const start = startOfWeek(key, weekStartsOn)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** The N day keys ending at `key` inclusive — the window Dashboard's Trends
    section uses. */
export function lastNDays(key, n) {
  return Array.from({ length: n }, (_, i) => addDays(key, i - n + 1))
}

/** 0 = Sunday … 6 = Saturday, for the day a key names. */
export function weekdayOf(key) {
  return fromKey(key).getDay()
}

export function isWeekend(key) {
  const day = weekdayOf(key)
  return day === 0 || day === 6
}

/* ---------------------------------------------------------------- months -- */

/** 'YYYY-MM' — the month a key belongs to. */
export function monthOf(key) {
  return key.slice(0, 7)
}

export function shiftMonth(key, months) {
  const date = fromKey(key)
  const day = date.getDate()
  // Snap to the 1st before shifting: adding a month to Jan 31 would otherwise
  // roll into March. Clamp back to the shorter month's last day afterwards.
  date.setDate(1)
  date.setMonth(date.getMonth() + months)
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  date.setDate(Math.min(day, lastDay))
  return toKey(date)
}

/** 42 day keys — six full weeks covering the month of `key`, with the leading
    and trailing days of the neighbouring months included so the grid is square. */
export function monthGrid(key, weekStartsOn = WEEK_STARTS_ON) {
  const date = fromKey(key)
  const firstOfMonth = toKey(new Date(date.getFullYear(), date.getMonth(), 1))
  const start = startOfWeek(firstOfMonth, weekStartsOn)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

/* --------------------------------------------------------------- minutes -- */

export function nowMin() {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

export function clampMin(min) {
  return Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(min)))
}

/** Round to the nearest `step` minutes — the grid's snap on drag and click. */
export function snapMin(min, step = 15) {
  return clampMin(Math.round(min / step) * step)
}

/** 570 -> '9:30 AM' */
export function minToLabel(min) {
  const m = clampMin(min)
  const hour24 = Math.floor(m / 60)
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${hour12}:${pad(m % 60)} ${hour24 < 12 ? 'AM' : 'PM'}`
}

/** 540 -> '9 AM', 570 -> '9:30 AM'. For dense axes where :00 is just noise. */
export function minToShortLabel(min) {
  const m = clampMin(min)
  const hour24 = Math.floor(m / 60)
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  const suffix = hour24 < 12 ? 'AM' : 'PM'
  return m % 60 === 0 ? `${hour12} ${suffix}` : `${hour12}:${pad(m % 60)} ${suffix}`
}

/** 570 -> '09:30', the value shape <input type="time"> expects. */
export function minToTimeValue(min) {
  const m = clampMin(min)
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

/** '09:30' -> 570. Returns null for the empty input, which means "no time". */
export function timeValueToMin(value) {
  if (!value) return null
  const [h, m] = value.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return clampMin(h * 60 + m)
}

/** 90 -> '1h 30m'. Used on blocks, tiles, and the planned-hours readout. */
export function durationLabel(min) {
  const total = Math.max(0, Math.round(min))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/** Minutes as decimal hours, rounded to 1dp — the unit every stat reports in. */
export function toHours(min) {
  return Math.round((min / 60) * 10) / 10
}

/* ---------------------------------------------------------------- labels -- */

/* Indexed by getDay(), so 0 is Sunday whatever the week starts on. */
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** getDay() indices in display order — Monday first by default. Anything
    that lays out a week of weekdays walks this rather than 0..6. Functions,
    not constants, now that the start of the week is a per-account setting
    (SettingsContext) rather than fixed — a caller that hasn't wired the
    setting through yet still gets the original Monday-first order for free. */
export function weekdayOrder(weekStartsOn = WEEK_STARTS_ON) {
  return Array.from({ length: 7 }, (_, i) => (weekStartsOn + i) % 7)
}

/** Weekday initials in display order, for the month/week grid headers. */
export function weekdayHeaders(weekStartsOn = WEEK_STARTS_ON) {
  return weekdayOrder(weekStartsOn).map((day) => DAY_SHORT[day])
}

export function dayOfMonth(key) {
  return fromKey(key).getDate()
}

/** 'Mon, Aug 24' */
export function formatDayLabel(key) {
  const date = fromKey(key)
  return `${DAY_SHORT[date.getDay()]}, ${MONTH_SHORT[date.getMonth()]} ${date.getDate()}`
}

/** 'Monday, August 24, 2026' — the Today view's heading and aria labels. */
export function formatFullDayLabel(key) {
  const date = fromKey(key)
  return `${DAY_LONG[date.getDay()]}, ${MONTH_LONG[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

/** 'August 2026' */
export function formatMonthLabel(key) {
  const date = fromKey(key)
  return `${MONTH_LONG[date.getMonth()]} ${date.getFullYear()}`
}

/** 'Aug 24 – Aug 30' or 'Aug 31 – Sep 6' — the week header. */
export function formatWeekLabel(key, weekStartsOn = WEEK_STARTS_ON) {
  const keys = weekKeys(key, weekStartsOn)
  const start = fromKey(keys[0])
  const end = fromKey(keys[6])
  const left = `${MONTH_SHORT[start.getMonth()]} ${start.getDate()}`
  const right =
    start.getMonth() === end.getMonth()
      ? `${end.getDate()}`
      : `${MONTH_SHORT[end.getMonth()]} ${end.getDate()}`
  return `${left} – ${right}`
}

/** 'Today' / 'Tomorrow' / 'Yesterday', else the short day label. Relative names
    are the ones people actually navigate by, so prefer them where they apply. */
export function relativeDayLabel(key, reference = todayKey()) {
  const delta = daysBetween(reference, key)
  if (delta === 0) return 'Today'
  if (delta === 1) return 'Tomorrow'
  if (delta === -1) return 'Yesterday'
  return formatDayLabel(key)
}
