import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { dayOfSpan, eventSpanDays, isMultiDay, packSpans } from '../src/lib/spans.js'
import { weekKeys } from '../src/lib/date.js'

/* A fixed Monday, so every case reads against a known week rather than
   whatever day the suite happens to run on. */
const WEEK = weekKeys('2026-08-24') // Mon 2026-08-24 .. Sun 2026-08-30

const event = (id, startDate, endDate = startDate, patch = {}) => ({
  id,
  title: `Event ${id}`,
  startDate,
  endDate,
  startMin: null,
  endMin: null,
  durationMin: null,
  tagId: null,
  ...patch,
})

const laneOf = (result, id) => result.segments.find((s) => s.event.id === id)?.lane
const segmentOf = (result, id) => result.segments.find((s) => s.event.id === id)

describe('packSpans', () => {
  it('places a single-day event on one column of lane 0', () => {
    const result = packSpans(WEEK, [event('a', '2026-08-26')])
    const segment = segmentOf(result, 'a')
    assert.equal(segment.lane, 0)
    assert.equal(segment.startIndex, 2)
    assert.equal(segment.endIndex, 2)
    assert.equal(result.lanesUsed, 1)
  })

  it('spans a multi-day event across the columns it covers', () => {
    const result = packSpans(WEEK, [event('a', '2026-08-25', '2026-08-28')])
    const segment = segmentOf(result, 'a')
    assert.equal(segment.startIndex, 1)
    assert.equal(segment.endIndex, 4)
    assert.equal(segment.continuesBefore, false)
    assert.equal(segment.continuesAfter, false)
  })

  it('shares one lane between events that do not overlap', () => {
    const result = packSpans(WEEK, [
      event('a', '2026-08-24', '2026-08-25'),
      event('b', '2026-08-27', '2026-08-28'),
    ])
    assert.equal(laneOf(result, 'a'), 0)
    assert.equal(laneOf(result, 'b'), 0)
    assert.equal(result.lanesUsed, 1)
  })

  it('stacks overlapping events into separate lanes', () => {
    const result = packSpans(WEEK, [
      event('a', '2026-08-24', '2026-08-27'),
      event('b', '2026-08-26', '2026-08-28'),
    ])
    assert.notEqual(laneOf(result, 'a'), laneOf(result, 'b'))
    assert.equal(result.lanesUsed, 2)
  })

  it('gives the longer bar the top lane regardless of sort order in', () => {
    // Both start the same day; the week-long one must not be pushed down by
    // the one-day one just because it was listed second.
    const result = packSpans(WEEK, [
      event('short', '2026-08-24', '2026-08-24'),
      event('long', '2026-08-24', '2026-08-30'),
    ])
    assert.equal(laneOf(result, 'long'), 0)
    assert.equal(laneOf(result, 'short'), 1)
  })

  it('clips an event that runs past both ends of the row and flags both sides', () => {
    const result = packSpans(WEEK, [event('a', '2026-08-01', '2026-09-30')])
    const segment = segmentOf(result, 'a')
    assert.equal(segment.startIndex, 0)
    assert.equal(segment.endIndex, 6)
    assert.equal(segment.continuesBefore, true)
    assert.equal(segment.continuesAfter, true)
  })

  it('flags only the trailing side when an event starts inside the row', () => {
    const result = packSpans(WEEK, [event('a', '2026-08-28', '2026-09-04')])
    const segment = segmentOf(result, 'a')
    assert.equal(segment.continuesBefore, false)
    assert.equal(segment.continuesAfter, true)
  })

  it('excludes an event that misses the row entirely', () => {
    const result = packSpans(WEEK, [event('a', '2026-07-01', '2026-07-05')])
    assert.equal(result.segments.length, 0)
    assert.equal(result.lanesUsed, 0)
  })

  it('never reuses a lane backwards within a row', () => {
    /* The staircase bug this guards: a lane is a row-wide vertical offset, so
       once lane 0 is occupied through Wednesday, a bar starting Tuesday can
       never be given lane 0 — even though a per-cluster packer would reset and
       hand it out again. */
    const result = packSpans(WEEK, [
      event('a', '2026-08-24', '2026-08-26'),
      event('b', '2026-08-25', '2026-08-25'),
    ])
    assert.equal(laneOf(result, 'a'), 0)
    assert.equal(laneOf(result, 'b'), 1)
  })

  it('counts overflow against every day a hidden bar covers', () => {
    // contentBudget 2 leaves room for one lane, so the third stacked bar hides.
    const result = packSpans(
      WEEK,
      [
        event('a', '2026-08-24', '2026-08-30'),
        event('b', '2026-08-24', '2026-08-30'),
        event('c', '2026-08-25', '2026-08-26'),
      ],
      { contentBudget: 2 },
    )
    assert.equal(result.lanesUsed, 1)
    // Mon is covered by the one hidden week-long bar.
    assert.equal(result.overflowByDay[0], 1)
    // Tue and Wed are covered by that bar and by the hidden short one.
    assert.equal(result.overflowByDay[1], 2)
    assert.equal(result.overflowByDay[2], 2)
  })

  it('always leaves at least one row for a day own tasks', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      event(`e${i}`, '2026-08-24', '2026-08-30'),
    )
    const result = packSpans(WEEK, many, { contentBudget: 3 })
    assert.equal(result.lanesUsed, 2)
    assert.ok(result.chipBudget >= 1)
  })

  it('handles a one-day row, which the day view rail uses', () => {
    const result = packSpans(['2026-08-26'], [event('a', '2026-08-24', '2026-08-28')])
    const segment = segmentOf(result, 'a')
    assert.equal(segment.startIndex, 0)
    assert.equal(segment.endIndex, 0)
    assert.equal(segment.continuesBefore, true)
    assert.equal(segment.continuesAfter, true)
  })

  it('is empty for an empty row or no events', () => {
    assert.equal(packSpans([], [event('a', '2026-08-26')]).segments.length, 0)
    assert.equal(packSpans(WEEK, []).segments.length, 0)
  })
})

describe('span helpers', () => {
  it('counts a span inclusively at both ends', () => {
    assert.equal(eventSpanDays(event('a', '2026-08-24', '2026-08-24')), 1)
    assert.equal(eventSpanDays(event('a', '2026-08-24', '2026-08-26')), 3)
  })

  it('knows a multi-day event from a single-day one', () => {
    assert.equal(isMultiDay(event('a', '2026-08-24', '2026-08-24')), false)
    assert.equal(isMultiDay(event('a', '2026-08-24', '2026-08-25')), true)
  })

  it('reports which day of the run a date is', () => {
    const e = event('a', '2026-08-24', '2026-08-27')
    assert.equal(dayOfSpan(e, '2026-08-24'), 1)
    assert.equal(dayOfSpan(e, '2026-08-26'), 3)
  })
})
