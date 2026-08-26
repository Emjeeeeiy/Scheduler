/* Repeating tasks.
 *
 * A repeating task is ONE document, not one per day. The document carries a
 * rule and the days it lands on are computed on read, for whatever range the
 * view in front of you is showing. A daily habit therefore costs one document
 * forever instead of one per morning, and there is no backfill to run — the
 * calendar can never get ahead of what has been generated, because nothing is
 * generated until something asks.
 *
 * The rule is a set of weekdays plus an anchor day, and nothing else: no
 * interval, no end date. A personal planner's repeats are habits, and a habit
 * ends by being deleted, not by running out.
 *
 * Editing one day of a series DETACHES that day: the occurrence is written out
 * as an ordinary task of its own and the series marks the date taken. That is
 * what keeps expansion pure — occurrenceOn only ever asks a rule "do you land
 * here", never "did something from another day get moved onto you".
 */

import { DAY_LONG, DAY_SHORT, WEEK_STARTS_ON, dayOfMonth, fromKey, isValidKey, weekdayOf } from './date.js'

export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
export const WEEKDAYS = [1, 2, 3, 4, 5]
export const WEEKENDS = [0, 6]

/* Two rule shapes, told apart by `freq`:

     { freq: 'weekly',  days: [0..6],            anchor }
     { freq: 'monthly', weekday: 0..6, nth: n,   anchor }

   `nth` is 1–4 for "the first/second/third/fourth <weekday> of the month" and
   LAST (-1) for "the last one", which is what people usually mean and is the
   only form that behaves the same in a month with four of them and one with
   five.

   Documents written before monthly existed carry no `freq` at all, so a
   missing one reads as 'weekly' — that is load-bearing, not a courtesy: every
   repeating task already in Firestore is one of those. */
export const WEEKLY = 'weekly'
export const MONTHLY = 'monthly'
export const LAST = -1

/** A Firestore auto-id is 20 alphanumerics, so '~' can never occur inside one
    and can separate a series id from an occurrence's day unambiguously. */
const SEP = '~'

export function occurrenceId(seriesId, key) {
  return `${seriesId}${SEP}${key}`
}

/** The series and day an occurrence id names, or null for an ordinary task id. */
export function parseOccurrenceId(id) {
  if (typeof id !== 'string') return null
  const at = id.indexOf(SEP)
  if (at <= 0) return null
  const dateKey = id.slice(at + 1)
  return isValidKey(dateKey) ? { seriesId: id.slice(0, at), dateKey } : null
}

/* ------------------------------------------------------------ the rule -- */

/** Weekday indices in the app's display order, Monday first. */
export function orderedDays(days) {
  const position = (day) => (day - WEEK_STARTS_ON + 7) % 7
  return [...days].sort((a, b) => position(a) - position(b))
}

/** Which occurrence of its own weekday a date is within its month: the 2nd
    Saturday returns 2. Pure arithmetic on the day of the month — every 7 days
    is one more of the same weekday, so no calendar walking is needed. */
export function nthWeekdayOfMonth(key) {
  return Math.floor((dayOfMonth(key) - 1) / 7) + 1
}

/** Whether a date is the last of its weekday in its month — true when adding a
    week would land in the next one. */
export function isLastWeekdayOfMonth(key) {
  const date = fromKey(key)
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  return dayOfMonth(key) + 7 > daysInMonth
}

export function normalizeRecurrence(raw, date) {
  // A rule with no day to repeat from has nothing to anchor to, so a task in
  // the inbox is never a series — scheduling it is what can make it one.
  if (!raw || !isValidKey(date)) return null
  const anchor = isValidKey(raw.anchor) ? raw.anchor : date

  if (raw.freq === MONTHLY) {
    const weekday = Number.isInteger(raw.weekday) && raw.weekday >= 0 && raw.weekday <= 6
      ? raw.weekday
      : weekdayOf(anchor)
    // 1–4 or LAST. A stored 5 would silently skip the months that have only
    // four, so it collapses to LAST, which is what "the 5th" always meant.
    const nth = raw.nth === LAST || (Number.isInteger(raw.nth) && raw.nth >= 1 && raw.nth <= 4)
      ? raw.nth
      : LAST
    return { freq: MONTHLY, weekday, nth, anchor }
  }

  const days = Array.isArray(raw.days)
    ? [...new Set(raw.days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort()
    : []
  if (days.length === 0) return null
  // Written explicitly from here on, but read tolerantly: see the note on
  // WEEKLY above for why a stored rule may not have one.
  return { freq: WEEKLY, days, anchor }
}

/** Per-day exceptions, keyed by day key: a day the user ticked off, or one
    that has been detached into a document of its own. Anything else is dropped
    rather than trusted — this map is read off a disk like every other field. */
export function normalizeOverrides(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const out = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!isValidKey(key) || !value || typeof value !== 'object') continue
    if (value.detached === true) out[key] = { detached: true }
    else if (value.done === true) {
      out[key] = { done: true, completedAt: Number.isFinite(value.completedAt) ? value.completedAt : null }
    }
  }
  return out
}

export function occursOn(recurrence, key) {
  if (!recurrence) return false
  // Day keys sort correctly as strings, which is the whole reason they are
  // strings — no Date is built to answer "is this before the anchor".
  if (key < recurrence.anchor) return false

  if (recurrence.freq === MONTHLY) {
    if (weekdayOf(key) !== recurrence.weekday) return false
    return recurrence.nth === LAST
      ? isLastWeekdayOfMonth(key)
      : nthWeekdayOfMonth(key) === recurrence.nth
  }

  // No freq means a rule written before monthly existed — weekly.
  return Array.isArray(recurrence.days) && recurrence.days.includes(weekdayOf(key))
}

/** The task a series produces on `key`, or null when it does not land there or
    that day has been detached. */
export function occurrenceOn(series, key) {
  if (!occursOn(series.recurrence, key)) return null
  const override = series.overrides?.[key]
  if (override?.detached) return null

  const { overrides: _overrides, ...fields } = series
  const done = override?.done === true
  return {
    ...fields,
    id: occurrenceId(series.id, key),
    seriesId: series.id,
    occurrenceDate: key,
    date: key,
    done,
    completedAt: done ? override.completedAt ?? null : null,
  }
}

/* ----------------------------------------------------------- the label -- */

const sameSet = (a, b) => a.length === b.length && b.every((d) => a.includes(d))

/** Which chip in the Repeat row a rule is wearing. */
export function presetOf(recurrence) {
  if (!recurrence) return 'none'
  if (recurrence.freq === MONTHLY) return 'monthly'
  const days = recurrence.days ?? []
  if (days.length === 7) return 'daily'
  if (sameSet(days, WEEKDAYS)) return 'weekdays'
  if (sameSet(days, WEEKENDS)) return 'weekends'
  return 'custom'
}

/** The rule a preset chip produces for a given day, or null for "Never". */
export function recurrenceForPreset(preset, date) {
  const anchor = isValidKey(date) ? date : null
  if (!anchor) return null
  const weekly = (days) => ({ freq: WEEKLY, days, anchor })
  if (preset === 'daily') return weekly(EVERY_DAY)
  if (preset === 'weekdays') return weekly(WEEKDAYS)
  if (preset === 'weekends') return weekly(WEEKENDS)
  if (preset === 'custom') return weekly([weekdayOf(anchor)])
  if (preset === 'monthly') {
    /* Seeded from the day in the form, so picking "Monthly" on the 2nd
       Saturday means exactly that rather than a default the user has to
       correct. A 5th lands on LAST for the reason given in normalizeRecurrence. */
    const nth = nthWeekdayOfMonth(anchor)
    return {
      freq: MONTHLY,
      weekday: weekdayOf(anchor),
      nth: nth >= 5 || isLastWeekdayOfMonth(anchor) ? LAST : nth,
      anchor,
    }
  }
  return null
}

const ORDINAL = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [LAST]: 'last' }

/** 'Every day' · 'Every weekend' · 'Every Mon, Wed & Fri' · 'Every second Saturday of the month' */
export function recurrenceLabel(recurrence) {
  if (!recurrence) return 'Does not repeat'
  if (recurrence.freq === MONTHLY) {
    return `Every ${ORDINAL[recurrence.nth] ?? 'last'} ${DAY_LONG[recurrence.weekday]} of the month`
  }
  const days = recurrence.days ?? []
  const preset = presetOf(recurrence)
  if (preset === 'daily') return 'Every day'
  if (preset === 'weekdays') return 'Every weekday'
  if (preset === 'weekends') return 'Every weekend'
  const names = orderedDays(days).map((day) => DAY_SHORT[day])
  if (names.length === 1) return `Every ${DAY_LONG[days[0]]}`
  return `Every ${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

/* --------------------------------------------------------- events -------- */

/**
 * The event a series produces on `key`, or null when it does not land there.
 *
 * The task twin above carries `done` and `completedAt` through its overrides;
 * an event has neither, so the only exception an event occurrence can wear is
 * `detached` — the day was edited or deleted on its own and now lives as a
 * document. That is the whole difference, and it is why this is eight lines
 * rather than a flag threaded through occurrenceOn.
 *
 * An occurrence is always a single day: `startDate` and `endDate` both collapse
 * onto `key`. Only single-day events may repeat — see the note in EventEditor.
 */
export function eventOccurrenceOn(series, key) {
  if (!occursOn(series.recurrence, key)) return null
  if (series.overrides?.[key]?.detached) return null

  const { overrides: _overrides, ...fields } = series
  return {
    ...fields,
    id: occurrenceId(series.id, key),
    seriesId: series.id,
    occurrenceDate: key,
    startDate: key,
    endDate: key,
  }
}
