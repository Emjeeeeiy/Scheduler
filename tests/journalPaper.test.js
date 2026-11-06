import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { JSDOM } from 'jsdom'
import {
  PAPER_PATTERNS,
  PAPER_SPACING,
  PAPER_WEIGHTS,
  defaultPaper,
  normalizePaper,
} from '@cadence/shared/journal.js'
import {
  INK_ON_DARK,
  INK_ON_LIGHT,
  PAPER_PRESETS,
  PATTERN_META,
  canSnap,
  contrastInk,
  contrastRatio,
  luminance,
  matchPreset,
  maskUrl,
  paperStyle,
  patternTile,
  presetPaper,
  resolvePaperHex,
  THEME_PAPER,
} from '../src/lib/journalPaper.js'
import {
  FONT_SIZES,
  JOURNAL_FONTS,
  clampFontSize,
  firstFamily,
  fontForValue,
  parseFontSize,
  stepFontSize,
} from '../src/lib/journalFonts.js'
import {
  HIGHLIGHT_COLORS,
  PAPER_COLORS,
  TEXT_COLORS,
  asMarker,
  isLowContrast,
} from '../src/lib/journalColors.js'
import { formatBytes, formatEdited, noteCountLabel } from '../src/lib/journalFormat.js'

describe('contrast', () => {
  it('measures black on white as 21:1 and a colour against itself as 1:1', () => {
    assert.ok(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 0.01)
    assert.equal(contrastRatio('#336699', '#336699'), 1)
  })

  it('has the right luminance at the extremes', () => {
    assert.equal(luminance('#000000'), 0)
    assert.ok(Math.abs(luminance('#ffffff') - 1) < 1e-9)
    assert.equal(luminance('not a colour'), 0)
  })

  it('picks dark ink on light paper and light ink on dark paper', () => {
    for (const light of ['#ffffff', '#fbf7ea', '#fff6a8', '#eaf3fb', '#c8a77a']) {
      assert.equal(contrastInk(light), INK_ON_LIGHT, light)
    }
    for (const dark of ['#000000', '#10141f', '#263b2f', '#1b4f8a', '#2b2d31']) {
      assert.equal(contrastInk(dark), INK_ON_DARK, dark)
    }
  })

  it('always chooses an ink that clears 4.5:1 on the preset papers', () => {
    for (const preset of PAPER_PRESETS) {
      const { paperColor } = presetPaper(preset)
      if (paperColor === 'theme') continue
      const ink = contrastInk(paperColor)
      assert.ok(contrastRatio(ink, paperColor) >= 4.5, `${preset.id} ${paperColor}`)
    }
  })
})

/* A browser draws nothing at all for an SVG that is not well-formed XML — a
   repeated attribute is enough — so counting angle brackets proves nothing.
   This parses each tile the way the browser's image decoder will. */
const xml = new new JSDOM('').window.DOMParser()
const parsesAsXml = (svg) => xml.parseFromString(svg, 'image/svg+xml').getElementsByTagName('parsererror').length === 0

describe('patternTile', () => {
  it('has no tile for blank paper', () => {
    assert.equal(patternTile({ pattern: 'plain' }), null)
  })

  it('rejects malformed XML in the checker itself (so the next test can be trusted)', () => {
    assert.equal(parsesAsXml("<svg xmlns='http://www.w3.org/2000/svg'><path a='1' a='2'/></svg>"), false)
    assert.equal(parsesAsXml("<svg xmlns='http://www.w3.org/2000/svg'><path a='1'/></svg>"), true)
  })

  it('emits every tile as well-formed XML, at every spacing and weight', () => {
    for (const pattern of PAPER_PATTERNS) {
      if (pattern === 'plain') continue
      for (const spacing of [PAPER_SPACING.min, 24, 37, PAPER_SPACING.max]) {
        for (const weight of PAPER_WEIGHTS) {
          const { svg } = patternTile({ pattern, spacing, weight })
          assert.ok(parsesAsXml(svg), `${pattern} s=${spacing} w=${weight} is not well-formed XML: ${svg}`)
        }
      }
    }
  })

  it('draws every other pattern as a well-formed, positively sized tile', () => {
    for (const pattern of PAPER_PATTERNS) {
      if (pattern === 'plain') continue
      for (const spacing of [PAPER_SPACING.min, 24, 37, PAPER_SPACING.max]) {
        for (const weight of PAPER_WEIGHTS) {
          const tile = patternTile({ pattern, spacing, weight })
          const label = `${pattern} s=${spacing} w=${weight}`
          assert.ok(tile, label)
          assert.ok(tile.width >= 1 && tile.height >= 1, `${label} has a size`)
          assert.ok(Number.isFinite(tile.width) && Number.isFinite(tile.height), label)
          assert.ok(tile.svg.startsWith('<svg '), label)
          assert.ok(tile.svg.endsWith('</svg>'), label)
          assert.ok(!tile.svg.includes('"'), `${label}: double quotes would break url("…")`)
          assert.ok(!/NaN|undefined|Infinity/.test(tile.svg), `${label}: no bad numbers`)
          assert.equal(tile.svg.split('<').length, tile.svg.split('>').length, `${label}: balanced tags`)
        }
      }
    }
  })

  it('puts the rule at the bottom of a lined tile so a line box sits on it', () => {
    const tile = patternTile({ pattern: 'lined', spacing: 28, weight: 1 })
    assert.equal(tile.width, 28)
    assert.equal(tile.height, 28)
    assert.match(tile.svg, /<rect x='0' y='27' width='28' height='1'\/>/)
  })

  it('centres a dot and offsets it half a cell, so dots land on multiples of the spacing', () => {
    const tile = patternTile({ pattern: 'dots', spacing: 24 })
    assert.match(tile.svg, /<circle cx='12' cy='12'/)
    assert.equal(tile.offsetX, 12)
    assert.equal(tile.offsetY, 12)
  })

  it('makes graph paper five cells square, with a stronger line at the edge', () => {
    const tile = patternTile({ pattern: 'graph', spacing: 20 })
    assert.equal(tile.width, 100)
    assert.equal(tile.height, 100)
    assert.match(tile.svg, /<g opacity='0.45'>/)
  })

  it('keeps isometric tiles on a 60° lattice', () => {
    const tile = patternTile({ pattern: 'isodots', spacing: 20 })
    assert.equal(tile.width, 20)
    assert.equal(tile.height, Math.round(20 * Math.sqrt(3)))
  })

  it('repeats the hexagon unit one hexagon wide and 1.5 tall', () => {
    const tile = patternTile({ pattern: 'hex', spacing: 40 })
    assert.equal(tile.width, 40)
    assert.equal(tile.height, Math.round((3 * 40) / Math.sqrt(3)))
  })

  it('keeps the dash period a divisor of the tile so handwriting guides do not seam', () => {
    const tile = patternTile({ pattern: 'handwriting', spacing: 28 })
    assert.equal(tile.width % 8, 0)
  })

  it('describes every pattern for the picker', () => {
    assert.deepEqual(
      PATTERN_META.map((p) => p.id),
      PAPER_PATTERNS,
    )
    for (const meta of PATTERN_META) assert.equal(canSnap(meta.id), meta.snappable)
  })
})

describe('maskUrl', () => {
  it('wraps an SVG as a url() that survives double quotes', () => {
    const url = maskUrl("<svg xmlns='http://www.w3.org/2000/svg'><rect/></svg>")
    assert.ok(url.startsWith('url("data:image/svg+xml,'))
    assert.ok(url.endsWith('")'))
    assert.ok(!url.slice(5, -2).includes('"'))
    assert.ok(decodeURIComponent(url.slice(24, -2)).includes('<rect/>'))
  })
})

describe('paperStyle', () => {
  it('draws theme paper from the app tokens, so it follows light and dark', () => {
    const { style, attrs } = paperStyle(defaultPaper())
    assert.equal(style['--paper'], 'var(--color-surface-1)')
    assert.equal(style['--note-ink'], 'var(--color-text-primary)')
    assert.match(style['--pattern-color'], /^color-mix\(in srgb, var\(--note-ink\) \d+%, var\(--paper\)\)$/)
    assert.equal(attrs['data-pattern'], 'dots')
    assert.equal(attrs['data-snap'], 'off')
  })

  it('gives a custom paper its own ink and keeps a custom pattern colour', () => {
    const { style } = paperStyle({ pattern: 'grid', paperColor: '#10141f', patternColor: '#5a6794' })
    assert.equal(style['--paper'], '#10141f')
    assert.equal(style['--note-ink'], INK_ON_DARK)
    assert.equal(style['--pattern-color'], '#5a6794')
  })

  it('hides the pattern layer for blank paper instead of painting a solid slab', () => {
    const { style } = paperStyle({ pattern: 'plain' })
    assert.equal(style['--pattern-mask'], 'none')
    assert.equal(style['--pattern-opacity'], '0')
  })

  it('only snaps patterns that have one rule per line', () => {
    assert.equal(paperStyle({ pattern: 'lined', snap: true }).snap, true)
    assert.equal(paperStyle({ pattern: 'lined', snap: true }).attrs['data-snap'], 'on')
    assert.equal(paperStyle({ pattern: 'hex', snap: true }).snap, false)
    assert.equal(paperStyle({ pattern: 'lined', snap: false }).snap, false)
  })

  it('exposes the margin style, and Cornell supplies its own', () => {
    assert.equal(paperStyle({ pattern: 'lined', margin: 'double' }).attrs['data-margin'], 'double')
    assert.equal(paperStyle({ pattern: 'cornell', margin: 'none' }).attrs['data-margin'], 'cornell')
  })

  it('sets the rule spacing and opacity as plain values', () => {
    const { style } = paperStyle({ pattern: 'lined', spacing: 30, patternOpacity: 0.5 })
    assert.equal(style['--rule'], '30px')
    assert.equal(style['--pattern-opacity'], '0.5')
  })

  it('tolerates garbage by falling back to the default paper', () => {
    assert.doesNotThrow(() => paperStyle(undefined))
    assert.doesNotThrow(() => paperStyle({ pattern: 'nope', spacing: 'x', paperColor: 12 }))
  })
})

describe('resolvePaperHex', () => {
  it('resolves theme paper by the active theme and keeps a custom colour as is', () => {
    assert.equal(resolvePaperHex(defaultPaper(), false), THEME_PAPER.light)
    assert.equal(resolvePaperHex(defaultPaper(), true), THEME_PAPER.dark)
    assert.equal(resolvePaperHex({ paperColor: '#ffe8d6' }, true), '#ffe8d6')
  })

  it('agrees with what the ink picker would consider light and dark', () => {
    assert.equal(contrastInk(THEME_PAPER.light), INK_ON_LIGHT)
    assert.equal(contrastInk(THEME_PAPER.dark), INK_ON_DARK)
  })
})

describe('PAPER_PRESETS', () => {
  it('has unique ids and labels', () => {
    assert.equal(new Set(PAPER_PRESETS.map((p) => p.id)).size, PAPER_PRESETS.length)
    assert.equal(new Set(PAPER_PRESETS.map((p) => p.label)).size, PAPER_PRESETS.length)
  })

  it('only names patterns and colours the normalizer accepts unchanged', () => {
    for (const preset of PAPER_PRESETS) {
      const once = presetPaper(preset)
      assert.deepEqual(normalizePaper(once), once, preset.id)
      assert.equal(once.pattern, preset.paper.pattern, `${preset.id} keeps its pattern`)
      if (preset.paper.paperColor) assert.equal(once.paperColor, preset.paper.paperColor, preset.id)
      if (preset.paper.patternColor) assert.equal(once.patternColor, preset.paper.patternColor, preset.id)
    }
  })

  it('finds the preset a paper matches, and none after a tweak', () => {
    const legal = PAPER_PRESETS.find((p) => p.id === 'legal')
    assert.equal(matchPreset(presetPaper(legal)).id, 'legal')
    assert.equal(matchPreset({ ...presetPaper(legal), spacing: 40 }), null)
  })
})

describe('fonts', () => {
  it('recognises a stored family however its quotes and spacing were written', () => {
    assert.equal(fontForValue(null).id, 'default')
    assert.equal(fontForValue('Georgia, serif').id, 'georgia')
    assert.equal(fontForValue('"Times New Roman",Times,serif').id, 'times')
    assert.equal(fontForValue("'Space Mono', ui-monospace, monospace").id, 'mono')
  })

  it('matches on the first family when the fallbacks differ, and gives up on strangers', () => {
    assert.equal(fontForValue('Georgia').id, 'georgia')
    assert.equal(fontForValue('Papyrus, fantasy'), null)
    assert.equal(firstFamily("'Papyrus', fantasy"), 'Papyrus')
  })

  it('ends every stack in a generic family so a missing face still looks right', () => {
    for (const font of JOURNAL_FONTS) {
      if (!font.value) continue
      assert.match(font.value, /(serif|sans-serif|monospace|cursive)$/, font.id)
    }
  })

  it('reads point and pixel sizes, and nothing else', () => {
    assert.equal(parseFontSize('12pt'), 12)
    assert.equal(parseFontSize('16px'), 12)
    assert.equal(parseFontSize('10.5pt'), 10.5)
    assert.equal(parseFontSize('large'), null)
    assert.equal(parseFontSize(12), null)
  })

  it('steps through the offered sizes, and past the ends', () => {
    assert.equal(stepFontSize(12, 1), 14)
    assert.equal(stepFontSize(12, -1), 11)
    assert.equal(stepFontSize(13, 1), 14)
    assert.equal(stepFontSize(13, -1), 12)
    assert.equal(stepFontSize(null, 1), 14, 'unset means the default size')
    assert.equal(stepFontSize(72, 1), 76)
    assert.equal(stepFontSize(8, -1), 7)
    assert.equal(clampFontSize(500), 200)
    assert.equal(clampFontSize(1), 6)
    assert.deepEqual([...FONT_SIZES].sort((a, b) => a - b), FONT_SIZES)
  })
})

describe('colours', () => {
  it('makes highlights translucent so text keeps its own colour', () => {
    for (const swatch of HIGHLIGHT_COLORS) assert.match(swatch.value, /^#[0-9a-f]{6}99$/i, swatch.name)
    assert.equal(asMarker('#ABC'), '#aabbcc99')
    assert.equal(asMarker('nope'), 'nope')
  })

  it('names every swatch, with no duplicate hex within a palette', () => {
    for (const palette of [TEXT_COLORS, HIGHLIGHT_COLORS, PAPER_COLORS]) {
      for (const swatch of palette) assert.ok(swatch.name && swatch.value)
      assert.equal(new Set(palette.map((s) => s.value)).size, palette.length)
    }
  })

  it('flags a colour that disappears on the paper', () => {
    assert.equal(isLowContrast('#000000', '#10141f'), true)
    assert.equal(isLowContrast('#ffffff', '#10141f'), false)
    assert.equal(isLowContrast('#ffd43b99', '#ffffff'), true, 'ignores the alpha channel')
    assert.equal(isLowContrast('#2f9e44', null), false)
  })
})

describe('formatEdited', () => {
  const now = new Date(2026, 10, 6, 15, 0, 0).getTime()
  const ago = (ms) => now - ms

  it('reads recent edits relatively', () => {
    assert.equal(formatEdited(ago(5_000), now), 'just now')
    assert.equal(formatEdited(ago(5 * 60_000), now), '5m ago')
    assert.equal(formatEdited(ago(2 * 3_600_000), now), '2h ago')
  })

  it('says Yesterday, then a weekday, then a date', () => {
    assert.equal(formatEdited(new Date(2026, 10, 5, 9, 0).getTime(), now), 'Yesterday')
    assert.match(formatEdited(new Date(2026, 10, 2, 9, 0).getTime(), now), /\w{3}/)
    assert.match(formatEdited(new Date(2026, 8, 3, 9, 0).getTime(), now), /Sep|3/)
    assert.match(formatEdited(new Date(2025, 2, 3, 9, 0).getTime(), now), /2025/)
  })

  it('shows nothing for a missing stamp', () => {
    assert.equal(formatEdited(0, now), '')
    assert.equal(formatEdited(undefined, now), '')
  })

  it('labels counts and sizes', () => {
    assert.equal(noteCountLabel(1), '1 note')
    assert.equal(noteCountLabel(0), '0 notes')
    assert.equal(formatBytes(0), '0 KB')
    assert.equal(formatBytes(500), '<1 KB')
    assert.equal(formatBytes(312_000), '305 KB')
    assert.equal(formatBytes(2_500_000), '2.4 MB')
  })
})
