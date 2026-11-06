import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import {
  DEFAULT_HEIGHT,
  INK_WIDTH,
  MARKER_FACTOR,
  MAX_HEIGHT,
  MIN_HEIGHT,
  PEN_SIZES,
  boundsOf,
  buildStroke,
  clampHeight,
  decodePoints,
  drawingSvg,
  encodePoints,
  livePath,
  normalizeStroke,
  normalizeStrokes,
  simplify,
  strokeHit,
  strokePath,
  strokeWidth,
} from '../src/lib/ink.js'

const wave = (n, { amplitude = 40, step = 3, pressure = false } = {}) =>
  Array.from({ length: n }, (_, i) => ({
    x: 20 + i * step,
    y: 100 + Math.sin(i / 7) * amplitude,
    ...(pressure ? { p: (Math.sin(i / 5) + 1) / 2 } : {}),
  }))

describe('encodePoints / decodePoints', () => {
  it('round-trips to within the half-unit the format keeps', () => {
    const points = wave(200)
    const { points: back, pressure } = decodePoints(encodePoints(points))
    assert.equal(pressure, false)
    assert.equal(back.length, points.length)
    for (let i = 0; i < points.length; i++) {
      assert.ok(Math.abs(back[i].x - points[i].x) <= 0.25 + 1e-9, `x[${i}]`)
      assert.ok(Math.abs(back[i].y - points[i].y) <= 0.25 + 1e-9, `y[${i}]`)
    }
  })

  it('keeps pen pressure to a byte when asked, and none otherwise', () => {
    const points = wave(60, { pressure: true })
    const withPressure = decodePoints(encodePoints(points, { pressure: true }))
    assert.equal(withPressure.pressure, true)
    for (let i = 0; i < points.length; i++) assert.ok(Math.abs(withPressure.points[i].p - points[i].p) <= 1 / 255 + 1e-9)
    assert.equal(decodePoints(encodePoints(points)).points[0].p, undefined)
  })

  it('is compact — a few characters a point, not the ten of JSON', () => {
    const text = encodePoints(wave(1000))
    assert.ok(text.length < 3500, `1000 points took ${text.length} characters`)
    assert.ok(text.length < JSON.stringify(wave(1000).map((p) => [p.x, p.y])).length / 3)
  })

  it('handles the extremes of the drawing area and big jumps in both directions', () => {
    const points = [
      { x: 0, y: 0 },
      { x: INK_WIDTH, y: MAX_HEIGHT },
      { x: 0, y: 0 },
      { x: 500.5, y: 3999.5 },
      { x: 500.5, y: 3999.5 },
    ]
    const { points: back } = decodePoints(encodePoints(points))
    assert.equal(back.length, points.length)
    assert.deepEqual(back.map((p) => [p.x, p.y]), points.map((p) => [p.x, p.y]))
  })

  it('round-trips an empty stroke and a single dot', () => {
    assert.deepEqual(decodePoints(encodePoints([])).points, [])
    assert.deepEqual(decodePoints(encodePoints([{ x: 12.5, y: 7 }])).points, [{ x: 12.5, y: 7 }])
  })

  it('decodes anything unreadable to no points instead of throwing', () => {
    for (const bad of [undefined, null, 42, '', '!!!', 'not base64 at all', 'AAAA', 'A', '日本', {}, [], 'a'.repeat(700_000)]) {
      assert.deepEqual(decodePoints(bad).points, [], String(bad).slice(0, 20))
    }
  })

  it('refuses a truncated stroke, a newer format, and an absurd point count', () => {
    const full = encodePoints(wave(50))
    assert.deepEqual(decodePoints(full.slice(0, Math.floor(full.length / 2))).points, [])
    const bytes = Buffer.from(full.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    bytes[0] = 99
    assert.deepEqual(decodePoints(bytes.toString('base64url')).points, [], 'unknown format version')
    // count = 2^28 points claimed, none supplied
    const huge = Buffer.from([1, 0, 0x80, 0x80, 0x80, 0x80, 0x01]).toString('base64url')
    assert.deepEqual(decodePoints(huge).points, [])
  })
})

describe('simplify', () => {
  it('keeps the endpoints and collapses a straight run to them', () => {
    const line = Array.from({ length: 100 }, (_, i) => ({ x: i, y: i * 2 }))
    const out = simplify(line, 0.6)
    assert.equal(out.length, 2)
    assert.deepEqual(out[0], line[0])
    assert.deepEqual(out[1], line[99])
  })

  it('keeps a corner', () => {
    const corner = [...Array.from({ length: 30 }, (_, i) => ({ x: i, y: 0 })), ...Array.from({ length: 30 }, (_, i) => ({ x: 29, y: i + 1 }))]
    const out = simplify(corner, 0.6)
    assert.ok(out.some((p) => p.x === 29 && p.y === 0), 'the corner point survives')
    assert.ok(out.length <= 4)
  })

  it('leaves a curve recognisably curved, and does nothing at epsilon 0', () => {
    const curve = wave(300)
    const out = simplify(curve, 0.6)
    assert.ok(out.length < curve.length && out.length > 20)
    assert.equal(simplify(curve, 0).length, curve.length)
  })

  it('does not change its input', () => {
    const input = wave(50)
    const copy = JSON.parse(JSON.stringify(input))
    simplify(input)
    assert.deepEqual(input, copy)
  })

  it('copes with a very long stroke (no recursion to overflow)', () => {
    const long = Array.from({ length: 150_000 }, (_, i) => ({ x: i / 100, y: Math.sin(i / 300) * 50 }))
    assert.doesNotThrow(() => simplify(long))
  })

  it('returns short strokes untouched', () => {
    assert.equal(simplify([]).length, 0)
    assert.equal(simplify([{ x: 1, y: 1 }]).length, 1)
    assert.equal(simplify([{ x: 1, y: 1 }, { x: 2, y: 2 }]).length, 2)
  })
})

describe('boundsOf', () => {
  it('finds the box around the points', () => {
    assert.deepEqual(boundsOf([{ x: 5, y: 9 }, { x: -2, y: 4 }, { x: 8, y: 1 }]), { minX: -2, minY: 1, maxX: 8, maxY: 9 })
  })
})

describe('strokePath', () => {
  const stroke = () => buildStroke({ tool: 'pen', color: null, size: 5, points: wave(80) })

  it('draws a closed outline from a stroke', () => {
    const d = strokePath(stroke())
    assert.match(d, /^M [-\d.]+ [-\d.]+ Q /)
    assert.ok(d.endsWith(' Z'))
    assert.ok(!/NaN|undefined/.test(d))
  })

  it('draws a single tap as a dot', () => {
    const dot = buildStroke({ tool: 'pen', color: null, size: 8, points: [{ x: 50, y: 50 }] })
    assert.match(strokePath(dot), /^M /)
  })

  it('is stable, so repeated redraws reuse the cached path', () => {
    const s = stroke()
    assert.equal(strokePath(s), strokePath({ ...s }))
  })

  it('gives an unreadable stroke no path rather than a broken one', () => {
    assert.equal(strokePath({ t: 'p', c: null, s: 5, d: 'AAAA' }), '')
  })

  it('draws a stroke that is still in progress', () => {
    const d = livePath(wave(10), { t: 'p', c: null, s: 5 }, false)
    assert.match(d, /^M /)
    assert.equal(livePath([], { t: 'p', s: 5 }, false), '')
  })

  it('makes a marker wider than the same pen', () => {
    assert.equal(strokeWidth({ t: 'm', s: 5 }), 5 * MARKER_FACTOR)
    assert.equal(strokeWidth({ t: 'p', s: 5 }), 5)
  })
})

describe('strokeHit', () => {
  const horizontal = buildStroke({
    tool: 'pen',
    color: null,
    size: 4,
    points: Array.from({ length: 40 }, (_, i) => ({ x: 100 + i * 5, y: 200 })),
  })

  it('hits where the eraser touches the line, and misses where it does not', () => {
    assert.equal(strokeHit(horizontal, 150, 200, 10), true)
    assert.equal(strokeHit(horizontal, 150, 205, 10), true)
    assert.equal(strokeHit(horizontal, 150, 230, 10), false)
    assert.equal(strokeHit(horizontal, 10, 200, 10), false, 'left of the stroke')
    assert.equal(strokeHit(horizontal, 400, 200, 10), false, 'right of the stroke')
  })

  it('reaches further for a marker than for a pen', () => {
    const marker = { ...horizontal, t: 'm' }
    assert.equal(strokeHit(horizontal, 150, 214, 8), false)
    assert.equal(strokeHit(marker, 150, 214, 8), true)
  })

  it('hits a single dot', () => {
    const dot = buildStroke({ tool: 'pen', color: null, size: 6, points: [{ x: 50, y: 50 }] })
    assert.equal(strokeHit(dot, 52, 50, 4), true)
    assert.equal(strokeHit(dot, 80, 50, 4), false)
  })

  it('never hits an unreadable stroke', () => {
    assert.equal(strokeHit({ t: 'p', c: null, s: 5, d: 'AAAA' }, 0, 0, 1000), false)
  })
})

describe('buildStroke', () => {
  it('turns the tool into the stored letter and keeps a null colour as "auto"', () => {
    assert.equal(buildStroke({ tool: 'pen', color: null, size: 5, points: wave(5) }).t, 'p')
    assert.equal(buildStroke({ tool: 'marker', color: '#2a78d6', size: 5, points: wave(5) }).t, 'm')
    assert.equal(buildStroke({ tool: 'pen', color: null, size: 5, points: wave(5) }).c, null)
  })

  it('simplifies before storing', () => {
    const line = Array.from({ length: 200 }, (_, i) => ({ x: i, y: 50 }))
    const stroke = buildStroke({ tool: 'pen', color: null, size: 5, points: line })
    assert.equal(decodePoints(stroke.d).points.length, 2)
  })
})

describe('normalizeStroke / normalizeStrokes', () => {
  const good = { t: 'p', c: '#E03131', s: 5, d: encodePoints(wave(5)) }

  it('keeps a good stroke and lowercases its colour', () => {
    assert.deepEqual(normalizeStroke(good), { ...good, c: '#e03131' })
  })

  it('drops anything that is not a stroke', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}, { d: '' }, { d: '<script>' }, { d: 'has space' }, { d: 42 }]) {
      assert.equal(normalizeStroke(bad), null, JSON.stringify(bad))
    }
  })

  it('never lets markup through in any field', () => {
    const hostile = normalizeStroke({ t: '"><script>', c: '"><script>alert(1)</script>', s: '5" onload="x', d: good.d })
    assert.deepEqual(hostile, { t: 'p', c: null, s: 5, d: good.d })
    assert.equal(normalizeStroke({ ...good, c: 'red' }).c, null)
    assert.equal(normalizeStroke({ ...good, c: '#fff' }).c, null, 'only six-digit hex is a stored colour')
    assert.equal(normalizeStroke({ ...good, c: 'url(javascript:x)' }).c, null)
  })

  it('clamps the width', () => {
    assert.equal(normalizeStroke({ ...good, s: 9999 }).s, 40)
    assert.equal(normalizeStroke({ ...good, s: -3 }).s, 0.5)
    assert.equal(normalizeStroke({ ...good, s: NaN }).s, 5)
  })

  it('reads a list, tolerates a non-list, and caps its length', () => {
    assert.deepEqual(normalizeStrokes('nope'), [])
    assert.deepEqual(normalizeStrokes(null), [])
    assert.equal(normalizeStrokes([good, null, { d: '!' }, good]).length, 2)
    assert.equal(normalizeStrokes(Array.from({ length: 25_000 }, () => good)).length, 20_000)
  })
})

describe('clampHeight', () => {
  it('keeps a drawing between its minimum and maximum, and defaults a non-number', () => {
    assert.equal(clampHeight(10), MIN_HEIGHT)
    assert.equal(clampHeight(99_999), MAX_HEIGHT)
    assert.equal(clampHeight(333.4), 333)
    assert.equal(clampHeight(undefined), DEFAULT_HEIGHT)
    assert.equal(clampHeight('tall'), DEFAULT_HEIGHT)
  })
})

describe('drawingSvg', () => {
  const xml = new new JSDOM('').window.DOMParser()
  const parses = (svg) => xml.parseFromString(svg, 'image/svg+xml').getElementsByTagName('parsererror').length === 0
  const stroke = buildStroke({ tool: 'pen', color: null, size: 5, points: wave(40) })
  const marker = buildStroke({ tool: 'marker', color: '#2a78d6', size: 5, points: wave(40) })

  it('is a well-formed standalone SVG at the drawing\'s own proportions', () => {
    const svg = drawingSvg({ strokes: [stroke, marker], height: 300, label: 'A wave' })
    assert.ok(parses(svg), svg.slice(0, 200))
    assert.match(svg, /viewBox="0 0 1000 300"/)
    assert.equal(svg.match(/<path /g).length, 2)
  })

  it('draws an auto-colour stroke in the ink it is given, a coloured one in its own', () => {
    const svg = drawingSvg({ strokes: [stroke, marker], height: 300 }, { ink: '#112233' })
    assert.match(svg, /fill="#112233"/)
    assert.match(svg, /fill="#2a78d6" fill-opacity="0.4"/)
  })

  it('escapes its label and ignores hostile stroke data', () => {
    const svg = drawingSvg({ strokes: [stroke, { t: 'p', c: '"><script>', s: 5, d: '<x>' }], height: 300, label: '"><script>alert(1)</script>' })
    assert.ok(parses(svg))
    assert.ok(!svg.includes('<script'))
    assert.equal(svg.match(/<path /g).length, 1, 'the bad stroke is dropped')
  })

  it('still produces a valid SVG for an empty drawing', () => {
    const svg = drawingSvg({ strokes: [], height: undefined })
    assert.ok(parses(svg))
    assert.match(svg, /viewBox="0 0 1000 320"/)
  })
})

describe('PEN_SIZES', () => {
  it('offers three increasing sizes, each with a matching eraser', () => {
    assert.equal(PEN_SIZES.length, 3)
    for (let i = 1; i < PEN_SIZES.length; i++) {
      assert.ok(PEN_SIZES[i].size > PEN_SIZES[i - 1].size)
      assert.ok(PEN_SIZES[i].eraser > PEN_SIZES[i - 1].eraser)
    }
  })
})
