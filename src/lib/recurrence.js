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

import { DAY_LONG, DAY_SHORT, WEEK_STARTS_ON, isValidKey, weekdayOf } from './date.js'

export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
export const WEEKDAYS = [1, 2, 3, 4, 5]

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

export function normalizeRecurrence(raw, date) {
  // A rule with no day to repeat from has nothing to anchor to, so a task in
  // the inbox is never a series — scheduling it is what can make it one.
  if (!raw || !isValidKey(date)) return null
  const days = Array.isArray(raw.days)
    ? [...new Set(raw.days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort()
    : []
  if (days.length === 0) return null
  return { days, anchor: isValidKey(raw.anchor) ? raw.anchor : date }
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
  return recurrence.days.includes(weekdayOf(key))
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

export function presetOf(days) {
  if (days.length === 7) return 'daily'
  if (days.length === WEEKDAYS.length && WEEKDAYS.every((d) => days.includes(d))) return 'weekdays'
  return 'custom'
}

export function daysForPreset(preset, date) {
  if (preset === 'daily') return EVERY_DAY
  if (preset === 'weekdays') return WEEKDAYS
  if (preset === 'custom') return isValidKey(date) ? [weekdayOf(date)] : [WEEK_STARTS_ON]
  return null
}

/** 'Every day' · 'Every weekday' · 'Every Mon, Wed & Fri' */
export function recurrenceLabel(recurrence) {
  if (!recurrence) return 'Does not repeat'
  const preset = presetOf(recurrence.days)
  if (preset === 'daily') return 'Every day'
  if (preset === 'weekdays') return 'Every weekday'
  const names = orderedDays(recurrence.days).map((day) => DAY_SHORT[day])
  if (names.length === 1) return `Every ${DAY_LONG[recurrence.days[0]]}`
  return `Every ${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}
