/* The shell's icons move (DESIGN.md → Icons → Shell icons move), and two things
 * about that are easy to break without anything failing loudly:
 *
 *  - Motion has to be opt-in. Every animation lives inside
 *    `prefers-reduced-motion: no-preference`, so a person who asked for less
 *    motion gets exactly the static icons. A rule pasted above that block would
 *    animate for everyone and no render test would notice.
 *  - The stylesheet and the drawings are joined only by `ic-*` class names. Rename
 *    a part in icons.jsx and its animation silently stops; rename it in the CSS and
 *    the same happens the other way.
 *
 * Reads the shipped files rather than copies, like accentTokens.test.js.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')
const css = read('src/styles/icon-motion.css')
const icons = read('src/components/icons.jsx')

/** The text inside the first `{ … }` after `marker`, braces balanced. */
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

describe('shell icon motion', () => {
  it('moves nothing unless the person allows motion', () => {
    const allowed = blockAfter('@media (prefers-reduced-motion: no-preference)')
    const outside = css.replace(allowed, '')
    assert.doesNotMatch(outside, /animation\s*:/, 'an animation declared outside the no-preference block')
    assert.doesNotMatch(outside, /transition\s*:/, 'a transition declared outside the no-preference block')
    assert.doesNotMatch(outside, /@keyframes/, 'keyframes declared outside the no-preference block')
    assert.match(allowed, /@keyframes ic-/, 'the motion block is empty')
  })

  it('has no media query for reduced motion that turns animation on', () => {
    assert.doesNotMatch(css, /prefers-reduced-motion:\s*reduce/, 'motion is opt-in, so there is nothing for `reduce` to undo')
  })

  it('styles only parts that icons.jsx still draws', () => {
    const hooks = new Set([...css.matchAll(/\.(ic-[a-z0-9-]+)/g)].map((match) => match[1]))
    assert.ok(hooks.size > 10, 'expected the stylesheet to name the icons parts')
    for (const hook of hooks) {
      // ic-row--1..3 are built from the row's index, so only their prefix is literal.
      const numbered = hook.match(/^(.*--)\d+$/)
      const drawn = icons.includes(hook) || (numbered && icons.includes(`${numbered[1]}\${`))
      assert.ok(drawn, `${hook} is styled in icon-motion.css but not drawn in icons.jsx`)
    }
  })

  it('names every keyframe it uses', () => {
    const defined = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1]))
    const used = [...css.matchAll(/animation:\s*([\w-]+)/g)].map((match) => match[1])
    assert.ok(used.length > 10, 'expected animations to be declared')
    for (const name of used) assert.ok(defined.has(name), `animation ${name} has no @keyframes`)
  })
})
