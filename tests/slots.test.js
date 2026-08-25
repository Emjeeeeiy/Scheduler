import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { freeSlots } from '../src/lib/slots.js'

const DAY_START = 9 * 60 // 9:00
const DAY_END = 17 * 60 // 17:00

const block = (startMin, durationMin) => ({ startMin, durationMin })

describe('freeSlots', () => {
  it('offers the whole window when nothing is scheduled', () => {
    const slots = freeSlots([], DAY_START, DAY_END)
    assert.equal(slots.length, 1)
    assert.deepEqual(slots[0], { startMin: DAY_START, endMin: DAY_END, lengthMin: 8 * 60 })
  })

  it('reports the gaps around a single block', () => {
    const slots = freeSlots([block(12 * 60, 60)], DAY_START, DAY_END)
    assert.equal(slots.length, 2)
    assert.deepEqual(slots[0], { startMin: 9 * 60, endMin: 12 * 60, lengthMin: 180 })
    assert.deepEqual(slots[1], { startMin: 13 * 60, endMin: 17 * 60, lengthMin: 240 })
  })

  it('finds nothing on a fully booked day', () => {
    assert.deepEqual(freeSlots([block(DAY_START, DAY_END - DAY_START)], DAY_START, DAY_END), [])
  })

  it('does not invent a gap between blocks that touch', () => {
    const slots = freeSlots([block(9 * 60, 60), block(10 * 60, 60)], DAY_START, DAY_END)
    assert.equal(slots.length, 1)
    assert.equal(slots[0].startMin, 11 * 60)
  })

  it('merges overlapping blocks into one busy run', () => {
    // 9:00-10:30 and 10:00-11:00 overlap; the day is free from 11:00, and
    // there is no phantom gap between them.
    const slots = freeSlots([block(9 * 60, 90), block(10 * 60, 60)], DAY_START, DAY_END)
    assert.equal(slots.length, 1)
    assert.deepEqual(slots[0], { startMin: 11 * 60, endMin: 17 * 60, lengthMin: 360 })
  })

  it('does not let a block nested inside another open a gap', () => {
    /* The bug a naive between-consecutive-items scan produces: the short
       block ends before the long one does, so the "next" gap would be
       measured from the wrong end and report time that is not free. */
    const slots = freeSlots([block(9 * 60, 240), block(10 * 60, 30)], DAY_START, DAY_END)
    assert.equal(slots.length, 1)
    assert.equal(slots[0].startMin, 13 * 60)
  })

  it('ignores gaps shorter than the minimum', () => {
    // A 15-minute window between two blocks is not worth offering.
    const slots = freeSlots([block(9 * 60, 60), block(10 * 60 + 15, 105)], DAY_START, DAY_END, 30)
    assert.equal(slots.length, 1)
    assert.equal(slots[0].startMin, 12 * 60)
  })

  it('honours a custom minimum length', () => {
    const items = [block(9 * 60, 60), block(10 * 60 + 15, 105)]
    assert.equal(freeSlots(items, DAY_START, DAY_END, 15).length, 2)
  })

  it('clips busy time to the window rather than shrinking the day', () => {
    // A 5am block on a grid that starts at 9 must not mark 9:00 as busy.
    const slots = freeSlots([block(5 * 60, 120)], DAY_START, DAY_END)
    assert.equal(slots.length, 1)
    assert.equal(slots[0].startMin, DAY_START)
  })

  it('handles a block overrunning the end of the window', () => {
    const slots = freeSlots([block(16 * 60, 240)], DAY_START, DAY_END)
    assert.equal(slots.length, 1)
    assert.deepEqual(slots[0], { startMin: 9 * 60, endMin: 16 * 60, lengthMin: 420 })
  })

  it('skips items with no time of their own', () => {
    const slots = freeSlots([{ startMin: null, durationMin: 30 }], DAY_START, DAY_END)
    assert.equal(slots.length, 1)
    assert.equal(slots[0].lengthMin, 8 * 60)
  })

  it('is empty for a window with no width', () => {
    assert.deepEqual(freeSlots([], DAY_START, DAY_START), [])
  })
})
