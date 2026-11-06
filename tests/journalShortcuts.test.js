import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SHORTCUTS,
  SHORTCUT_GROUPS,
  ariaKeys,
  formatKeys,
  withShortcut,
} from '../src/components/journal/shortcuts.js'

describe('shortcut table', () => {
  it('gives no two actions the same chord', () => {
    const seen = new Map()
    for (const [id, keys] of Object.entries(SHORTCUTS)) {
      assert.ok(!seen.has(keys), `${id} and ${seen.get(keys)} both use ${keys}`)
      seen.set(keys, id)
    }
  })

  it('lists every shortcut in the help sheet, and only real ones', () => {
    const listed = SHORTCUT_GROUPS.flatMap((group) => group.items.map(([, id]) => id))
    for (const id of listed) assert.ok(SHORTCUTS[id], `help lists unknown shortcut ${id}`)
    for (const id of Object.keys(SHORTCUTS)) assert.ok(listed.includes(id), `${id} is missing from the help sheet`)
    assert.equal(new Set(listed).size, listed.length, 'each shortcut is listed once')
  })
})

describe('formatKeys', () => {
  it('writes Ctrl for Mod on Windows and Linux', () => {
    assert.equal(formatKeys('Mod+B', false), 'Ctrl+B')
    assert.equal(formatKeys('Mod+Shift+S', false), 'Ctrl+Shift+S')
    assert.equal(formatKeys('Tab', false), 'Tab')
  })

  it('writes glyphs on a Mac', () => {
    assert.equal(formatKeys('Mod+B', true), '⌘B')
    assert.equal(formatKeys('Mod+Shift+S', true), '⌘⇧S')
    assert.equal(formatKeys('Mod+Alt+1', true), '⌘⌥1')
  })

  it('keeps a trailing + (or other punctuation) as the key itself', () => {
    assert.equal(formatKeys('Mod+Shift+>', false), 'Ctrl+Shift+>')
    assert.equal(formatKeys('Mod+,', false), 'Ctrl+,')
    assert.equal(formatKeys('Mod++', false), 'Ctrl++')
  })
})

describe('ariaKeys / withShortcut', () => {
  it('uses the names aria-keyshortcuts expects', () => {
    assert.equal(ariaKeys('Mod+B', false), 'Control+B')
    assert.equal(ariaKeys('Mod+B', true), 'Meta+B')
    assert.equal(ariaKeys('Esc', false), 'Escape')
  })

  it('appends the shortcut to a tooltip, or leaves the label alone', () => {
    assert.match(withShortcut('Bold', 'bold'), /^Bold \(.*B\)$/)
    assert.equal(withShortcut('Draw', 'nope'), 'Draw')
  })
})
