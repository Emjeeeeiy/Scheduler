import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  NOTE_PLAN_LIMIT,
  carryOverTarget,
  isValidAiPlan,
  placeNoteTasks,
  planDay,
  suggestSlots,
} from '@cadence/shared/autoSchedule.js'
import { addDays } from '@cadence/shared/date.js'

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

describe('isValidAiPlan', () => {
  const tasks = [
    { id: 't1', durationMin: 60 },
    { id: 't2', durationMin: 30 },
  ]
  const slots = [
    { startMin: 9 * 60, endMin: 11 * 60 },
    { startMin: 14 * 60, endMin: 15 * 60 },
  ]

  it('accepts a plan whose every placement fits a real slot with no overlap', () => {
    const plan = [
      { taskId: 't1', startMin: 9 * 60 },
      { taskId: 't2', startMin: 14 * 60 },
    ]
    assert.equal(isValidAiPlan(plan, { tasks, slots }), true)
  })

  it('accepts back-to-back placements that exactly abut, inside one slot', () => {
    // t1 (60min) then t2 (30min) end to end inside the 9-11 slot.
    const plan = [
      { taskId: 't1', startMin: 9 * 60 },
      { taskId: 't2', startMin: 10 * 60 },
    ]
    assert.equal(isValidAiPlan(plan, { tasks, slots }), true)
  })

  it('rejects a placement naming a task id it was never offered', () => {
    const plan = [{ taskId: 'ghost', startMin: 9 * 60 }]
    assert.equal(isValidAiPlan(plan, { tasks, slots }), false)
  })

  it('rejects a placement that overflows past the end of its slot', () => {
    // t1 needs 60min; starting at 10:30 in the 9-11 slot only leaves 30.
    const plan = [{ taskId: 't1', startMin: 10 * 60 + 30 }]
    assert.equal(isValidAiPlan(plan, { tasks, slots }), false)
  })

  it('rejects a placement that starts before any real slot begins', () => {
    const plan = [{ taskId: 't1', startMin: 8 * 60 }]
    assert.equal(isValidAiPlan(plan, { tasks, slots }), false)
  })

  it('rejects a placement straddling the gap between two slots', () => {
    // Starts inside the 9-11 slot but runs past it into dead time — no
    // single real slot contains the whole span.
    const plan = [{ taskId: 't1', startMin: 10 * 60 + 45 }]
    assert.equal(isValidAiPlan(plan, { tasks, slots }), false)
  })

  it('rejects two placements that overlap each other, even if each alone would fit', () => {
    const plan = [
      { taskId: 't1', startMin: 9 * 60 }, // 9:00-10:00
      { taskId: 't2', startMin: 9 * 60 + 30 }, // 9:30-10:00 — overlaps t1
    ]
    assert.equal(isValidAiPlan(plan, { tasks, slots }), false)
  })

  it('rejects the same task placed twice', () => {
    const plan = [
      { taskId: 't1', startMin: 9 * 60 },
      { taskId: 't1', startMin: 14 * 60 },
    ]
    assert.equal(isValidAiPlan(plan, { tasks, slots }), false)
  })

  it('rejects a non-integer or missing startMin', () => {
    assert.equal(isValidAiPlan([{ taskId: 't1', startMin: 540.5 }], { tasks, slots }), false)
    assert.equal(isValidAiPlan([{ taskId: 't1' }], { tasks, slots }), false)
  })

  it('is invalid — not just empty — for an empty or malformed proposal', () => {
    // Deliberately false, not true: "nothing to show" and "safe to show
    // nothing" are different questions, and a caller checking `=== false`
    // to fall back must get false here, not an accidental pass.
    assert.equal(isValidAiPlan([], { tasks, slots }), false)
    assert.equal(isValidAiPlan(null, { tasks, slots }), false)
    assert.equal(isValidAiPlan(undefined, { tasks, slots }), false)
  })

  it('discards the whole plan when only one placement is bad, not just that one', () => {
    const plan = [
      { taskId: 't1', startMin: 9 * 60 }, // genuinely valid on its own
      { taskId: 'ghost', startMin: 14 * 60 }, // invalid
    ]
    assert.equal(isValidAiPlan(plan, { tasks, slots }), false)
  })
})

describe('placeNoteTasks', () => {
  // 7 AM to 10 PM is the default window of an empty day (see visibleWindow).
  const item = (title, extra = {}) => ({ title, date: null, startMin: null, durationMin: null, ...extra })
  const place = (items, options = {}) =>
    placeNoteTasks(items, {
      planningDay: START,
      today: START,
      nowMin: 0,
      dayItems: () => [],
      ...options,
    })
  const overlaps = (a, b) => a.startMin < b.startMin + b.durationMin && b.startMin < a.startMin + a.durationMin

  it('keeps a time the writer stated, on the planning day when no day was stated', () => {
    const [row] = place([item('Call Ana', { startMin: 15 * 60, durationMin: 45 })])
    assert.deepEqual(
      { kind: row.kind, date: row.date, startMin: row.startMin, durationMin: row.durationMin },
      { kind: 'stated', date: START, startMin: 15 * 60, durationMin: 45 },
    )
  })

  it('fits the rest into free time in the order they were written, with room between', () => {
    const rows = place([item('First'), item('Second')])
    assert.deepEqual(rows.map((r) => r.kind), ['fitted', 'fitted'])
    assert.equal(rows[0].startMin, 7 * 60)
    // 30 minutes (the default length) plus the 10 minutes of breathing room.
    assert.equal(rows[1].startMin, 7 * 60 + 40)
    assert.deepEqual(rows.map((r) => r.date), [START, START])
  })

  it('fits around what is already on the day', () => {
    const rows = place([item('Fit me')], { dayItems: () => [timed(7 * 60, 120)] })
    assert.equal(rows[0].startMin, 9 * 60)
  })

  it('fits around the writer’s own stated times too, never on top of one', () => {
    const rows = place([
      item('Gym', { startMin: 8 * 60, durationMin: 60 }),
      item('One'),
      item('Two'),
      item('Three'),
    ])
    const [gym, ...loose] = rows
    assert.equal(gym.kind, 'stated')
    for (const row of loose) {
      assert.equal(row.kind, 'fitted')
      assert.equal(overlaps(row, gym), false)
    }
    for (let i = 0; i < loose.length; i += 1) {
      for (let j = i + 1; j < loose.length; j += 1) assert.equal(overlaps(loose[i], loose[j]), false)
    }
  })

  it('never fits into the part of today that has already gone', () => {
    const rows = place([item('Soon')], { nowMin: 10 * 60 })
    assert.ok(rows[0].startMin >= 10 * 60)
  })

  it('does not hold a future day to "now"', () => {
    const later = addDays(START, 3)
    const rows = place([item('Later', { date: later })], { nowMin: 20 * 60 })
    assert.equal(rows[0].date, later)
    assert.equal(rows[0].kind, 'fitted')
    assert.equal(rows[0].startMin, 7 * 60)
  })

  it('moves a stated day that is already past onto today', () => {
    const rows = place([item('Old news', { date: '2026-08-01' })])
    assert.equal(rows[0].date, START)
  })

  it('keeps the day the writer named when nothing fits there, with no time', () => {
    const later = addDays(START, 2)
    const rows = place([item('Squeezed', { date: later })], {
      dayItems: (key) => (key === later ? [timed(7 * 60, 15 * 60)] : []),
    })
    assert.deepEqual(
      { kind: rows[0].kind, date: rows[0].date, startMin: rows[0].startMin },
      { kind: 'untimed', date: later, startMin: null },
    )
  })

  it('sends a task with no day to the inbox when nothing fits', () => {
    const rows = place([item('Nowhere')], { dayItems: () => [timed(7 * 60, 15 * 60)] })
    assert.deepEqual(
      { kind: rows[0].kind, date: rows[0].date, startMin: rows[0].startMin },
      { kind: 'inbox', date: null, startMin: null },
    )
  })

  it('holds back a task the day already has, ignoring case, spacing and trailing punctuation', () => {
    const rows = place([item('  call   ANA! '), item('Something new')], {
      dayItems: () => [{ title: 'Call Ana', startMin: null, durationMin: 30 }],
    })
    assert.deepEqual(rows.map((r) => [r.duplicate, r.include]), [[true, false], [false, true]])
  })

  it('proposes the same task written twice once, and skips lines with no title', () => {
    const rows = place([item('Buy milk'), item('buy milk.'), item('   '), item(''), item('Buy eggs')])
    assert.deepEqual(rows.map((r) => r.title), ['Buy milk', 'Buy eggs'])
  })

  it('takes a default length when the length is missing or out of range', () => {
    const rows = place([
      item('None'),
      item('Tiny', { durationMin: 2 }),
      item('Huge', { durationMin: 99999 }),
      item('Fine', { durationMin: 45 }),
    ])
    assert.deepEqual(rows.map((r) => r.durationMin), [30, 30, 30, 45])
  })

  it('ignores a start time that is not a minute of the day', () => {
    const rows = place([item('Odd', { startMin: 2000 }), item('Odder', { startMin: -5 })])
    assert.ok(rows.every((r) => r.kind === 'fitted'))
  })

  it('proposes at most the limit', () => {
    const many = Array.from({ length: 40 }, (_, i) => item(`Task ${i}`))
    assert.equal(place(many).length, NOTE_PLAN_LIMIT)
    assert.equal(place(many, { limit: 3 }).length, 3)
  })

  it('is empty for nothing at all', () => {
    assert.deepEqual(place([]), [])
    assert.deepEqual(place(null), [])
    assert.deepEqual(place(undefined), [])
  })
})

describe('carryOverTarget', () => {
  it('carries a past day’s leftovers to today', () => {
    assert.equal(carryOverTarget('2026-08-20', START), START)
  })

  it('carries today’s leftovers to tomorrow', () => {
    assert.equal(carryOverTarget(START, START), addDays(START, 1))
  })

  it('has nowhere to carry from a day that has not happened yet', () => {
    assert.equal(carryOverTarget(addDays(START, 1), START), null)
  })

  it('has nowhere to carry from something that is not a day', () => {
    assert.equal(carryOverTarget(null, START), null)
    assert.equal(carryOverTarget('someday', START), null)
    assert.equal(carryOverTarget(START, 'whenever'), null)
  })
})
