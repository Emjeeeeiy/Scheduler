import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  addDays,
  daysBetween,
  durationLabel,
  fromKey,
  minToLabel,
  minToTimeValue,
  monthGrid,
  relativeDayLabel,
  shiftMonth,
  startOfWeek,
  timeValueToMin,
  toKey,
  weekKeys,
} from '../src/lib/date.js'

describe('day keys', () => {
  it('round-trips through a local Date', () => {
    assert.equal(toKey(fromKey('2026-08-24')), '2026-08-24')
  })

  it('parses as a LOCAL date, not UTC', () => {
    // The bug this guards: new Date('2026-08-24') is UTC midnight, which is the
    // 23rd for anyone west of Greenwich.
    const date = fromKey('2026-08-24')
    assert.equal(date.getDate(), 24)
    assert.equal(date.getMonth(), 7)
    assert.equal(date.getFullYear(), 2026)
  })

  it('crosses month and year boundaries', () => {
    assert.equal(addDays('2026-08-31', 1), '2026-09-01')
    assert.equal(addDays('2026-01-01', -1), '2025-12-31')
    assert.equal(addDays('2024-02-28', 1), '2024-02-29') // leap year
    assert.equal(addDays('2025-02-28', 1), '2025-03-01')
  })

  it('counts days between keys in both directions', () => {
    assert.equal(daysBetween('2026-08-24', '2026-08-27'), 3)
    assert.equal(daysBetween('2026-08-27', '2026-08-24'), -3)
    assert.equal(daysBetween('2026-08-24', '2026-08-24'), 0)
    assert.equal(daysBetween('2025-12-31', '2026-01-01'), 1)
  })
})

describe('weeks', () => {
  it('starts weeks on Monday', () => {
    // 2026-08-24 is a Monday.
    assert.equal(startOfWeek('2026-08-24'), '2026-08-24')
    assert.equal(startOfWeek('2026-08-30'), '2026-08-24') // the Sunday after
    assert.equal(startOfWeek('2026-08-23'), '2026-08-17') // the Sunday before
  })

  it('returns seven consecutive keys', () => {
    const keys = weekKeys('2026-08-27')
    assert.equal(keys.length, 7)
    assert.equal(keys[0], '2026-08-24')
    assert.equal(keys[6], '2026-08-30')
  })
})

describe('months', () => {
  it('does not roll past a short month when shifting', () => {
    // Naively adding a month to Jan 31 lands in March.
    assert.equal(shiftMonth('2026-01-31', 1), '2026-02-28')
    assert.equal(shiftMonth('2024-01-31', 1), '2024-02-29')
    assert.equal(shiftMonth('2026-03-31', -1), '2026-02-28')
    assert.equal(shiftMonth('2026-12-15', 1), '2027-01-15')
  })

  it('builds a 42-cell grid that starts on a Monday and covers the month', () => {
    const grid = monthGrid('2026-08-24')
    assert.equal(grid.length, 42)
    assert.equal(fromKey(grid[0]).getDay(), 1)
    assert.ok(grid.includes('2026-08-01'))
    assert.ok(grid.includes('2026-08-31'))
  })
})

describe('minutes', () => {
  it('labels the 12-hour edges correctly', () => {
    assert.equal(minToLabel(0), '12:00 AM')
    assert.equal(minToLabel(570), '9:30 AM')
    assert.equal(minToLabel(720), '12:00 PM')
    assert.equal(minToLabel(750), '12:30 PM')
    assert.equal(minToLabel(1380), '11:00 PM')
  })

  it('round-trips through an <input type="time"> value', () => {
    assert.equal(minToTimeValue(570), '09:30')
    assert.equal(timeValueToMin('09:30'), 570)
    assert.equal(timeValueToMin(''), null) // empty means "no time"
  })

  it('formats durations', () => {
    assert.equal(durationLabel(30), '30m')
    assert.equal(durationLabel(60), '1h')
    assert.equal(durationLabel(90), '1h 30m')
    assert.equal(durationLabel(0), '0m')
  })
})

describe('relative labels', () => {
  it('names the nearby days', () => {
    assert.equal(relativeDayLabel('2026-08-24', '2026-08-24'), 'Today')
    assert.equal(relativeDayLabel('2026-08-25', '2026-08-24'), 'Tomorrow')
    assert.equal(relativeDayLabel('2026-08-23', '2026-08-24'), 'Yesterday')
    assert.equal(relativeDayLabel('2026-08-29', '2026-08-24'), 'Sat, Aug 29')
  })
})
