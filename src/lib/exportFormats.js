/* Serializers for getting a schedule out of Cadence in a shape something
 * else can read: a spreadsheet (CSV) and a calendar (iCalendar/.ics).
 *
 * Both are pure string builders over the same normalized task/event shapes
 * the rest of the app passes around, so they are unit tested directly (see
 * tests/exportFormats.test.js) rather than only through a download button.
 *
 * The JSON export in SettingsModal stays the round-trippable one — it is the
 * only format here that can be imported back, because it is the only one
 * that keeps every field. These two are deliberately lossy exports for other
 * tools, not backups.
 */

import { DEFAULT_EVENT_DURATION_MIN } from './normalize.js'
import { INTERVAL, LAST, MONTHLY } from './recurrence.js'

/* ------------------------------------------------------------------ csv -- */

/** RFC 4180: a field containing a quote, comma, or newline is wrapped in
    quotes, and its own quotes are doubled. Everything else goes through
    untouched — quoting every field would be valid too, but makes the file
    noticeably worse to read in a plain text editor. */
function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return /["\n\r,]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function csvRow(cells) {
  return cells.map(csvCell).join(',')
}

const CSV_HEADER = [
  'kind',
  'title',
  'tag',
  'date',
  'end date',
  'start time',
  'end time',
  'duration (min)',
  'priority',
  'done',
  'repeats',
  'notes',
]

/** Minutes from midnight as `HH:MM`, or '' for an all-day item. Local by
    construction — a day key plus a minute offset never becomes a Date here,
    for the same reason it never does anywhere else in this codebase. */
function clockCell(min) {
  if (!Number.isFinite(min)) return ''
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

/**
 * One flat table of every task and event — the shape a spreadsheet wants,
 * where each row stands on its own and nothing is nested.
 *
 * A repeating item is written as its RULE, one row, exactly as the item
 * index lists it: expanding a daily habit into a row per morning would make
 * the file unbounded and would still be wrong the moment the rule changed.
 * The `repeats` column carries the rule in words so the row is not silently
 * mistaken for a one-off.
 */
export function toCsv({ tasks = [], events = [], tags = [] }, recurrenceLabel) {
  const tagName = new Map(tags.map((t) => [t.id, t.name]))
  const lines = [csvRow(CSV_HEADER)]

  for (const task of tasks) {
    lines.push(
      csvRow([
        'task',
        task.title,
        tagName.get(task.tagId) ?? '',
        task.date ?? '',
        '',
        clockCell(task.startMin),
        Number.isFinite(task.startMin) ? clockCell(task.startMin + task.durationMin) : '',
        task.durationMin,
        task.priority,
        task.done ? 'yes' : 'no',
        task.recurrence ? recurrenceLabel(task.recurrence) : '',
        task.notes,
      ]),
    )
  }

  for (const event of events) {
    lines.push(
      csvRow([
        'event',
        event.title,
        tagName.get(event.tagId) ?? '',
        event.startDate ?? '',
        event.endDate ?? '',
        clockCell(event.startMin),
        clockCell(event.endMin),
        event.durationMin ?? '',
        '',
        '',
        event.recurrence ? recurrenceLabel(event.recurrence) : '',
        event.notes,
      ]),
    )
  }

  // A trailing newline: POSIX tools treat a file whose last line lacks one as
  // malformed, and every spreadsheet importer ignores the empty final line.
  return `${lines.join('\r\n')}\r\n`
}

/* ------------------------------------------------------------- icalendar -- */

/** RFC 5545 §3.3.11: backslash, semicolon and comma are escaped, and a real
    newline becomes a literal `\n`. Order matters — backslashes first, or the
    escapes this adds would themselves be escaped. */
function icsText(value) {
  return String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll(/\r\n|\r|\n/g, '\\n')
}

/** RFC 5545 §3.1: no line may exceed 75 octets, and a continuation starts
    with a single space. Measured in UTF-8 bytes rather than characters,
    since that is what the limit actually counts — an emoji in a task title
    is four octets, not one. */
function foldLine(line) {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line

  const out = []
  let current = ''
  let width = 0
  let limit = 75
  // Iterated by code point, not by index: `line[i]` would hand back half of
  // a surrogate pair, and an emoji split down the middle is not a character
  // any reader can put back together.
  for (const char of line) {
    const size = encoder.encode(char).length
    if (width + size > limit) {
      out.push(current)
      current = ''
      width = 0
      // Continuation lines spend one of their octets on the leading space.
      limit = 74
    }
    current += char
    width += size
  }
  out.push(current)
  return out.join('\r\n ')
}

const ICS_DAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

/** `YYYY-MM-DD` → `YYYYMMDD`, the DATE form used for all-day items. */
const icsDate = (key) => key.replaceAll('-', '')

/** A local date-time, written WITHOUT a trailing Z. That is deliberate: the
    app stores a wall-clock minute on a day, never an instant, so declaring
    it as UTC would shift every block by the reader's offset. A floating
    time is exactly what "9am, whatever zone you're in" means in RFC 5545. */
function icsDateTime(key, min) {
  const hh = String(Math.floor(min / 60)).padStart(2, '0')
  const mm = String(min % 60).padStart(2, '0')
  return `${icsDate(key)}T${hh}${mm}00`
}

/** Cadence's rule shapes as an RRULE. Weekly is the default for a rule with
    no `freq`, matching how occursOn reads one (see recurrence.js). */
function icsRrule(recurrence) {
  if (!recurrence) return null
  const parts = []

  if (recurrence.freq === MONTHLY) {
    const nth = recurrence.nth === LAST ? -1 : recurrence.nth
    parts.push('FREQ=MONTHLY', `BYDAY=${nth}${ICS_DAY[recurrence.weekday]}`)
  } else if (recurrence.freq === INTERVAL) {
    parts.push(recurrence.unit === 'week' ? 'FREQ=WEEKLY' : 'FREQ=DAILY')
    if (recurrence.everyN > 1) parts.push(`INTERVAL=${recurrence.everyN}`)
  } else {
    if (!Array.isArray(recurrence.days) || recurrence.days.length === 0) return null
    parts.push('FREQ=WEEKLY', `BYDAY=${recurrence.days.map((d) => ICS_DAY[d]).join(',')}`)
  }

  /* UNTIL is inclusive of the whole final day. The rule's own `until` is a
     day key meaning "this day still counts," so it is written as the DATE
     form rather than a midnight instant that would cut that day out. */
  if (recurrence.until) parts.push(`UNTIL=${icsDate(recurrence.until)}`)
  return parts.join(';')
}

/** DTEND is exclusive in RFC 5545, so an all-day item ending "on" a day runs
    to the day after it. Kept as a named helper because getting this wrong
    silently drops the last day of every multi-day event. */
function nextDay(key) {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d + 1)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}

function vevent({ uid, stamp, title, notes, tagName, start, end, rrule }) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    ...start,
    ...end,
    `SUMMARY:${icsText(title)}`,
  ]
  if (notes) lines.push(`DESCRIPTION:${icsText(notes)}`)
  if (tagName) lines.push(`CATEGORIES:${icsText(tagName)}`)
  if (rrule) lines.push(`RRULE:${rrule}`)
  lines.push('END:VEVENT')
  return lines
}

/**
 * A static .ics file of every dated task and every event.
 *
 * Static, not a live feed: a calendar app subscribing to a URL needs a
 * public endpoint to poll, which this app has no server to provide (that is
 * a Phase 6 item). This is the "export once, import into Google Calendar"
 * shape, and re-exporting produces a fresh file rather than updating one.
 *
 * Inbox tasks are skipped outright — a task with no date has nothing to be
 * scheduled at, and an .ics entry has to land somewhere.
 */
export function toIcs({ tasks = [], events = [], tags = [] }, stampMs = Date.now()) {
  const tagName = new Map(tags.map((t) => [t.id, t.name]))
  // One DTSTAMP for the whole file: every line of it was generated at the
  // same moment, and per-entry stamps would only add noise to a diff.
  const stamp = new Date(stampMs).toISOString().replace(/[-:]|\.\d{3}/g, '')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cadence//Scheduler//EN',
    'CALSCALE:GREGORIAN',
  ]

  for (const task of tasks) {
    if (!task.date) continue
    const timed = Number.isFinite(task.startMin)
    lines.push(
      ...vevent({
        uid: `task-${task.id}@cadence`,
        stamp,
        title: task.title,
        notes: task.notes,
        tagName: tagName.get(task.tagId),
        start: timed
          ? [`DTSTART:${icsDateTime(task.date, task.startMin)}`]
          : [`DTSTART;VALUE=DATE:${icsDate(task.date)}`],
        end: timed
          ? [`DTEND:${icsDateTime(task.date, Math.min(1439, task.startMin + task.durationMin))}`]
          : [`DTEND;VALUE=DATE:${nextDay(task.date)}`],
        rrule: icsRrule(task.recurrence),
      }),
    )
  }

  for (const event of events) {
    if (!event.startDate) continue
    const timed = Number.isFinite(event.startMin)
    const endMin = Number.isFinite(event.endMin)
      ? event.endMin
      : Math.min(1439, (event.startMin ?? 0) + (event.durationMin ?? DEFAULT_EVENT_DURATION_MIN))
    lines.push(
      ...vevent({
        uid: `event-${event.id}@cadence`,
        stamp,
        title: event.title,
        notes: event.notes,
        tagName: tagName.get(event.tagId),
        start: timed
          ? [`DTSTART:${icsDateTime(event.startDate, event.startMin)}`]
          : [`DTSTART;VALUE=DATE:${icsDate(event.startDate)}`],
        /* A timed event is single-day by construction (normalizeEvent drops
           an end time the moment a span covers more than one day), so its
           end sits on the start date. An all-day one runs to the day after
           its last, since DTEND is exclusive. */
        end: timed
          ? [`DTEND:${icsDateTime(event.startDate, endMin)}`]
          : [`DTEND;VALUE=DATE:${nextDay(event.endDate ?? event.startDate)}`],
        rrule: icsRrule(event.recurrence),
      }),
    )
  }

  lines.push('END:VCALENDAR')
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}
