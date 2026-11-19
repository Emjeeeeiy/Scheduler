/* The geometry behind the 404 page's dot field: a quiet grid, and a ribbon of
   dots that twists across it like a length of silk. Pure numbers in, numbers
   out — no canvas, no DOM, no timers — so it is testable under `node --test` and
   the component (DotField.jsx) is left with nothing but drawing and listening.

   Everything is dots on purpose. DESIGN.md allows the app one decorative motif,
   the dot grid; a ribbon drawn as strokes or a gradient would be a second one. */

export const GRID_PITCH = 22

/** The ribbon is this many strands of dots laid across its width. */
export const STRANDS = 26

/** A hard ceiling on dots per frame, whatever the screen. A 4K display widens
    the spacing along the ribbon instead of drawing three times as many. */
export const MAX_RIBBON_DOTS = 9000

/** Brightest a resting ribbon dot gets (of 1). The pointer lifts it past this. */
export const MAX_ALPHA = 0.42

const TAU = Math.PI * 2
/* Spacing between samples along the ribbon, in px. */
const STEP = 9
const MAX_SAMPLES = Math.floor(MAX_RIBBON_DOTS / STRANDS)
/* One full roll of the twist travelling the ribbon's length, and one breath of
   the whole ribbon rising and falling. Unequal, so the two never line up into a
   visible loop. */
const TWIST_PERIOD_S = 16
const LIFT_PERIOD_S = 11

/** How strongly something `distance` px from the pointer is affected: 1 right
    under it, easing smoothly to 0 at `reach`. A smoothstep, so the edge of the
    pointer's circle never shows as a ring. */
export function influence(distance, reach) {
  if (!(reach > 0) || !(distance < reach)) return 0
  const t = 1 - Math.max(0, distance) / reach
  return t * t * (3 - 2 * t)
}

/** Where the grid's dots sit: as many whole columns and rows as fit, centred, so
    the margin is the same on both sides and never less than half a pitch. */
export function gridLayout(width, height, pitch = GRID_PITCH) {
  const cols = Math.max(0, Math.floor(width / pitch))
  const rows = Math.max(0, Math.floor(height / pitch))
  return {
    cols,
    rows,
    pitch,
    x0: (width - (cols - 1) * pitch) / 2,
    y0: (height - (rows - 1) * pitch) / 2,
  }
}

/** Every grid dot as `x, y` pairs. */
export function gridDots(width, height, pitch = GRID_PITCH) {
  const { cols, rows, x0, y0 } = gridLayout(width, height, pitch)
  const dots = new Float32Array(cols * rows * 2)
  let at = 0
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      dots[at] = x0 + col * pitch
      dots[at + 1] = y0 + row * pitch
      at += 2
    }
  }
  return dots
}

/** A buffer big enough for any frame of `ribbonDots`, to be reused every frame. */
export function makeRibbonBuffer() {
  return new Float32Array(MAX_RIBBON_DOTS * 4)
}

function smooth(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/* A cubic Bézier and its slope, one axis at a time (no allocation per sample). */
function cubic(a, b, c, d, u) {
  const m = 1 - u
  return m * m * m * a + 3 * m * m * u * b + 3 * m * u * u * c + u * u * u * d
}

function slope(a, b, c, d, u) {
  const m = 1 - u
  return 3 * m * m * (b - a) + 6 * m * u * (c - b) + 3 * u * u * (d - c)
}

/** Fills `out` with the ribbon's dots at `timeMs` as `x, y, alpha, radius`
    quadruples and returns how many there are.

    The spine is one cubic curve from below the bottom-left corner to above the
    top-right one, sagging under the middle of the screen where the text sits.
    Across it lie `STRANDS` strands of dots. The sheet rolls over along its length
    (the twist), so where it turns edge-on its strands pile together into a bright
    fold, and where it faces you they spread out and go quiet — the same thing
    silk does. The roll creeps along the ribbon, and the whole ribbon breathes
    a little, so it is never still and never repeats exactly. */
export function ribbonDots(width, height, timeMs, out) {
  if (!(width > 0) || !(height > 0)) return 0

  const x0 = -0.1 * width
  const y0 = 0.92 * height
  const x1 = 0.3 * width
  const y1 = 1.02 * height
  const x2 = 0.7 * width
  const y2 = 0.92 * height
  const x3 = 1.1 * width
  const y3 = 0.12 * height

  // The spine's rough length, to decide how many samples a STEP spacing needs.
  let length = 0
  let lastX = x0
  let lastY = y0
  for (let i = 1; i <= 24; i += 1) {
    const u = i / 24
    const x = cubic(x0, x1, x2, x3, u)
    const y = cubic(y0, y1, y2, y3, u)
    length += Math.hypot(x - lastX, y - lastY)
    lastX = x
    lastY = y
  }
  const samples = Math.min(MAX_SAMPLES, Math.max(2, Math.ceil(length / STEP)))

  const seconds = timeMs / 1000
  const diagonal = Math.hypot(width, height)
  const halfWidth = 0.075 * diagonal
  const liftAmount = 0.012 * diagonal

  let count = 0
  for (let i = 0; i < samples; i += 1) {
    const u = i / (samples - 1)
    const cx = cubic(x0, x1, x2, x3, u)
    const cy = cubic(y0, y1, y2, y3, u)
    let tx = slope(x0, x1, x2, x3, u)
    let ty = slope(y0, y1, y2, y3, u)
    const tl = Math.hypot(tx, ty) || 1
    tx /= tl
    ty /= tl
    const nx = -ty
    const ny = tx

    // Narrow at both ends, widest mid-sweep.
    const half = halfWidth * (0.2 + 0.8 * Math.sin(Math.PI * u))
    const theta = 0.6 + 2.2 * Math.PI * u + 0.8 * Math.sin(TAU * (1.3 * u - seconds / TWIST_PERIOD_S))
    const cosTheta = Math.cos(theta)
    const facing = Math.abs(cosTheta)
    const fold = 1 - facing
    const lift = liftAmount * Math.sin(TAU * (0.9 * u + seconds / LIFT_PERIOD_S))
    const fade = smooth(0, 0.1, u) * smooth(0, 0.1, 1 - u)
    const baseAlpha = 0.07 + 0.17 * facing + 0.16 * fold * fold * fold

    for (let k = 0; k < STRANDS; k += 1) {
      const s = -1 + (2 * k) / (STRANDS - 1)
      // The cross-section is a flat sheet foreshortened by the roll, with a
      // gentle ripple so the strands bunch and part like cloth, not like a comb.
      const across = half * (s * cosTheta + 0.22 * Math.sin(2.4 * s + theta)) + lift
      const x = cx + nx * across
      const y = cy + ny * across
      if (x < -4 || x > width + 4 || y < -4 || y > height + 4) continue

      // The outer strands catch a little more light: an edge, not a fill.
      const rim = s * s * s * s
      const alpha = Math.min(MAX_ALPHA, (baseAlpha + 0.1 * rim) * fade)
      const at = count * 4
      out[at] = x
      out[at + 1] = y
      out[at + 2] = alpha
      out[at + 3] = 0.8 + 0.6 * (alpha / MAX_ALPHA)
      count += 1
    }
  }
  return count
}
