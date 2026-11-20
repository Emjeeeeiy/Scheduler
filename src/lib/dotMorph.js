/* The motion behind the sign-in screen's swap between its hero and its form: what
   is on screen breaks into dots, the dots scatter, and they gather again into what
   comes next. Pure numbers in, numbers out — no canvas, no DOM, no timers — so it
   is testable under `node --test`; reading the page into dots and drawing them is
   dotMorphRun.js's job.

   A cloud of points is `{ count, x, y, c }`: positions in px and, for each, a
   colour index into a palette the caller keeps. This file never sees a colour;
   it only says how far each dot has gone from its source colour toward its
   target one (0 → 1), quantised so the drawing can be batched by colour. */

/** Scatter: every dot flies out from where it started, easing to a stop. */
export const SCATTER_MS = 400
/** Gather: each dot sets off for its target somewhere in this window… */
export const GATHER_START_MS = 350
export const GATHER_JITTER_MS = 120
/** …and takes this long to get there, so the last one lands by GATHER_END_MS. */
export const GATHER_MS = 480
export const GATHER_END_MS = GATHER_START_MS + GATHER_JITTER_MS + GATHER_MS
/** Settle: the real content fades in under the dots as they fade out. */
export const SETTLE_MS = 220
export const TOTAL_MS = GATHER_END_MS + SETTLE_MS

/** A ceiling on dots, whatever the content. Past it a cloud is thinned evenly. */
export const MAX_DOTS = 4500
/** How many steps a dot's colour takes from source to target. */
export const COLOUR_STEPS = 6

/* How far a dot flies in the scatter, and how much it sways sideways on the way. */
const SCATTER_MIN = 28
const SCATTER_SPREAD = 92
const SWAY = 14

const clamp01 = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v)
const easeOutCubic = (t) => 1 - (1 - t) ** 3
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/** A small deterministic random source (mulberry32), so a plan can be reproduced
    in a test. The page uses Math.random. */
export function seeded(seed) {
  let a = seed >>> 0
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A cloud from plain arrays. */
export function cloud(xs, ys, cs) {
  const count = Math.min(xs.length, ys.length, cs.length)
  return {
    count,
    x: Float32Array.from(xs.slice(0, count)),
    y: Float32Array.from(ys.slice(0, count)),
    c: Uint16Array.from(cs.slice(0, count)),
  }
}

/** At most `max` of a cloud's points, taken evenly through it, so a dense
    headline loses dots everywhere a little rather than all of one corner. */
export function thin(points, max = MAX_DOTS) {
  if (points.count <= max) return points
  const x = new Float32Array(max)
  const y = new Float32Array(max)
  const c = new Uint16Array(max)
  for (let j = 0; j < max; j += 1) {
    const i = Math.floor((j * points.count) / max)
    x[j] = points.x[i]
    y[j] = points.y[i]
    c[j] = points.c[i]
  }
  return { count: max, x, y, c }
}

/** Pairs every source point with a target point and gives each dot its flight.

    There are as many dots as the larger cloud has points, so every source point
    and every target point is covered (the smaller cloud's points are shared).
    Targets are shuffled: a dot does not fly to the matching spot, it scatters and
    lands somewhere in what comes next, which is what makes it read as the content
    coming apart rather than sliding. Each dot flies out away from the source's
    centre (with some spread), sways a little sideways on the way, and sets off
    for its target at its own moment within the gather window. */
export function planMorph(source, target, { max = MAX_DOTS, random = Math.random } = {}) {
  const from = thin(source, max)
  const to = thin(target, max)
  const count = from.count && to.count ? Math.max(from.count, to.count) : 0

  const order = new Uint32Array(to.count)
  for (let i = 0; i < to.count; i += 1) order[i] = i
  for (let i = to.count - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const swap = order[i]
    order[i] = order[j]
    order[j] = swap
  }

  let cx = 0
  let cy = 0
  for (let i = 0; i < from.count; i += 1) {
    cx += from.x[i]
    cy += from.y[i]
  }
  cx /= from.count || 1
  cy /= from.count || 1

  const plan = {
    count,
    sx: new Float32Array(count),
    sy: new Float32Array(count),
    tx: new Float32Array(count),
    ty: new Float32Array(count),
    // Scatter direction (a unit vector) and how far it carries the dot.
    ux: new Float32Array(count),
    uy: new Float32Array(count),
    reach: new Float32Array(count),
    sway: new Float32Array(count),
    delay: new Float32Array(count),
    cFrom: new Uint16Array(count),
    cTo: new Uint16Array(count),
  }

  for (let i = 0; i < count; i += 1) {
    const s = i % from.count
    const t = order[i % to.count]
    plan.sx[i] = from.x[s]
    plan.sy[i] = from.y[s]
    plan.tx[i] = to.x[t]
    plan.ty[i] = to.y[t]
    plan.cFrom[i] = from.c[s]
    plan.cTo[i] = to.c[t]

    // Outward from the centre, turned by up to ±50° so the burst is not a clean
    // radial star; a dot right at the centre picks any direction.
    const dx = from.x[s] - cx
    const dy = from.y[s] - cy
    const base = dx === 0 && dy === 0 ? random() * Math.PI * 2 : Math.atan2(dy, dx)
    const angle = base + (random() - 0.5) * (Math.PI / 1.8)
    plan.ux[i] = Math.cos(angle)
    plan.uy[i] = Math.sin(angle)
    plan.reach[i] = SCATTER_MIN + random() * SCATTER_SPREAD
    plan.sway[i] = (random() - 0.5) * 2 * SWAY
    plan.delay[i] = random() * GATHER_JITTER_MS
  }
  return plan
}

/** How far dot `i` is through its gather at `timeMs`, eased (0 before, 1 after). */
export function gatherProgress(plan, i, timeMs) {
  return easeInOutCubic(clamp01((timeMs - GATHER_START_MS - plan.delay[i]) / GATHER_MS))
}

/** Where dot `i` is at `timeMs`, and how far its colour has gone toward the
    target's: writes `x, y, k` into `out`. Exactly on its source point at 0, and
    exactly on its target point from GATHER_END_MS on. */
export function positionAt(plan, i, timeMs, out) {
  const scatter = easeOutCubic(clamp01(timeMs / SCATTER_MS))
  // The sway rises and falls back to nothing across the whole flight, so it never
  // moves a dot off its source at the start or off its target at the end.
  const swayAmount = plan.sway[i] * Math.sin(Math.PI * clamp01(timeMs / GATHER_END_MS))
  const reach = plan.reach[i] * scatter
  const fx = plan.sx[i] + plan.ux[i] * reach - plan.uy[i] * swayAmount
  const fy = plan.sy[i] + plan.uy[i] * reach + plan.ux[i] * swayAmount
  const k = gatherProgress(plan, i, timeMs)
  out[0] = fx + (plan.tx[i] - fx) * k
  out[1] = fy + (plan.ty[i] - fy) * k
  out[2] = k
  return out
}

/** A colour mix (0 → 1) as one of COLOUR_STEPS + 1 steps, for batching. */
export function mixStep(k) {
  return Math.round(clamp01(k) * COLOUR_STEPS)
}

/** How opaque the dots are at `timeMs`: full until the settle, then fading to
    nothing as the real content comes up underneath. */
export function dotAlpha(timeMs) {
  return 1 - clamp01((timeMs - GATHER_END_MS) / SETTLE_MS)
}
