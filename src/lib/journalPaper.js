/* The Journal's paper: what a note's background is made of and how it is drawn.
 *
 * A pattern is an SVG tile used as a CSS mask. The tile is drawn in solid black
 * (only its alpha matters) and the sheet paints `--pattern-color` through it, so
 * one mechanism covers every shape — dots, rules, hexagons, a music staff — and
 * the colour is an ordinary custom property: changing it re-paints live, and
 * the "auto" colour follows light/dark with no stored hex.
 *
 * Everything here is pure (no DOM, no React) so it can be tested under Node.
 * `paperStyle()` is the single entry point the sheet, the picker's thumbnails
 * and the print view all call, which is what keeps a thumbnail and the page it
 * previews from ever disagreeing.
 */

import { PAPER_PATTERNS, normalizeHex, normalizePaper } from '@cadence/shared/journal.js'

/* ------------------------------------------------------------- colours -- */

function rgbOf(hex) {
  const value = normalizeHex(hex)
  if (!value) return null
  return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16))
}

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex) {
  const rgb = rgbOf(hex)
  if (!rgb) return 0
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two #rrggbb colours (1 – 21). */
export function contrastRatio(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

export const INK_ON_LIGHT = '#0b0b0b'
export const INK_ON_DARK = '#f5f5f2'

/** The text colour that reads best on a custom paper colour. Compared by real
    contrast ratio rather than a luminance cut-off, so a mid-tone paper picks
    whichever ink is genuinely more legible. */
export function contrastInk(paperHex) {
  return contrastRatio(INK_ON_LIGHT, paperHex) >= contrastRatio(INK_ON_DARK, paperHex)
    ? INK_ON_LIGHT
    : INK_ON_DARK
}

/* ------------------------------------------------------------ patterns -- */

export const PATTERN_META = [
  { id: 'plain', label: 'Blank', snappable: false },
  { id: 'lined', label: 'Lined', snappable: true },
  { id: 'dots', label: 'Dot grid', snappable: true },
  { id: 'grid', label: 'Grid', snappable: true },
  { id: 'graph', label: 'Graph', snappable: true },
  { id: 'isodots', label: 'Isometric dots', snappable: false },
  { id: 'isogrid', label: 'Isometric grid', snappable: false },
  { id: 'hex', label: 'Hexagons', snappable: false },
  { id: 'cross', label: 'Crosshatch', snappable: false },
  { id: 'staff', label: 'Music staff', snappable: false },
  { id: 'handwriting', label: 'Handwriting', snappable: false },
  { id: 'cornell', label: 'Cornell', snappable: true },
]

const SNAPPABLE = new Set(PATTERN_META.filter((p) => p.snappable).map((p) => p.id))
const SQRT3 = Math.sqrt(3)

const num = (n) => Number(n.toFixed(2))

/* Rules are drawn at the BOTTOM edge of a tile and verticals at the RIGHT edge,
   so a line box of height `s` sitting on tile row k has its rule exactly under
   it. That convention is what makes "snap text to the lines" a matter of
   line-height alone. */
const rect = (x, y, w, h) => `<rect x='${num(x)}' y='${num(y)}' width='${num(w)}' height='${num(h)}'/>`
const circle = (x, y, r) => `<circle cx='${num(x)}' cy='${num(y)}' r='${num(r)}'/>`
/* Attributes are merged as an object, never concatenated: a repeated attribute
   is not well-formed XML, and a browser silently refuses to draw an SVG that is
   not — the whole pattern just vanishes. */
const path = (d, w, override = {}) => {
  const attrs = {
    fill: 'none',
    stroke: '#000',
    'stroke-width': w,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    ...override,
  }
  const text = Object.entries(attrs)
    .map(([name, value]) => `${name}='${value}'`)
    .join(' ')
  return `<path d='${d}' ${text}/>`
}

function svgOf(width, height, body) {
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' ` +
    `viewBox='0 0 ${width} ${height}' fill='#000'>${body}</svg>`
  )
}

/* Each builder returns { width, height, body, offsetX, offsetY }. The offset
   moves the tile origin so the pattern's rule rows land on multiples of the
   spacing, measured from the top-left of the sheet. */
const BUILDERS = {
  lined: (s, w) => ({
    width: s,
    height: s,
    body: rect(0, s - w, s, w),
  }),

  grid: (s, w) => ({
    width: s,
    height: s,
    body: rect(0, s - w, s, w) + rect(s - w, 0, w, s - w),
  }),

  /* Dots sit on the grid's intersections: the tile centres the dot, and the
     half-tile offset moves the intersections onto multiples of `s`. */
  dots: (s, w) => ({
    width: s,
    height: s,
    body: circle(s / 2, s / 2, w * 0.9 + 0.2),
    offsetX: s / 2,
    offsetY: s / 2,
  }),

  /* Minor lines every `s`, a stronger major line every fifth. Two groups with
     their own opacity (not per-shape fill-opacity) so crossings don't darken
     where two translucent lines overlap. */
  graph: (s, w) => {
    const size = s * 5
    let minor = ''
    for (let i = 1; i < 5; i++) {
      minor += rect(0, i * s - w, size, w) + rect(i * s - w, 0, w, size)
    }
    const major = rect(0, size - w, size, w) + rect(size - w, 0, w, size - w)
    return {
      width: size,
      height: size,
      body: `<g opacity='0.45'>${minor}</g><g>${major}</g>`,
    }
  },

  /* A triangular lattice: rows `h/2` apart, every other row shifted by half a
     step. Dots on the shared edge of two tiles are drawn in both halves. */
  isodots: (s, w) => {
    const h = Math.round(s * SQRT3)
    const r = w * 0.9 + 0.2
    return {
      width: s,
      height: h,
      body: circle(s / 2, h / 4, r) + circle(0, (3 * h) / 4, r) + circle(s, (3 * h) / 4, r),
    }
  },

  /* Horizontals plus the two 60° diagonals, drawn well past the tile on each
     side so the stroke is whole where it crosses a tile edge. */
  isogrid: (s, w) => {
    const h = Math.round(s * SQRT3)
    const body =
      path(`M0 0H${s}`, w) +
      path(`M0 ${h / 2}H${s}`, w) +
      path(`M0 ${h}H${s}`, w) +
      path(`M${-s / 2} ${-h / 2}L${(3 * s) / 2} ${(3 * h) / 2}`, w) +
      path(`M${(3 * s) / 2} ${-h / 2}L${-s / 2} ${(3 * h) / 2}`, w)
    return { width: s, height: h, body }
  },

  /* A pointy-top hexagon tiling. The tile is the repeat unit (one hexagon wide,
     one and a half tall) and the whole shape is shifted off the tile edge, with
     the overflow wrapped back round, so no vertex sits exactly on a boundary
     where its join would be clipped. */
  hex: (s, w) => {
    const width = Math.max(8, 2 * Math.round(s / 2))
    const height = Math.round((3 * width) / SQRT3)
    const r = height / 3
    const dx = width / 4
    const dy = r / 2
    const shape =
      `M${-width / 2} 0L0 ${r / 2}L${width / 2} 0L${width} ${r / 2}L${(3 * width) / 2} 0` +
      `M0 ${r / 2}V${(3 * r) / 2}M${width} ${r / 2}V${(3 * r) / 2}` +
      `M${-width / 2} ${2 * r}L0 ${(3 * r) / 2}L${width / 2} ${2 * r}L${width} ${(3 * r) / 2}L${(3 * width) / 2} ${2 * r}` +
      `M${width / 2} ${2 * r}V${3 * r}`
    const place = (y) => `<g transform='translate(${num(dx)} ${num(y)})'>${path(shape, w)}</g>`
    return { width, height, body: place(dy) + place(dy - height) }
  },

  cross: (s, w) => ({
    width: s,
    height: s,
    body:
      path(`M${-w} ${-w}L${s + w} ${s + w}`, w) + path(`M${s + w} ${-w}L${-w} ${s + w}`, w),
  }),

  /* Staves of five lines, a third of the spacing apart, with room between. */
  staff: (s, w) => {
    const gap = Math.max(3, Math.round(s / 3))
    const height = Math.round(s * 3)
    const top = Math.round((height - 4 * gap) / 2)
    let body = ''
    for (let i = 0; i < 5; i++) body += rect(0, top + i * gap, 32, w)
    return { width: 32, height, body }
  },

  /* Top line, dashed midline, baseline — the guide children learn letters on. */
  handwriting: (s, w) => {
    const height = Math.round(s * 1.5)
    const top = Math.round(height * 0.18)
    const mid = Math.round(height * 0.52)
    const base = Math.round(height * 0.86)
    return {
      width: 32,
      height,
      body:
        `<g opacity='0.6'>${rect(0, top, 32, w)}</g>` +
        path(`M0 ${mid + w / 2}H32`, w, {
          'stroke-dasharray': '4 4',
          'stroke-linecap': 'butt',
          opacity: 0.6,
        }) +
        rect(0, base, 32, w),
    }
  },
}

BUILDERS.cornell = BUILDERS.lined

/** The tile for a paper, or null when the paper has no pattern (Blank). */
export function patternTile(paperInput) {
  const paper = normalizePaper(paperInput)
  const build = BUILDERS[paper.pattern]
  if (!build) return null
  const tile = build(paper.spacing, paper.weight)
  return {
    svg: svgOf(tile.width, tile.height, tile.body),
    width: tile.width,
    height: tile.height,
    offsetX: tile.offsetX ?? 0,
    offsetY: tile.offsetY ?? 0,
  }
}

/** Only patterns whose rules sit one per line can have text snapped to them. */
export function canSnap(pattern) {
  return SNAPPABLE.has(pattern)
}

/** An SVG string -> a value for `mask-image`. Single quotes inside the SVG and
    full percent-encoding outside keep it valid within `url("…")` everywhere. */
export function maskUrl(svg) {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/** The app's own paper colours, as the tokens resolve them. Kept beside the
    theme tokens' values in tokens.css (--color-surface-1) because a contrast
    check needs a real colour to compare against, and a CSS variable has none
    until the browser computes it. */
export const THEME_PAPER = { light: '#fcfcfb', dark: '#131313' }

/** The colour a note's paper actually is right now. */
export function resolvePaperHex(paperInput, dark) {
  const paper = normalizePaper(paperInput)
  return paper.paperColor === 'theme' ? (dark ? THEME_PAPER.dark : THEME_PAPER.light) : paper.paperColor
}

/* -------------------------------------------------------------- presets -- */

/* Whole looks, not just patterns. A preset is a partial paper — anything it
   leaves out takes the default — so adding one never requires touching the
   normalizer. The warm and coloured papers are user content in the same sense
   a tag colour is: chrome stays neutral, what you write on is yours to colour. */
export const PAPER_PRESETS = [
  { id: 'dots', label: 'Dots', paper: { pattern: 'dots' } },
  { id: 'lined', label: 'Lined', paper: { pattern: 'lined', spacing: 28 } },
  { id: 'grid', label: 'Grid', paper: { pattern: 'grid' } },
  { id: 'blank', label: 'Blank', paper: { pattern: 'plain' } },
  {
    id: 'ivory',
    label: 'Ivory',
    paper: { pattern: 'lined', spacing: 28, paperColor: '#fbf7ea', patternColor: '#cdbf9a' },
  },
  {
    id: 'cream',
    label: 'Cream',
    paper: { pattern: 'dots', paperColor: '#f6efd9', patternColor: '#b9aa7f' },
  },
  {
    id: 'kraft',
    label: 'Kraft',
    paper: { pattern: 'dots', paperColor: '#c8a77a', patternColor: '#7a5a34' },
  },
  {
    id: 'legal',
    label: 'Legal pad',
    paper: {
      pattern: 'lined',
      spacing: 28,
      paperColor: '#fff6a8',
      patternColor: '#7fa8d4',
      margin: 'double',
      marginColor: '#d9534f',
      snap: true,
    },
  },
  {
    id: 'blueprint',
    label: 'Blueprint',
    paper: { pattern: 'grid', paperColor: '#1b4f8a', patternColor: '#8fc1f2', patternOpacity: 0.6 },
  },
  {
    id: 'engineering',
    label: 'Engineering',
    paper: { pattern: 'graph', paperColor: '#eef7ea', patternColor: '#4f9a5a' },
  },
  {
    id: 'chalkboard',
    label: 'Chalkboard',
    paper: { pattern: 'dots', paperColor: '#263b2f', patternColor: '#ffffff', patternOpacity: 0.3 },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    paper: { pattern: 'dots', paperColor: '#10141f', patternColor: '#5a6794' },
  },
  {
    id: 'blush',
    label: 'Blush',
    paper: { pattern: 'lined', spacing: 28, paperColor: '#fdeef0', patternColor: '#e3a7b3' },
  },
  {
    id: 'mint',
    label: 'Mint',
    paper: { pattern: 'dots', paperColor: '#e8f6ef', patternColor: '#6fb893' },
  },
  {
    id: 'sky',
    label: 'Sky',
    paper: { pattern: 'lined', spacing: 28, paperColor: '#eaf3fb', patternColor: '#8fb8de' },
  },
  {
    id: 'lavender',
    label: 'Lavender',
    paper: { pattern: 'grid', paperColor: '#f1ecfa', patternColor: '#b9a8e3' },
  },
  { id: 'staff', label: 'Music', paper: { pattern: 'staff' } },
  { id: 'iso', label: 'Isometric', paper: { pattern: 'isodots' } },
  { id: 'writing', label: 'Handwriting', paper: { pattern: 'handwriting', spacing: 28 } },
  { id: 'cornell', label: 'Cornell', paper: { pattern: 'cornell', spacing: 28, snap: true } },
]

export function presetPaper(preset) {
  return normalizePaper(preset.paper)
}

/** The preset a paper exactly matches, if any — what the picker highlights. */
export function matchPreset(paperInput) {
  const paper = normalizePaper(paperInput)
  const key = JSON.stringify(paper)
  return PAPER_PRESETS.find((preset) => JSON.stringify(presetPaper(preset)) === key) ?? null
}

/* ---------------------------------------------------------------- style -- */

/** Everything a sheet needs to draw `paper`: custom properties for `style`,
    plus data attributes the stylesheet branches on (margin lines, Cornell's
    column, snapped line-height). The "auto" pattern colour is the ink mixed into
    the paper, which keeps it legible on any paper without a contrast table. */
export function paperStyle(paperInput) {
  const paper = normalizePaper(paperInput)
  const theme = paper.paperColor === 'theme'
  const tile = patternTile(paper)
  const snap = paper.snap && canSnap(paper.pattern)

  const style = {
    '--paper': theme ? 'var(--color-surface-1)' : paper.paperColor,
    '--note-ink': theme ? 'var(--color-text-primary)' : contrastInk(paper.paperColor),
    '--pattern-color':
      paper.patternColor === 'auto'
        ? `color-mix(in srgb, var(--note-ink) ${paper.pattern === 'dots' || paper.pattern === 'isodots' ? 34 : 24}%, var(--paper))`
        : paper.patternColor,
    '--pattern-opacity': String(paper.patternOpacity),
    '--rule': `${paper.spacing}px`,
    '--margin-color':
      paper.marginColor === 'auto'
        ? 'color-mix(in srgb, #d9534f 70%, var(--paper))'
        : paper.marginColor,
  }

  if (tile) {
    style['--pattern-mask'] = maskUrl(tile.svg)
    style['--pattern-size'] = `${tile.width}px ${tile.height}px`
    style['--pattern-offset'] = `${num(tile.offsetX)}px ${num(tile.offsetY)}px`
  } else {
    /* No mask means "paint everywhere", which is the opposite of no pattern:
       blank paper would come out as a solid slab of the pattern colour. Hiding
       the layer here, not in one stylesheet rule, keeps every consumer — the
       sheet, the picker's thumbnails, the print view — correct by construction. */
    style['--pattern-mask'] = 'none'
    style['--pattern-opacity'] = '0'
  }

  return {
    style,
    attrs: {
      'data-pattern': paper.pattern,
      'data-margin': paper.pattern === 'cornell' ? 'cornell' : paper.margin,
      'data-snap': snap ? 'on' : 'off',
    },
    paper,
    snap,
  }
}

export { PAPER_PATTERNS }
