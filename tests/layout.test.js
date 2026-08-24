import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hourMarks, layoutDay, ratioToMin, visibleWindow } from '../src/lib/layout.js'

const task = (id, startMin, durationMin) => ({ id, startMin, durationMin })

const WINDOW = [8 * 60, 18 * 60] // 8am–6pm, a 600-minute span

describe('layoutDay', () => {
  it('gives a lone block the full width', () => {
    const [out] = layoutDay([task('a', 9 * 60, 60)], ...WINDOW)
    assert.equal(out.width, 100)
    assert.equal(out.left, 0)
    assert.equal(out.columns, 1)
    assert.equal(out.top, ((9 * 60 - 8 * 60) / 600) * 100)
    assert.equal(out.height, (60 / 600) * 100)
  })

  it('keeps non-overlapping blocks at full width', () => {
    const out = layoutDay([task('a', 9 * 60, 60), task('b', 11 * 60, 60)], ...WINDOW)
    assert.deepEqual(
      out.map((b) => b.width),
      [100, 100],
    )
  })

  it('splits two overlapping blocks in half', () => {
    const out = layoutDay([task('a', 9 * 60, 60), task('b', 9 * 60 + 30, 60)], ...WINDOW)
    assert.deepEqual(
      out.map((b) => b.width),
      [50, 50],
    )
    assert.deepEqual(
      out.map((b) => b.left),
      [0, 50],
    )
  })

  it('treats a transitive chain as ONE cluster', () => {
    /* 9–10, 9:30–11, 10:30–12. The first and last never touch each other, but
       splitting only the pairs would draw the middle block over a neighbour, so
       the whole chain has to share a width. First-fit then lets the third block
       reuse column 0, which column 0's block vacated at 10:00. */
    const out = layoutDay(
      [task('a', 9 * 60, 60), task('b', 9 * 60 + 30, 90), task('c', 10 * 60 + 30, 90)],
      ...WINDOW,
    )
    assert.deepEqual(
      out.map((b) => b.columns),
      [2, 2, 2],
    )
    assert.deepEqual(
      out.map((b) => b.left),
      [0, 50, 0],
    )
  })

  it('opens a third column only when three genuinely overlap', () => {
    const out = layoutDay(
      [task('a', 9 * 60, 120), task('b', 9 * 60, 120), task('c', 9 * 60, 120)],
      ...WINDOW,
    )
    assert.deepEqual(
      out.map((b) => b.columns),
      [3, 3, 3],
    )
    assert.deepEqual(
      out.map((b) => Math.round(b.width)),
      [33, 33, 33],
    )
  })

  it('starts a fresh cluster once the chain breaks', () => {
    const out = layoutDay(
      [task('a', 9 * 60, 60), task('b', 9 * 60 + 30, 60), task('c', 14 * 60, 60)],
      ...WINDOW,
    )
    assert.deepEqual(
      out.map((b) => b.width),
      [50, 50, 100],
    )
  })

  it('ignores unscheduled tasks', () => {
    const out = layoutDay([{ id: 'x', startMin: null, durationMin: 30 }], ...WINDOW)
    assert.equal(out.length, 0)
  })

  it('floors a very short block so it stays clickable', () => {
    const [out] = layoutDay([task('a', 9 * 60, 5)], ...WINDOW)
    assert.ok(out.height >= (20 / 600) * 100)
  })

  it('orders ties deterministically', () => {
    const a = layoutDay([task('b', 540, 60), task('a', 540, 60)], ...WINDOW)
    const b = layoutDay([task('a', 540, 60), task('b', 540, 60)], ...WINDOW)
    assert.deepEqual(
      a.map((x) => x.task.id),
      b.map((x) => x.task.id),
    )
  })
})

describe('visibleWindow', () => {
  it('uses the working-hours default when everything fits', () => {
    assert.deepEqual(visibleWindow([task('a', 9 * 60, 60)]), [7 * 60, 22 * 60])
  })

  it('widens to whole hours around anything outside it', () => {
    // A 5:20am task must not be cropped out of the only view that shows it.
    assert.deepEqual(visibleWindow([task('a', 5 * 60 + 20, 30)]), [5 * 60, 22 * 60])
    assert.deepEqual(visibleWindow([task('a', 22 * 60 + 30, 60)]), [7 * 60, 23 * 60 + 60])
  })

  it('ignores unscheduled tasks', () => {
    assert.deepEqual(visibleWindow([{ id: 'x', startMin: null, durationMin: 60 }]), [
      7 * 60,
      22 * 60,
    ])
  })
})

describe('ratioToMin', () => {
  it('snaps to the nearest quarter hour', () => {
    assert.equal(ratioToMin(0, 8 * 60, 18 * 60), 8 * 60)
    // 8:00 + 0.5 * 600min = 13:00
    assert.equal(ratioToMin(0.5, 8 * 60, 18 * 60), 13 * 60)
    // Anything mid-slot rounds to a 15-minute boundary.
    assert.equal(ratioToMin(0.51, 8 * 60, 18 * 60) % 15, 0)
  })

  it('never lands past the end of the window', () => {
    assert.ok(ratioToMin(1.5, 8 * 60, 18 * 60) <= 18 * 60 - 15)
  })
})

describe('hourMarks', () => {
  it('lists whole hours inside the window', () => {
    assert.deepEqual(hourMarks(8 * 60, 11 * 60), [480, 540, 600, 660])
  })
})
