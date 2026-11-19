import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  GRID_PITCH,
  MAX_ALPHA,
  MAX_RIBBON_DOTS,
  gridDots,
  gridLayout,
  influence,
  makeRibbonBuffer,
  ribbonDots,
} from '../src/lib/dotField.js'

describe('influence', () => {
  it('is full under the pointer and gone at its reach', () => {
    assert.equal(influence(0, 150), 1)
    assert.equal(influence(150, 150), 0)
    assert.equal(influence(400, 150), 0)
  })

  it('never rises as the distance grows', () => {
    let previous = 1
    for (let d = 0; d <= 150; d += 5) {
      const now = influence(d, 150)
      assert.ok(now <= previous, `rose at ${d}`)
      previous = now
    }
  })

  it('is 0 for nonsense rather than NaN, so a bad pointer never poisons a frame', () => {
    assert.equal(influence(Number.NaN, 150), 0)
    assert.equal(influence(10, 0), 0)
    assert.equal(influence(10, -5), 0)
  })
})

describe('gridLayout and gridDots', () => {
  it('centres the grid with at least half a pitch to spare on every side', () => {
    const { cols, rows, x0, y0, pitch } = gridLayout(1000, 600)
    assert.ok(x0 >= pitch / 2 - 1e-9 && y0 >= pitch / 2 - 1e-9)
    assert.ok(x0 + (cols - 1) * pitch <= 1000 - pitch / 2 + 1e-9)
    assert.ok(y0 + (rows - 1) * pitch <= 600 - pitch / 2 + 1e-9)
  })

  it('lists every dot once as an x, y pair', () => {
    const { cols, rows } = gridLayout(440, 220)
    const dots = gridDots(440, 220)
    assert.equal(dots.length, cols * rows * 2)
    assert.equal(dots[2] - dots[0], GRID_PITCH)
  })

  it('has no dots in a box too small to hold one', () => {
    assert.equal(gridDots(10, 10).length, 0)
  })
})

describe('ribbonDots', () => {
  const draw = (width, height, timeMs) => {
    const out = makeRibbonBuffer()
    const count = ribbonDots(width, height, timeMs, out)
    return { out, count }
  }

  it('draws a ribbon, every dot on screen with an opacity and a size', () => {
    const { out, count } = draw(1440, 900, 0)
    assert.ok(count > 500, `only ${count} dots`)
    for (let i = 0; i < count; i += 1) {
      const [x, y, alpha, radius] = out.slice(i * 4, i * 4 + 4)
      assert.ok([x, y, alpha, radius].every(Number.isFinite), `dot ${i} is not finite`)
      assert.ok(x >= -4 && x <= 1444 && y >= -4 && y <= 904, `dot ${i} is off screen`)
      assert.ok(alpha >= 0 && alpha <= MAX_ALPHA + 1e-6, `dot ${i} alpha ${alpha}`)
      assert.ok(radius >= 0.8 && radius <= 1.4 + 1e-6, `dot ${i} radius ${radius}`)
    }
  })

  it('gives the same ribbon for the same moment', () => {
    const a = draw(1440, 900, 5000)
    const b = draw(1440, 900, 5000)
    assert.equal(a.count, b.count)
    assert.deepEqual(a.out.slice(0, a.count * 4), b.out.slice(0, b.count * 4))
  })

  it('moves as time passes', () => {
    const a = draw(1440, 900, 0)
    const b = draw(1440, 900, 8000)
    const n = Math.min(a.count, b.count)
    assert.notDeepEqual(a.out.slice(0, n * 4), b.out.slice(0, n * 4))
  })

  // The performance guard: a 4K screen must not mean three times the dots.
  it('stays under the dot ceiling on a very large screen', () => {
    assert.ok(draw(3840, 2160, 0).count <= MAX_RIBBON_DOTS)
    assert.ok(draw(7680, 4320, 3000).count <= MAX_RIBBON_DOTS)
  })

  it('draws nothing for a box with no size', () => {
    assert.equal(draw(0, 0, 0).count, 0)
    assert.equal(draw(800, 0, 0).count, 0)
    assert.equal(draw(Number.NaN, 600, 0).count, 0)
  })

  it('still draws on a phone', () => {
    assert.ok(draw(390, 844, 0).count > 100)
  })
})
