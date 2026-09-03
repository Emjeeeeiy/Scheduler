import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { planDay, suggestSlots } from '../src/lib/autoSchedule.js'
import { addDays } from '../src/lib/date.js'

const START = '2026-08-24'

const timed = (startMin, durationMin) => ({ startMin, durationMin })

describe('suggestSlots', () => {
  it('finds the first open slot on the starting day', () => {
    // visibleWindow defaults to 7am-10pm with nothing scheduled.
    const out = suggestSlots({ fromKey: START, durationMin: 60, dayItems: () => [] })
    assert.equal(out.length, 3)
    assert.equal(out[0].date, START)
    assert.equal(out[0].startMin, 7 * 60)
  })

  it('skips past what is already busy that day', () => {
    const out = suggestSlots({
      fromKey: START,
      durationMin: 60,
      dayItems: (key) => (key === START ? [timed(7 * 60, 120)] : []),
      limit: 1,
    })
    assert.equal(out[0].date, START)
    assert.equal(out[0].startMin, 9 * 60)
  })

  it('moves to the next day once today has nothing long enough left', () => {
    const out = suggestSlots({
      fromKey: START,
      durationMin: 60,
      // A single day busy solid from 7am to 10pm leaves no 60-minute gap.
      dayItems: (key) => (key === START ? [timed(7 * 60, 15 * 60)] : []),
      limit: 1,
    })
    assert.equal(out[0].date, addDays(START, 1))
  })

  it('honours working hours the same way the Day view free-slot finder does', () => {
    const out = suggestSlots({
      fromKey: START,
      durationMin: 60,
      dayItems: () => [],
      workingHours: { startMin: 9 * 60, endMin: 17 * 60 },
      limit: 1,
    })
    assert.equal(out[0].startMin, 9 * 60)
  })

  it('ignores an incomplete working-hours setting', () => {
    const out = suggestSlots({
      fromKey: START,
      durationMin: 60,
      dayItems: () => [],
      workingHours: { startMin: 9 * 60, endMin: null },
      limit: 1,
    })
    assert.equal(out[0].startMin, 7 * 60)
  })

  it('gives up after the lookahead window and returns what it found', () => {
    const out = suggestSlots({
      fromKey: START,
      durationMin: 60,
      dayItems: () => [timed(7 * 60, 15 * 60)], // every day fully busy
      lookaheadDays: 3,
    })
    assert.deepEqual(out, [])
  })

  it('is empty for a non-positive duration', () => {
    assert.deepEqual(suggestSlots({ fromKey: START, durationMin: 0, dayItems: () => [] }), [])
    assert.deepEqual(suggestSlots({ fromKey: START, durationMin: -5, dayItems: () => [] }), [])
  })
})

describe('planDay', () => {
  let nextId = 0
  const inboxTask = (overrides = {}) => ({
    id: `t${++nextId}`,
    title: 'Task',
    durationMin: 30,
    priority: 'normal',
    done: false,
    createdAt: nextId,
    ...overrides,
  })

  it('lays the inbox out across an empty day, in order, with room to breathe', () => {
    const a = inboxTask({ title: 'A', durationMin: 60 })
    const b = inboxTask({ title: 'B', durationMin: 30 })
    const out = planDay({ inbox: [a, b], dayItems: () => [], key: START })

    assert.deepEqual(
      out.map((p) => [p.task.title, p.startMin]),
      [
        ['A', 7 * 60],
        // 7:00 + 60 minutes + a 10-minute gap.
        ['B', 8 * 60 + 10],
      ],
    )
    assert.ok(out.every((p) => p.date === START))
  })

  it('works around what is already on the day', () => {
    const out = planDay({
      inbox: [inboxTask({ durationMin: 60 })],
      dayItems: () => [timed(7 * 60, 120)],
      key: START,
    })
    assert.equal(out[0].startMin, 9 * 60)
  })

  it('places higher priority first, and breaks ties by age', () => {
    const old = inboxTask({ title: 'old', createdAt: 1 })
    const recent = inboxTask({ title: 'recent', createdAt: 2 })
    const urgent = inboxTask({ title: 'urgent', priority: 'high', createdAt: 3 })
    const out = planDay({ inbox: [recent, urgent, old], dayItems: () => [], key: START })

    assert.deepEqual(
      out.map((p) => p.task.title),
      ['urgent', 'old', 'recent'],
    )
  })

  it('never proposes a slot in the past', () => {
    // Planning today at 2pm should not offer this morning back.
    const out = planDay({
      inbox: [inboxTask({ durationMin: 60 })],
      dayItems: () => [],
      key: START,
      fromMin: 14 * 60,
    })
    assert.equal(out[0].startMin, 14 * 60)
  })

  it('honours working hours', () => {
    const out = planDay({
      inbox: [inboxTask({ durationMin: 60 })],
      dayItems: () => [],
      key: START,
      workingHours: { startMin: 9 * 60, endMin: 17 * 60 },
    })
    assert.equal(out[0].startMin, 9 * 60)
  })

  it('leaves a task that does not fit in the inbox, and keeps going', () => {
    // A day has the hours it has: the long task is skipped, not squeezed in
    // or allowed to block everything behind it.
    const huge = inboxTask({ title: 'huge', durationMin: 20 * 60 })
    const small = inboxTask({ title: 'small', durationMin: 30 })
    const out = planDay({ inbox: [huge, small], dayItems: () => [], key: START })

    assert.deepEqual(
      out.map((p) => p.task.title),
      ['small'],
    )
  })

  it('skips tasks already done', () => {
    const out = planDay({
      inbox: [inboxTask({ done: true }), inboxTask({ title: 'open' })],
      dayItems: () => [],
      key: START,
    })
    assert.deepEqual(
      out.map((p) => p.task.title),
      ['open'],
    )
  })

  it('stops at the limit', () => {
    const inbox = Array.from({ length: 10 }, () => inboxTask())
    assert.equal(planDay({ inbox, dayItems: () => [], key: START, limit: 3 }).length, 3)
  })

  it('is empty for an empty inbox, or a day with no room at all', () => {
    assert.deepEqual(planDay({ inbox: [], dayItems: () => [], key: START }), [])
    assert.deepEqual(
      planDay({ inbox: [inboxTask()], dayItems: () => [timed(7 * 60, 15 * 60)], key: START }),
      [],
    )
  })

  it('is empty when working hours have already passed for the day', () => {
    const out = planDay({
      inbox: [inboxTask()],
      dayItems: () => [],
      key: START,
      workingHours: { startMin: 9 * 60, endMin: 17 * 60 },
      fromMin: 18 * 60,
    })
    assert.deepEqual(out, [])
  })
})
