/* The bar charts' entrance is CSS (chart-motion.css), and — like the shell icons'
 * (iconMotion.test.js) — the thing that is easy to break without anything failing
 * loudly is the gate around it: every animation, transition and hold lives inside
 * `screen and prefers-reduced-motion: no-preference`, so a person who asked for
 * less motion, and a page sent to a printer, get the chart simply drawn. A rule
 * pasted above that block would animate (or, worse, *hold bars at zero*) for
 * everyone.
 *
 * Reads the shipped file rather than a copy.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'

const css = readFileSync(resolve(process.cwd(), 'src/styles/chart-motion.css'), 'utf8')
const GATE = '@media screen and (prefers-reduced-motion: no-preference)'

/** The text inside the block opened by the first `{` after `marker`, braces balanced. */
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

describe('chart motion', () => {
  const gated = blockAfter(GATE)
  // Code outside the gate, with comments removed: the header explains the held state
  // by name, and that is prose, not a rule.
  const outside = css.replace(gated, '').replace(/\/\*[\s\S]*?\*\//g, '')

  it('is gated on screen and no-preference, and the gate is not empty', () => {
    assert.ok(css.includes(GATE), 'the gate is missing or has been reworded')
    assert.match(gated, /@keyframes chart-/, 'the gated block has no chart keyframes')
  })

  it('declares no animation, transition or keyframes outside the gate', () => {
    assert.doesNotMatch(outside, /animation\s*:/)
    assert.doesNotMatch(outside, /transition\s*:/)
    assert.doesNotMatch(outside, /@keyframes/)
  })

  it('holds nothing at zero outside the gate', () => {
    // `chart--idle` is the held state: bars at the baseline until the chart is seen.
    // Under `reduce` the component still adds the class, so the only thing standing
    // between that person and an empty chart is that the CSS for it is gated.
    assert.doesNotMatch(outside, /chart--idle/)
    assert.match(gated, /\.chart--idle/)
  })

  it('names every keyframe it uses', () => {
    const defined = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1]))
    // `animation: none` switches one off (the ghost's fill goes with its bar); it names
    // no keyframes.
    const used = [...css.matchAll(/animation:\s*([\w-]+)/g)]
      .map((match) => match[1])
      .filter((name) => name !== 'none')
    assert.ok(used.length >= 6, 'expected the chart parts to be animated')
    for (const name of used) assert.ok(defined.has(name), `animation ${name} has no @keyframes`)
  })

  it('keeps the outgoing range hidden unless motion is allowed', () => {
    // The ghost layer (the range just switched away from) is rendered by the
    // component either way. It is hidden by default in dashboard.css and drawn only
    // by the gated rule here, so under `reduce` and on paper nobody sees two sets of
    // bars at once.
    const dashboard = readFileSync(resolve(process.cwd(), 'src/styles/dashboard.css'), 'utf8')
    assert.match(dashboard, /\.chart__columns--leaving\s*\{[^}]*display:\s*none/)
    assert.match(gated, /\.chart--in \.chart__columns--leaving\s*\{[^}]*display:\s*flex/)
    assert.doesNotMatch(outside, /chart__columns--leaving/)
  })

  it('only ever animates the live chart, never the loading skeleton', () => {
    // The skeleton shares `.chart__*` classes but carries neither state class, so
    // every selector that animates has to hang off `chart--in` (or be the tooltip,
    // which the skeleton never has).
    for (const [, selector] of gated.matchAll(/([^{}]+)\{[^{}]*animation:/g)) {
      const clean = selector.replace(/\/\*[\s\S]*?\*\//g, '').trim()
      assert.ok(
        /chart--in|\.chart__tooltip/.test(clean),
        `${clean} animates without hanging off .chart--in`,
      )
    }
  })
})
