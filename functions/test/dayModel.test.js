import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { expandHorizon, tasksOnDay } from '../lib/dayModel.js'

const DAY = '2026-08-24' // a Monday

const raw = (id, patch) => ({ id, title: `Task ${id}`, ...patch })

describe('tasksOnDay', () => {
  it('excludes a non-recurring task dated a different day', () => {
    const out = tasksOnDay([raw('a', { date: '2026-08-01' })], DAY)
    assert.deepEqual(out, [])
  })

  it('includes a non-recurring task dated today, and today’s occurrence, nothing else', () => {
    const plain = raw('a', { date: DAY, startMin: 540 })
    const series = raw('s1', { date: DAY, recurrence: { freq: 'interval', unit: 'day', everyN: 1, anchor: DAY } })
    const elsewhere = raw('b', { date: '2026-09-01' })
    const out = tasksOnDay([plain, series, elsewhere], DAY)
    assert.equal(out.length, 2)
    assert.ok(out.some((t) => t.id === 'a'))
    // The series' RULE document never appears here under its own id — only
    // its occurrence does, with a distinct occurrence-shaped id — matching
    // ScheduleContext's "a rule is never a thing ON the calendar" rule.
    assert.ok(!out.some((t) => t.id === 's1'))
    assert.ok(out.some((t) => t.occurrenceDate === DAY && t.seriesId === 's1'))
  })

  it('excludes a task from a different date even when it is elsewhere in the raw list', () => {
    const plain = raw('a', { date: DAY })
    const pastDue = raw('old', { date: '2026-08-01' })
    const out = tasksOnDay([plain, pastDue], DAY).map((t) => t.id)
    assert.deepEqual(out, ['a'])
  })
})

describe('expandHorizon', () => {
  it('finds a daily series on every day of the window, never on day zero', () => {
    const series = raw('s1', { date: DAY, recurrence: { freq: 'interval', unit: 'day', everyN: 1, anchor: DAY } })
    const out = expandHorizon([series], DAY, 3)
    assert.equal(out.length, 3)
    assert.deepEqual(
      out.map((t) => t.date).sort(),
      ['2026-08-25', '2026-08-26', '2026-08-27'],
    )
    // fromKey itself is excluded — "today" is tasksOnDay's job, not the
    // horizon's.
    assert.ok(!out.some((t) => t.date === DAY))
  })

  it('ignores a non-recurring task entirely', () => {
    const out = expandHorizon([raw('a', { date: '2026-08-25' })], DAY, 7)
    assert.deepEqual(out, [])
  })

  it('is empty over a zero-day window', () => {
    const series = raw('s1', { date: DAY, recurrence: { freq: 'interval', unit: 'day', everyN: 1, anchor: DAY } })
    assert.deepEqual(expandHorizon([series], DAY, 0), [])
  })
})
