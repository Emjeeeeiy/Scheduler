/* Freehand ink for the Journal's drawing boxes — everything about a stroke that
 * is not the pointer or the DOM, so it can be tested under Node.
 *
 * A drawing is a box of fixed logical width (INK_WIDTH units) and an adjustable
 * height, drawn on by pen, marker and eraser. Coordinates are in those logical
 * units, never pixels, so a drawing scales to any screen and stays put when the
 * window resizes or the note is opened on a phone.
 *
 * A stroke is stored as { t, c, s, d }:
 *   t  'p' pen | 'm' marker (translucent, wide)
 *   c  '#rrggbb', or null for "the paper's own ink" — which is what keeps a
 *      drawing visible when the theme flips from light to dark
 *   s  width in logical units
 *   d  the points, as a compact string (see encodePoints)
 *
 * The points are text rather than a list of numbers for one reason: size. A
 * note is one Firestore document capped near 1 MB, a freehand stroke is hundreds
 * of points, and JSON-encoding each coordinate costs ~10 bytes a point. Delta
 * encoding the half-unit coordinates as varints, then base64url, costs ~3.
 */

import { getStroke } from 'perfect-freehand'

export const INK_WIDTH = 1000
export const DEFAULT_HEIGHT = 320
export const MIN_HEIGHT = 120
export const MAX_HEIGHT = 4000

/** Pen widths in logical units (about 2, 4 and 8 CSS pixels in a typical sheet). */
export const PEN_SIZES = [
  { id: 's', label: 'Fine', size: 2.5, eraser: 8 },
  { id: 'm', label: 'Medium', size: 5, eraser: 14 },
  { id: 'l', label: 'Thick', size: 10, eraser: 24 },
]

export const MARKER_FACTOR = 3.2
export const MARKER_OPACITY = 0.4

const QUANT = 2 // coordinates are kept to half a logical unit
const FORMAT = 1
const MAX_STROKES = 20_000
const MAX_POINTS = 200_000
const MAX_STROKE_CHARS = 600_000

export const clampHeight = (value) =>
  Number.isFinite(value) ? Math.min(Math.max(Math.round(value), MIN_HEIGHT), MAX_HEIGHT) : DEFAULT_HEIGHT

/* ------------------------------------------------------------- encoding -- */

const zigzag = (n) => (n >= 0 ? n * 2 : -n * 2 - 1)
const unzigzag = (n) => (n % 2 === 0 ? n / 2 : -(n + 1) / 2)

function writeVarint(out, value) {
  let n = value
  while (n >= 0x80) {
    out.push((n % 0x80) | 0x80)
    n = Math.floor(n / 0x80)
  }
  out.push(n)
}

function toBase64Url(bytes) {
  let binary = ''
  // In chunks: spreading a large array into one call exceeds the argument limit.
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.slice(i, i + 8192))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text) {
  if (typeof text !== 'string' || text.length > MAX_STROKE_CHARS || !/^[A-Za-z0-9_-]*$/.test(text)) return null
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

/** [{x, y, p?}] -> a compact string. `pressure` keeps one byte per point of pen
    pressure; mouse and touch have none worth keeping, and the renderer simulates
    it from speed instead. */
export function encodePoints(points, { pressure = false } = {}) {
  const bytes = [FORMAT, pressure ? 1 : 0]
  writeVarint(bytes, points.length)
  let previousX = 0
  let previousY = 0
  for (const point of points) {
    const x = Math.round(point.x * QUANT)
    const y = Math.round(point.y * QUANT)
    writeVarint(bytes, zigzag(x - previousX))
    writeVarint(bytes, zigzag(y - previousY))
    previousX = x
    previousY = y
    if (pressure) bytes.push(Math.round(Math.min(Math.max(point.p ?? 0.5, 0), 1) * 255))
  }
  return toBase64Url(bytes)
}

/** The inverse. Anything unreadable — damaged, truncated, from a newer format —
    decodes to no points rather than throwing, so one bad stroke is a gap in a
    drawing, not a crashed page. */
export function decodePoints(text) {
  const bytes = fromBase64Url(text)
  if (!bytes || bytes.length < 3 || bytes[0] !== FORMAT) return { points: [], pressure: false }
  const pressure = bytes[1] === 1
  let at = 2
  const read = () => {
    let value = 0
    let scale = 1
    for (let guard = 0; guard < 8; guard++) {
      if (at >= bytes.length) throw new RangeError('truncated')
      const byte = bytes[at++]
      value += (byte & 0x7f) * scale
      if (!(byte & 0x80)) return value
      scale *= 0x80
    }
    throw new RangeError('overlong')
  }
  try {
    const count = read()
    if (count > MAX_POINTS) return { points: [], pressure }
    const points = []
    let x = 0
    let y = 0
    for (let i = 0; i < count; i++) {
      x += unzigzag(read())
      y += unzigzag(read())
      const point = { x: x / QUANT, y: y / QUANT }
      if (pressure) {
        if (at >= bytes.length) throw new RangeError('truncated')
        point.p = bytes[at++] / 255
      }
      points.push(point)
    }
    return { points, pressure }
  } catch {
    return { points: [], pressure: false }
  }
}

/* --------------------------------------------------------------- geometry -- */

function sqDistToSegment(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  let t = lengthSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq
  t = Math.min(Math.max(t, 0), 1)
  const cx = a.x + t * dx
  const cy = a.y + t * dy
  return (p.x - cx) ** 2 + (p.y - cy) ** 2
}

/** Ramer–Douglas–Peucker: drops points that lie within `epsilon` of the line
    between their neighbours. Iterative, so a very long stroke cannot overflow the
    stack, and the endpoints always survive. */
export function simplify(points, epsilon = 0.6) {
  if (points.length < 3 || epsilon <= 0) return points.slice()
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const limit = epsilon * epsilon
  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()
    let worst = 0
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const distance = sqDistToSegment(points[i], points[first], points[last])
      if (distance > worst) {
        worst = distance
        index = i
      }
    }
    if (index > 0 && worst > limit) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }
  return points.filter((_, i) => keep[i] === 1)
}

export function boundsOf(points) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const { x, y } of points) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

/* ---------------------------------------------------------------- strokes -- */

export const strokeWidth = (stroke) => (stroke.t === 'm' ? stroke.s * MARKER_FACTOR : stroke.s)

function outlineOptions(stroke, pressure, last) {
  const marker = stroke.t === 'm'
  return {
    size: strokeWidth(stroke),
    thinning: marker ? 0 : 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: marker ? false : !pressure,
    last,
  }
}

const fmt = (n) => Number(n.toFixed(1))

/** perfect-freehand's outline polygon -> a quadratic-curve SVG path. */
export function outlineToPath(outline) {
  if (!outline.length) return ''
  const d = ['M', fmt(outline[0][0]), fmt(outline[0][1]), 'Q']
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i]
    const [x1, y1] = outline[(i + 1) % outline.length]
    d.push(fmt(x0), fmt(y0), fmt((x0 + x1) / 2), fmt((y0 + y1) / 2))
  }
  d.push('Z')
  return d.join(' ')
}

/** The path for points that are still being drawn (not yet encoded). */
export function livePath(points, stroke, pressure) {
  if (points.length === 0) return ''
  const input = points.map((p) => (pressure ? [p.x, p.y, p.p ?? 0.5] : [p.x, p.y]))
  return outlineToPath(getStroke(input, outlineOptions(stroke, pressure, false)))
}

const decoded = new Map()
const paths = new Map()
const CACHE_LIMIT = 400

function remember(cache, key, value) {
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value)
  cache.set(key, value)
  return value
}

function decodeCached(d) {
  const hit = decoded.get(d)
  if (hit) return hit
  const { points, pressure } = decodePoints(d)
  return remember(decoded, d, { points, pressure, bounds: points.length ? boundsOf(points) : null })
}

/** The path of a finished stroke. Cached by what determines it, because a
    drawing redraws every stroke each time one is added. */
export function strokePath(stroke) {
  const key = `${stroke.t}|${stroke.s}|${stroke.d}`
  const hit = paths.get(key)
  if (hit !== undefined) return hit
  const { points, pressure } = decodeCached(stroke.d)
  const input = points.map((p) => (pressure ? [p.x, p.y, p.p ?? 0.5] : [p.x, p.y]))
  return remember(paths, key, input.length ? outlineToPath(getStroke(input, outlineOptions(stroke, pressure, true))) : '')
}

/** Whether a round eraser at (x, y) touches this stroke. Cheap rejection by
    bounding box first — the eraser tests every stroke on every pointer move. */
export function strokeHit(stroke, x, y, radius) {
  const { points, bounds } = decodeCached(stroke.d)
  if (!points.length) return false
  const reach = radius + strokeWidth(stroke) / 2
  if (x < bounds.minX - reach || x > bounds.maxX + reach || y < bounds.minY - reach || y > bounds.maxY + reach) {
    return false
  }
  const at = { x, y }
  const limit = reach * reach
  if (points.length === 1) return (points[0].x - x) ** 2 + (points[0].y - y) ** 2 <= limit
  for (let i = 1; i < points.length; i++) {
    if (sqDistToSegment(at, points[i - 1], points[i]) <= limit) return true
  }
  return false
}

/** Raw pointer points -> a stored stroke. */
export function buildStroke({ tool, color, size, points, pressure }) {
  const kept = simplify(points)
  return {
    t: tool === 'marker' ? 'm' : 'p',
    c: color ?? null,
    s: size,
    d: encodePoints(kept, { pressure }),
  }
}

/* ------------------------------------------------------------ validation -- */

const HEX = /^#[0-9a-f]{6}$/i

/** A stroke read back from a note. Stored data is untrusted — a hand-edited or
    half-written note must not be able to put script into an SVG attribute, so
    only the four known fields survive and each is coerced to its own type. */
export function normalizeStroke(raw) {
  if (!raw || typeof raw !== 'object') return null
  const d = typeof raw.d === 'string' && /^[A-Za-z0-9_-]+$/.test(raw.d) && raw.d.length <= MAX_STROKE_CHARS ? raw.d : null
  if (!d) return null
  return {
    t: raw.t === 'm' ? 'm' : 'p',
    c: typeof raw.c === 'string' && HEX.test(raw.c) ? raw.c.toLowerCase() : null,
    s: Number.isFinite(raw.s) ? Math.min(Math.max(raw.s, 0.5), 40) : 5,
    d,
  }
}

export function normalizeStrokes(raw) {
  return Array.isArray(raw) ? raw.slice(0, MAX_STROKES).map(normalizeStroke).filter(Boolean) : []
}

/* ----------------------------------------------------------------- export -- */

const escapeAttr = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** A drawing as a standalone SVG string, for HTML export and print. `ink` is
    what an auto-colour stroke is drawn in. */
export function drawingSvg({ strokes, height, label }, { ink = '#000000' } = {}) {
  const h = clampHeight(height)
  const body = normalizeStrokes(strokes)
    .map((stroke) => {
      const d = strokePath(stroke)
      if (!d) return ''
      const opacity = stroke.t === 'm' ? ` fill-opacity="${MARKER_OPACITY}"` : ''
      return `<path d="${d}" fill="${escapeAttr(stroke.c ?? ink)}"${opacity}/>`
    })
    .join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${INK_WIDTH} ${h}" width="${INK_WIDTH}" height="${h}" ` +
    `role="img" aria-label="${escapeAttr(label || 'Drawing')}">${body}</svg>`
  )
}
