/* Coral is the one accent (DESIGN.md → Accent: Coral), and it only works because
 * of four numbers that are easy to break by nudging a hex: black on the coral
 * fill, black on its hover step, the deeper "text" coral on the light page and
 * hover surface, and the "line" coral (rings, strokes, the now-line) at the 3:1 a
 * graphic needs. White on #f95c4b is 3.15:1 and coral as text on light Paper is
 * 2.99:1 — both fail — which is the whole reason the roles are split.
 *
 * This reads the shipped tokens.css rather than a copy of the values, so a
 * change to the stylesheet is what is held to account. It also pins the
 * declaration rule: a value that differs in dark is declared in BOTH dark
 * blocks (the OS media query and the in-app [data-theme] scope), and
 * on-accent is declared once, because it must not flip with Ink.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'
import { contrastRatio } from '../src/lib/journalPaper.js'

const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')

/** The text of the first `{ … }` block after `marker`, braces balanced. */
function blockAfter(marker) {
  const start = css.indexOf('{', css.indexOf(marker))
  assert.ok(start > -1, `no block after ${marker}`)
  let depth = 0
  for (let i = start; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') depth -= 1
    if (depth === 0) return css.slice(start + 1, i)
  }
  throw new Error(`unbalanced block after ${marker}`)
}

/** The custom properties a block declares, name → raw value. */
function declarations(block) {
  const out = {}
  for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[match[1]] = match[2].trim()
  return out
}

const light = declarations(blockAfter('@theme static'))
const darkMedia = declarations(blockAfter(':root:where(:not([data-theme="light"]))'))
const darkToggle = declarations(blockAfter(':root[data-theme="dark"]'))

/** The theme as the cascade resolves it: light, with a dark block on top. */
const dark = { ...light, ...darkToggle }

/** Follow `var(--x)` to a literal. */
function resolveToken(theme, name) {
  let value = theme[name]
  for (let hops = 0; value && hops < 5; hops += 1) {
    const ref = value.match(/^var\((--[\w-]+)\)$/)
    if (!ref) return value
    value = theme[ref[1]]
  }
  return value
}

const ratio = (theme, fg, bg) => contrastRatio(resolveToken(theme, fg), resolveToken(theme, bg))

describe('the coral accent tokens', () => {
  it('declares all six roles', () => {
    for (const name of ['--color-accent', '--color-accent-hover', '--color-on-accent', '--color-accent-text', '--color-accent-line', '--color-accent-wash']) {
      assert.ok(light[name], `${name} is missing from @theme`)
    }
    assert.equal(light['--color-accent'].toLowerCase(), '#f95c4b')
  })

  it('declares every dark-varying role in both dark blocks, with the same value', () => {
    for (const name of ['--color-accent-hover', '--color-accent-text', '--color-accent-line', '--color-accent-wash']) {
      assert.ok(darkMedia[name], `${name} is missing from the prefers-color-scheme block`)
      assert.equal(darkMedia[name], darkToggle[name], `${name} differs between the two dark blocks`)
    }
  })

  it('never flips the ink on a coral fill: on-accent is declared once, near-black', () => {
    assert.equal(darkMedia['--color-on-accent'], undefined)
    assert.equal(darkToggle['--color-on-accent'], undefined)
    assert.ok(contrastRatio(light['--color-on-accent'], '#000000') < 1.2, 'on-accent should be near-black')
  })

  for (const [themeName, theme] of [['light', light], ['dark', dark]]) {
    it(`keeps a coral fill's label readable (${themeName}, AA 4.5:1)`, () => {
      assert.ok(ratio(theme, '--color-on-accent', '--color-accent') >= 4.5)
      assert.ok(ratio(theme, '--color-on-accent', '--color-accent-hover') >= 4.5)
    })

    it(`keeps coral as text readable on the page and the hover surface (${themeName}, AA 4.5:1)`, () => {
      assert.ok(ratio(theme, '--color-accent-text', '--color-page') >= 4.5)
      assert.ok(ratio(theme, '--color-accent-text', '--color-surface-1') >= 4.5)
      assert.ok(ratio(theme, '--color-accent-text', '--color-surface-2') >= 4.5)
    })

    it(`keeps a coral line or ring visible on every surface (${themeName}, 3:1 for graphics)`, () => {
      for (const surface of ['--color-page', '--color-surface-1', '--color-surface-2', '--color-surface-sunken']) {
        assert.ok(ratio(theme, '--color-accent-line', surface) >= 3, `accent-line on ${surface}`)
      }
    })
  }

  it('points the focus ring and the now-line at the line step, in all three places', () => {
    for (const block of [light, darkMedia, darkToggle]) {
      assert.equal(block['--color-focus'], 'var(--color-accent-line)')
      assert.equal(block['--color-now-line'], 'var(--color-accent-line)')
    }
  })
})
