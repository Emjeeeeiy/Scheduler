import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { toCsv, toIcs } from '../src/lib/exportFormats.js'
import { normalizeEvent, normalizeTask } from '../src/lib/normalize.js'
import { LAST, recurrenceLabel } from '../src/lib/recurrence.js'

const DAY = '2026-08-24'
const STAMP = Date.UTC(2026, 7, 24, 9, 30, 0)

const task = (raw) => normalizeTask('t1', raw)
const event = (raw) => normalizeEvent('e1', raw)

const lines = (text) => text.split('\r\n')

describe('toCsv', () => {
  it('leads with a header row and writes one row per item', () => {
    const csv = toCsv(
      { tasks: [task({ title: 'Write', date: DAY })], events: [event({ startDate: DAY })] },
      recurrenceLabel,
    )
    const rows = lines(csv).filter(Boolean)
    assert.equal(rows.length, 3)
    assert.match(rows[0], /^kind,title,tag,/)
    assert.match(rows[1], /^task,Write,/)
    assert.match(rows[2], /^event,Untitled event,/)
  })

  it('quotes a field containing a comma, quote, or newline', () => {
    const csv = toCsv({ tasks: [task({ title: 'Buy milk, eggs', notes: 'He said "hi"' })] }, recurrenceLabel)
    assert.match(csv, /"Buy milk, eggs"/)
    assert.match(csv, /"He said ""hi"""/)
  })

  it('leaves an ordinary field unquoted', () => {
    // Quoting everything would be valid CSV too, but makes the file
    // noticeably worse to read as plain text.
    const csv = toCsv({ tasks: [task({ title: 'Write' })] }, recurrenceLabel)
    assert.match(csv, /^task,Write,/m)
  })

  it('resolves a tag id to its name', () => {
    const csv = toCsv(
      { tasks: [task({ title: 'Write', tagId: 'work' })], tags: [{ id: 'work', name: 'Work' }] },
      recurrenceLabel,
    )
    assert.match(csv, /^task,Write,Work,/m)
  })

  it('writes clock times, and an end derived from duration', () => {
    const csv = toCsv(
      { tasks: [task({ title: 'Write', date: DAY, startMin: 9 * 60 + 5, durationMin: 30 })] },
      recurrenceLabel,
    )
    assert.match(csv, /,09:05,09:35,30,/)
  })

  it('leaves both clock columns empty for an all-day task', () => {
    const csv = toCsv({ tasks: [task({ title: 'Write', date: DAY })] }, recurrenceLabel)
    assert.match(csv, /,2026-08-24,,,,30,/)
  })

  it('writes a repeating item as one row carrying its rule in words', () => {
    const csv = toCsv(
      {
        tasks: [task({ title: 'Standup', date: DAY, recurrence: { days: [1, 2, 3, 4, 5] } })],
      },
      recurrenceLabel,
    )
    const rows = lines(csv).filter(Boolean)
    assert.equal(rows.length, 2)
    assert.match(rows[1], /Every weekday/)
  })
})

describe('toIcs', () => {
  it('wraps entries in a VCALENDAR', () => {
    const ics = toIcs({ tasks: [task({ title: 'Write', date: DAY })] }, STAMP)
    assert.match(ics, /^BEGIN:VCALENDAR\r\n/)
    assert.match(ics, /END:VCALENDAR\r\n$/)
    assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 1)
  })

  it('skips an inbox task, which has no day to land on', () => {
    const ics = toIcs({ tasks: [task({ title: 'Someday' })] }, STAMP)
    assert.equal(ics.includes('BEGIN:VEVENT'), false)
  })

  it('writes a timed task as a floating local time, never as UTC', () => {
    // A trailing Z would shift every block by the reader's own offset — the
    // app stores a wall-clock minute on a day, not an instant.
    const ics = toIcs({ tasks: [task({ title: 'Write', date: DAY, startMin: 540, durationMin: 60 })] }, STAMP)
    assert.match(ics, /DTSTART:20260824T090000\r\n/)
    assert.match(ics, /DTEND:20260824T100000\r\n/)
  })

  it('writes an all-day task with an exclusive end on the following day', () => {
    const ics = toIcs({ tasks: [task({ title: 'Write', date: DAY })] }, STAMP)
    assert.match(ics, /DTSTART;VALUE=DATE:20260824/)
    assert.match(ics, /DTEND;VALUE=DATE:20260825/)
  })

  it('runs an all-day event to the day after its last', () => {
    const ics = toIcs({ events: [event({ startDate: DAY, endDate: '2026-08-26' })] }, STAMP)
    assert.match(ics, /DTSTART;VALUE=DATE:20260824/)
    assert.match(ics, /DTEND;VALUE=DATE:20260827/)
  })

  it('maps a weekly rule to BYDAY', () => {
    const ics = toIcs(
      { tasks: [task({ title: 'Standup', date: DAY, recurrence: { days: [1, 3, 5] } })] },
      STAMP,
    )
    assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR/)
  })

  it('maps a monthly nth-weekday rule, including "last"', () => {
    const second = toIcs(
      {
        tasks: [
          task({ title: 'Book club', date: DAY, recurrence: { freq: 'monthly', weekday: 6, nth: 2 } }),
        ],
      },
      STAMP,
    )
    assert.match(second, /RRULE:FREQ=MONTHLY;BYDAY=2SA/)

    const last = toIcs(
      {
        tasks: [
          task({ title: 'Review', date: DAY, recurrence: { freq: 'monthly', weekday: 5, nth: LAST } }),
        ],
      },
      STAMP,
    )
    assert.match(last, /RRULE:FREQ=MONTHLY;BYDAY=-1FR/)
  })

  it('maps an interval rule to FREQ plus INTERVAL', () => {
    const days = toIcs(
      {
        tasks: [
          task({
            title: 'Water plants',
            date: DAY,
            recurrence: { freq: 'interval', unit: 'day', everyN: 3 },
          }),
        ],
      },
      STAMP,
    )
    assert.match(days, /RRULE:FREQ=DAILY;INTERVAL=3/)

    const weeks = toIcs(
      {
        tasks: [
          task({
            title: 'Deep clean',
            date: DAY,
            recurrence: { freq: 'interval', unit: 'week', everyN: 2 },
          }),
        ],
      },
      STAMP,
    )
    assert.match(weeks, /RRULE:FREQ=WEEKLY;INTERVAL=2/)
  })

  it('carries a recurrence end date through as UNTIL', () => {
    const ics = toIcs(
      {
        tasks: [
          task({ title: 'Course', date: DAY, recurrence: { days: [1], until: '2026-12-01' } }),
        ],
      },
      STAMP,
    )
    assert.match(ics, /UNTIL=20261201/)
  })

  it('escapes the characters RFC 5545 reserves', () => {
    const ics = toIcs(
      { tasks: [task({ title: 'A; B, C\\D', notes: 'line one\nline two', date: DAY })] },
      STAMP,
    )
    assert.match(ics, /SUMMARY:A\\; B\\, C\\\\D/)
    assert.match(ics, /DESCRIPTION:line one\\nline two/)
  })

  it('folds a line longer than 75 octets, continuing it with a space', () => {
    const ics = toIcs({ tasks: [task({ title: 'x'.repeat(200), date: DAY })] }, STAMP)
    for (const line of lines(ics)) {
      assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line.slice(0, 20)}…`)
    }
    // The fold is a continuation, not a break: rejoining unfolded lines has
    // to give the original summary back.
    assert.match(ics.replaceAll('\r\n ', ''), new RegExp(`SUMMARY:${'x'.repeat(200)}`))
  })

  it('never splits a surrogate pair across a fold', () => {
    const ics = toIcs({ tasks: [task({ title: '🎯'.repeat(40), date: DAY })] }, STAMP)
    for (const line of lines(ics)) {
      // A lone surrogate does not survive an encode/decode round trip; if the
      // fold split one, this comparison catches it.
      const roundTripped = new TextDecoder().decode(new TextEncoder().encode(line))
      assert.equal(roundTripped, line)
    }
  })

  it('gives every entry a stable, kind-scoped uid', () => {
    // A task and an event can share an auto-id across two collections, so
    // the kind has to be part of the uid or a calendar app would treat them
    // as the same entry.
    const ics = toIcs({ tasks: [task({ date: DAY })], events: [event({ startDate: DAY })] }, STAMP)
    assert.match(ics, /UID:task-t1@cadence/)
    assert.match(ics, /UID:event-e1@cadence/)
  })
})
