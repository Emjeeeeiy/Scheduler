/* mcp/journalText.js — plain text <-> the Journal's document JSON. Pure, so it
 * runs here on node:test. (That what it writes is a document the app's REAL
 * editor accepts is checked separately, in mcpJournalText.test.jsx, which needs
 * the editor's schema and so needs jsdom.)
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { emptyDoc } from '@cadence/shared/journal.js'
import { appendBlocks, blocksFromText, docFromText, noteToText } from '../mcp/journalText.js'

const types = (blocks) => blocks.map((b) => b.type)
const itemTexts = (list) => list.content.map((item) => item.content[0].content[0].text)

/** Every text node in a tree. */
function textNodes(node, found = []) {
  if (node?.type === 'text') found.push(node)
  for (const child of node?.content ?? []) textNodes(child, found)
  return found
}

describe('blocksFromText', () => {
  it('reads headings, capping at the editor’s level 3', () => {
    const blocks = blocksFromText('# One\n## Two\n### Three\n#### Four')
    assert.deepEqual(types(blocks), ['heading', 'heading', 'heading', 'heading'])
    assert.deepEqual(blocks.map((b) => b.attrs.level), [1, 2, 3, 3])
    assert.equal(blocks[3].content[0].text, 'Four')
  })

  it('groups consecutive bullets into one list, with either marker', () => {
    const [list, ...rest] = blocksFromText('- a\n* b\n- c')
    assert.equal(rest.length, 0)
    assert.equal(list.type, 'bulletList')
    assert.deepEqual(itemTexts(list), ['a', 'b', 'c'])
    assert.equal(list.content[0].type, 'listItem')
  })

  it('reads checklist items with their ticked state', () => {
    const [list] = blocksFromText('- [ ] open\n- [x] done\n- [X] also done')
    assert.equal(list.type, 'taskList')
    assert.deepEqual(list.content.map((i) => i.type), ['taskItem', 'taskItem', 'taskItem'])
    assert.deepEqual(list.content.map((i) => i.attrs.checked), [false, true, true])
    assert.deepEqual(itemTexts(list), ['open', 'done', 'also done'])
  })

  it('starts a new list when the kind changes, or a paragraph intervenes', () => {
    assert.deepEqual(types(blocksFromText('- a\n- [ ] b')), ['bulletList', 'taskList'])
    assert.deepEqual(types(blocksFromText('- a\nsome words\n- b')), ['bulletList', 'paragraph', 'bulletList'])
    assert.deepEqual(types(blocksFromText('# H\n- a')), ['heading', 'bulletList'])
  })

  it('skips blank lines without splitting a list', () => {
    const blocks = blocksFromText('- a\n\n\n- b\n\nplain')
    assert.deepEqual(types(blocks), ['bulletList', 'paragraph'])
    assert.equal(blocks[0].content.length, 2)
  })

  it('treats any other line as a paragraph, trimmed', () => {
    const [p] = blocksFromText('   hello there   ')
    assert.deepEqual(p, { type: 'paragraph', content: [{ type: 'text', text: 'hello there' }] })
  })

  it('drops a marker with nothing after it, rather than writing an empty item', () => {
    assert.deepEqual(blocksFromText('-\n#\n- [ ]\n*\n##   '), [])
    assert.deepEqual(types(blocksFromText('- real\n-\n- also real')), ['bulletList'])
  })

  it('never writes an empty text node', () => {
    const doc = docFromText('# \n- x\n\n   \nword\n- [ ] \n## h')
    for (const node of textNodes(doc)) assert.ok(node.text.length > 0)
  })

  it('leaves inline formatting as literal text', () => {
    const [list] = blocksFromText('- **bold** and <b>tag</b> and [link](http://x)')
    assert.equal(itemTexts(list)[0], '**bold** and <b>tag</b> and [link](http://x)')
    assert.deepEqual(Object.keys(list.content[0].content[0].content[0]).sort(), ['text', 'type'], 'no marks')
  })

  it('handles Windows line endings and a missing argument', () => {
    assert.deepEqual(types(blocksFromText('# A\r\n- b\r\nc')), ['heading', 'bulletList', 'paragraph'])
    assert.deepEqual(blocksFromText(undefined), [])
    assert.deepEqual(blocksFromText(null), [])
  })
})

describe('docFromText', () => {
  it('wraps blocks in a doc, and gives an empty note the app’s own empty doc', () => {
    assert.equal(docFromText('hi').type, 'doc')
    assert.deepEqual(docFromText(''), emptyDoc())
    assert.deepEqual(docFromText('   \n  \n'), emptyDoc())
  })
})

describe('appendBlocks', () => {
  const added = blocksFromText('new line')

  it('adds to the end and keeps everything already there', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'old' }] }, { type: 'drawing', attrs: { strokes: [] } }] }
    const next = appendBlocks(doc, added)
    assert.deepEqual(next.content.slice(0, 2), doc.content)
    assert.equal(next.content.length, 3)
    assert.equal(next.content[2].content[0].text, 'new line')
  })

  it('replaces a fresh note’s empty paragraph instead of leaving a blank first line', () => {
    assert.deepEqual(types(appendBlocks(emptyDoc(), added).content), ['paragraph'])
    assert.equal(appendBlocks(emptyDoc(), added).content[0].content[0].text, 'new line')
    assert.deepEqual(types(appendBlocks({ type: 'doc' }, added).content), ['paragraph'])
  })

  it('never mutates the document it was given', () => {
    const doc = Object.freeze({ type: 'doc', content: Object.freeze([Object.freeze({ type: 'paragraph' })]) })
    assert.doesNotThrow(() => appendBlocks(doc, added))
    const real = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] }
    const before = JSON.stringify(real)
    appendBlocks(real, added)
    assert.equal(JSON.stringify(real), before)
  })
})

describe('noteToText', () => {
  it('round-trips the supported subset', () => {
    const source = '# Plan\nsome words\n- a\n- b\n- [ ] open\n- [x] done'
    assert.equal(noteToText(docFromText(source)).text, source)
  })

  it('shows ticked checklist items — they are part of the note', () => {
    const { text } = noteToText(docFromText('- [x] finished\n- [ ] open'))
    assert.match(text, /- \[x\] finished/)
    assert.match(text, /- \[ \] open/)
  })

  it('indents a nested list under its item and numbers an ordered one', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'first' }] },
                {
                  type: 'bulletList',
                  content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'nested' }] }] }],
                },
              ],
            },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }] },
          ],
        },
      ],
    }
    assert.equal(noteToText(doc).text, '1. first\n  - nested\n2. second')
  })

  it('reads quotes, tables, rules, drawings and images without losing the shape', () => {
    const p = (t) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] })
    const doc = {
      type: 'doc',
      content: [
        { type: 'blockquote', content: [p('quoted')] },
        { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [p('a')] }, { type: 'tableCell', content: [p('b')] }] }] },
        { type: 'horizontalRule' },
        { type: 'drawing', attrs: { strokes: [] } },
        { type: 'image', attrs: { src: 'data:image/png;base64,AA==' } },
      ],
    }
    assert.equal(noteToText(doc).text, '> quoted\na | b\n---\n[drawing]\n[image]')
  })

  it('collapses runs of whitespace and hard breaks into single spaces', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a   b' }, { type: 'hardBreak' }, { type: 'text', text: 'c' }] }] }
    assert.equal(noteToText(doc).text, 'a b c')
  })

  it('cuts at a line boundary and says so', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line number ${i}`).join('\n')
    const { text, truncated } = noteToText(docFromText(lines), 100)
    assert.equal(truncated, true)
    assert.ok(text.length <= 100)
    assert.ok(text.split('\n').every((line) => /^line number \d+$/.test(line)), 'no half line')
    assert.equal(noteToText(docFromText(lines), 10_000).truncated, false)
  })

  it('still shows the start of one line longer than the limit', () => {
    const { text, truncated } = noteToText(docFromText('x'.repeat(500)), 50)
    assert.equal(text, 'x'.repeat(50))
    assert.equal(truncated, true)
  })

  it('does not hang or overflow on a deeply nested document, or on junk', () => {
    let deep = { type: 'paragraph', content: [{ type: 'text', text: 'bottom' }] }
    for (let i = 0; i < 500; i += 1) deep = { type: 'blockquote', content: [deep] }
    assert.doesNotThrow(() => noteToText({ type: 'doc', content: [deep] }))
    for (const junk of [null, undefined, 42, 'text', {}, { type: 'doc', content: 'nope' }]) {
      assert.deepEqual(noteToText(junk), { text: '', truncated: false })
    }
  })
})
