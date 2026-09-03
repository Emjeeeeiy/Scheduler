import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { suggestSlots } from '../src/lib/autoSchedule.js'
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
