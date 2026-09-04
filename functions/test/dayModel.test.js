import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { expandHorizon, tasksForNotifications, tasksOnDay } from '../lib/dayModel.js'

const DAY = '2026-08-24' // a Monday

const raw = (id, patch) => ({ id, title: `Task ${id}`, ...patch })

describe('tasksForNotifications', () => {
  it('passes a plain, non-recurring task straight through', () => {
    const out = tasksForNotifications([raw('a', { date: DAY, startMin: 540 })], DAY)
    assert.equal(out.length, 1)
    assert.equal(out[0].id, 'a')
    assert.equal(out[0].date, DAY)
  })

  it('keeps a non-recurring task from any date — overdue detection needs the whole list', () => {
    const out = tasksForNotifications([raw('a', { date: '2026-08-01' })], DAY)
    assert.equal(out.length, 1)
    assert.equal(out[0].date, '2026-08-01')
  })

  it('expands a daily series into an occurrence landing on today', () => {
    const series = raw('s1', { date: DAY, startMin: 540, recurrence: { freq: 'interval', unit: 'day', everyN: 1, anchor: DAY } })
    const out = tasksForNotifications([series], DAY)
    // Both the rule itself (as a plain normalized task) and its occurrence
    // for today are present — exactly the shape NotificationBell builds
    // with [...tasks, ...occurrencesOn(key)].
    assert.equal(out.length, 2)
    const occurrence = out.find((t) => t.occurrenceDate === DAY)
    assert.ok(occurrence)
    assert.equal(occurrence.seriesId, 's1')
    assert.equal(occurrence.startMin, 540)
  })

  it('does not manufacture an occurrence for a day the rule does not land on', () => {
    // Anchored on DAY, every 2 days — the very next day should not occur.
    const series = raw('s1', {
      date: DAY,
      recurrence: { freq: 'interval', unit: 'day', everyN: 2, anchor: DAY },
    })
    const tomorrow = '2026-08-25'
    const out = tasksForNotifications([series], tomorrow)
    assert.equal(out.filter((t) => t.occurrenceDate).length, 0)
  })

  it('coerces a half-written Firestore doc rather than crashing on it', () => {
    const out = tasksForNotifications([{ id: 'broken' }], DAY)
    assert.equal(out.length, 1)
    assert.equal(out[0].title, 'Untitled task')
    assert.equal(out[0].date, null)
  })
})

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

  it('is a strict subset of tasksForNotifications for the same day', () => {
    const plain = raw('a', { date: DAY })
    const pastDue = raw('old', { date: '2026-08-01' })
    const onDay = tasksOnDay([plain, pastDue], DAY).map((t) => t.id)
    const forNotifications = tasksForNotifications([plain, pastDue], DAY).map((t) => t.id)
    // pastDue belongs in the notifications scan (it's how overdue gets
    // found) but has no business in a same-day total.
    assert.ok(!onDay.includes('old'))
    assert.ok(forNotifications.includes('old'))
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
    // fromKey itself is excluded — "today" is tasksForNotifications' job,
    // not the horizon's.
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
