/* The browser half of the sign-in screen's dot transition (the numbers are in
   dotMorph.js): it reads what is on the page into dots, and draws them flying.

   Reading. The page is not captured as a picture. Its words are drawn, one at a
   time, into a scratch canvas in their own font, size and colour and sampled on a
   grid; its filled boxes (a button) become a grid of dots in their fill; its
   borders (an input's outline) become a ring of dots in the border colour. The
   result is a cloud of coloured points that sit where the letters and boxes are,
   so when the dots gather again they land exactly where the real thing is and the
   hand-off to it is not a change of place.

   Drawing. One canvas, one rAF loop, square dots batched by colour (one `fill()`
   per colour, as DotField does per opacity band) — thousands of dots, a few dozen
   draw calls a frame.

   Nothing here may leave the screen stuck: with no 2D context, no size, or any
   error while reading, `startDotMorph` returns null and the caller swaps at once;
   and a timer finishes the run even where rAF has stopped (a hidden tab). */

import {
  COLOUR_STEPS,
  GATHER_END_MS,
  TOTAL_MS,
  cloud,
  dotAlpha,
  mixStep,
  planMorph,
  positionAt,
} from './dotMorph.js'

/* A dot is a square this many px across. */
const DOT = 1.8
/* The grid, in px, text is sampled on — finer for small type, which has less of
   it to lose — and the spacing of dots inside a filled box and along an edge. */
const FILL_STEP = 5
const EDGE_STEP = 4
const PAD = 2
const COVERAGE = 110
const MAX_DPR = 2
/* A box whose fill is this close to the page behind it (an input's faint surface)
   would only spend dots on something nobody can see. */
const MIN_FILL_CONTRAST = 60

const textStep = (size) => (size >= 40 ? 4 : size >= 20 ? 3 : 2)

/* ------------------------------------------------------------------ colour -- */

function readColour(probe, css) {
  probe.clearRect(0, 0, 1, 1)
  // An invalid value leaves the previous fillStyle in place, so reset it first.
  probe.fillStyle = '#000000'
  probe.fillStyle = css
  probe.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data
  return [r, g, b, a / 255]
}

/** Colours as the dots will use them: an index per distinct CSS colour, so a
    cloud is a few small integers per dot rather than a string. Parsed through a
    1×1 canvas, which understands whatever the stylesheet computed to (rgb, color(),
    oklch…) without this file knowing the formats. */
function makePalette(probe) {
  const list = []
  const byCss = new Map()
  return {
    list,
    id(css) {
      let id = byCss.get(css)
      if (id === undefined) {
        id = list.length
        list.push(readColour(probe, css))
        byCss.set(css, id)
      }
      return id
    },
    /** The parsed colour for `css`, asked for as often as it likes: a canvas
        read-back per element was most of what reading the page's boxes cost, for
        a handful of distinct colours. */
    rgba(css) {
      return list[this.id(css)]
    },
  }
}

const distance = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])

/* ----------------------------------------------------------------- reading -- */

function scratchCanvas() {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 160
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  return ctx ? { canvas, ctx } : null
}

function transformed(text, transform) {
  if (transform === 'uppercase') return text.toUpperCase()
  if (transform === 'lowercase') return text.toLowerCase()
  if (transform === 'capitalize') return text.replace(/\b\p{L}/gu, (c) => c.toUpperCase())
  return text
}

/** Every word under `root`, as dots: drawn where the DOM says it is, in its own
    font, and sampled on a grid. */
function readWords(root, push, palette, scratch) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement
    if (!parent || parent.closest('svg') || !node.data.trim()) continue
    const style = getComputedStyle(parent)
    if (style.display === 'none') continue
    const size = Number.parseFloat(style.fontSize) || 16
    const colour = palette.id(style.color)
    const step = textStep(size)

    for (const match of node.data.matchAll(/\S+/g)) {
      range.setStart(node, match.index)
      range.setEnd(node, match.index + match[0].length)
      const rect = range.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) continue

      const word = transformed(match[0], style.textTransform)
      const w = Math.ceil(rect.width) + PAD * 2 + 4
      const h = Math.ceil(rect.height) + PAD * 2
      if (w > scratch.canvas.width) scratch.canvas.width = w
      if (h > scratch.canvas.height) scratch.canvas.height = h
      const { ctx } = scratch
      ctx.clearRect(0, 0, w, h)
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      if ('letterSpacing' in ctx) ctx.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = '#000'
      // A range's box is the font's content area, so its top is the baseline less
      // the font's ascent.
      const ascent = ctx.measureText(word).fontBoundingBoxAscent ?? size * 0.8
      ctx.fillText(word, PAD, PAD + ascent)

      const { data } = ctx.getImageData(0, 0, w, h)
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          if (data[(y * w + x) * 4 + 3] > COVERAGE) push(rect.left - PAD + x, rect.top - PAD + y, colour)
        }
      }
    }
  }
}

/** Every element's filled box and border, as dots. */
function readBoxes(root, push, palette, pageColour) {
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (element instanceof SVGElement) continue
    const rect = element.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue
    const style = getComputedStyle(element)

    const fill = palette.rgba(style.backgroundColor)
    if (fill[3] > 0.05 && distance(fill, pageColour) > MIN_FILL_CONTRAST) {
      const id = palette.id(style.backgroundColor)
      for (let y = rect.top + FILL_STEP / 2; y < rect.bottom; y += FILL_STEP) {
        for (let x = rect.left + FILL_STEP / 2; x < rect.right; x += FILL_STEP) push(x, y, id)
      }
    }

    if (Number.parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none') {
      const edge = palette.rgba(style.borderTopColor)
      if (edge[3] > 0.05) {
        const id = palette.id(style.borderTopColor)
        for (let x = rect.left; x <= rect.right; x += EDGE_STEP) {
          push(x, rect.top, id)
          push(x, rect.bottom, id)
        }
        for (let y = rect.top + EDGE_STEP; y < rect.bottom; y += EDGE_STEP) {
          push(rect.left, y, id)
          push(rect.right, y, id)
        }
      }
    }
  }
}

/** What is inside `root`, as dots, in coordinates relative to `stage`. */
function readDots(root, stage, palette, scratch, pageColour) {
  const xs = []
  const ys = []
  const cs = []
  const push = (x, y, c) => {
    xs.push(x - stage.left)
    ys.push(y - stage.top)
    cs.push(c)
  }
  readBoxes(root, push, palette, pageColour)
  readWords(root, push, palette, scratch)
  return cloud(xs, ys, cs)
}

/* ----------------------------------------------------------------- drawing -- */

/**
 * Plays the transition: the dots of `from` break up, scatter, and gather into
 * `to`. `from` and `to` are the elements whose content is leaving and arriving
 * (both laid out, whatever their visibility, at the moment this is called).
 *
 * `onSettle` fires when the dots have landed and the real content should fade in
 * beneath them; `onDone` when the run is over and the canvas is clear. Returns
 * `{ cancel }` — which stops everything and calls neither — or null where it
 * cannot run (no 2D canvas, nothing to see, anything throwing), meaning: swap now.
 */
export function startDotMorph({ canvas, from, to, onSettle, onDone }) {
  const ctx = canvas?.getContext?.('2d')
  if (!ctx || !from || !to) return null
  const stage = canvas.getBoundingClientRect()
  if (!(stage.width > 0 && stage.height > 0)) return null

  let plan
  let palette
  try {
    const probeCanvas = document.createElement('canvas')
    probeCanvas.width = 1
    probeCanvas.height = 1
    const probe = probeCanvas.getContext('2d', { willReadFrequently: true })
    const scratch = scratchCanvas()
    if (!probe || !scratch) return null

    palette = makePalette(probe)
    const shell = canvas.closest('.auth-shell') ?? document.body
    const pageColour = readColour(probe, getComputedStyle(shell).backgroundColor)
    const source = readDots(from, stage, palette, scratch, pageColour)
    const target = readDots(to, stage, palette, scratch, pageColour)
    if (source.count === 0 || target.count === 0) return null
    plan = planMorph(source, target)
  } catch {
    return null
  }

  const ratio = Math.min(window.devicePixelRatio || 1, MAX_DPR)
  canvas.width = Math.round(stage.width * ratio)
  canvas.height = Math.round(stage.height * ratio)
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)

  // Every colour a dot can be: each (from, to) pair at each step of the mix,
  // made the first time it is asked for.
  const size = palette.list.length
  const steps = COLOUR_STEPS + 1
  const table = new Int32Array(size * size * steps).fill(-1)
  const colours = []
  function colourId(a, b, step) {
    const at = (a * size + b) * steps + step
    if (table[at] >= 0) return table[at]
    const k = step / COLOUR_STEPS
    const [r1, g1, b1, a1] = palette.list[a]
    const [r2, g2, b2, a2] = palette.list[b]
    colours.push(
      `rgba(${Math.round(r1 + (r2 - r1) * k)},${Math.round(g1 + (g2 - g1) * k)},${Math.round(b1 + (b2 - b1) * k)},${(a1 + (a2 - a1) * k).toFixed(3)})`,
    )
    table[at] = colours.length - 1
    return table[at]
  }

  const { count } = plan
  const px = new Float32Array(count)
  const py = new Float32Array(count)
  const ids = new Uint16Array(count)
  const order = new Uint32Array(count)
  const counts = new Uint32Array(size * size * steps + 1)
  const starts = new Uint32Array(size * size * steps + 1)
  const at = new Float32Array(3)
  const half = DOT / 2

  function draw(timeMs) {
    ctx.clearRect(0, 0, stage.width, stage.height)
    const alpha = dotAlpha(timeMs)
    if (alpha <= 0) return

    counts.fill(0)
    for (let i = 0; i < count; i += 1) {
      positionAt(plan, i, timeMs, at)
      px[i] = at[0]
      py[i] = at[1]
      const id = colourId(plan.cFrom[i], plan.cTo[i], mixStep(at[2]))
      ids[i] = id
      counts[id] += 1
    }
    // A counting sort by colour, so each colour is one path and one fill.
    let total = 0
    for (let id = 0; id < colours.length; id += 1) {
      starts[id] = total
      total += counts[id]
    }
    for (let i = 0; i < count; i += 1) {
      order[starts[ids[i]]] = i
      starts[ids[i]] += 1
    }
    ctx.globalAlpha = alpha
    for (let id = 0; id < colours.length; id += 1) {
      if (!counts[id]) continue
      ctx.fillStyle = colours[id]
      ctx.beginPath()
      for (let k = starts[id] - counts[id]; k < starts[id]; k += 1) {
        const i = order[k]
        ctx.rect(px[i] - half, py[i] - half, DOT, DOT)
      }
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  let frame = 0
  let timer = 0
  let startedAt = 0
  let settled = false
  let ended = false

  function stop() {
    ended = true
    if (frame) cancelAnimationFrame(frame)
    clearTimeout(timer)
    frame = 0
    ctx.clearRect(0, 0, stage.width, stage.height)
  }

  function settle() {
    if (settled) return
    settled = true
    onSettle?.()
  }

  function finish() {
    if (ended) return
    stop()
    settle()
    onDone?.()
  }

  function tick(now) {
    frame = 0
    if (ended) return
    if (!startedAt) startedAt = now
    const elapsed = now - startedAt
    if (elapsed >= TOTAL_MS) {
      finish()
      return
    }
    if (elapsed >= GATHER_END_MS) settle()
    draw(elapsed)
    frame = requestAnimationFrame(tick)
  }

  // The first frame is drawn here, before the browser paints the one in which the
  // real content went away: there is never a frame with neither.
  draw(0)
  frame = requestAnimationFrame(tick)
  // rAF stops in a hidden tab; this does not, and the screen must not wait on it.
  timer = setTimeout(finish, TOTAL_MS + 500)

  return {
    cancel() {
      if (!ended) stop()
    },
  }
}
