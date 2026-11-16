/* The Journal text the MCP tools write must be a document the app's REAL editor
 * accepts. mcpJournalText.test.js checks the parsing; this checks the result
 * against the editor's own ProseMirror schema (built from the same
 * buildExtensions() the editor uses) — a node the schema does not know, or one in
 * a place it does not allow, throws on check() — and against the shapes the app's
 * own writer (dayCopyContent) produces for the same content.
 *
 * Needs jsdom (the editor's extensions touch the DOM), so it is a vitest file in
 * the dom project, not a node:test one.
 */
import { getSchema } from '@tiptap/core'
import { Node } from '@tiptap/pm/model'
import { describe, expect, it } from 'vitest'
import { dayCopyContent, emptyDoc } from '@cadence/shared/journal.js'
import { buildExtensions } from '../src/components/journal/extensions/index.js'
import { appendBlocks, blocksFromText, docFromText, noteToText } from '../mcp/journalText.js'

const schema = getSchema(buildExtensions())

/** Throws unless `doc` is a valid document in the editor's schema. */
const check = (doc) => Node.fromJSON(schema, doc).check()

const SAMPLES = {
  empty: '',
  paragraphs: 'one line\nanother line',
  headings: '# One\n## Two\n### Three\n#### Four becomes three',
  bullets: '- a\n- b\n* c',
  checklist: '- [ ] open\n- [x] done\n- [X] done too',
  mixed: '# Plan\nintro words\n- idea\n- [ ] to do\n- [x] did\nclosing line\n\n## Next\n- more',
  literalMarkup: '- **bold** <script>alert(1)</script> [x](javascript:alert(1))',
  longLine: 'word '.repeat(2000),
}

describe('what the MCP tools write opens in the real editor', () => {
  it('the harness can fail: an impossible document is rejected', () => {
    const bad = { type: 'doc', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }
    expect(() => check(bad)).toThrow()
  })

  for (const [name, text] of Object.entries(SAMPLES)) {
    it(`accepts a note made from: ${name}`, () => {
      expect(() => check(docFromText(text))).not.toThrow()
    })
  }

  it('accepts text appended to a note the app itself wrote', () => {
    // The app's own "copy the day into the note" output, then an assistant's line.
    const existing = {
      type: 'doc',
      content: dayCopyContent({
        events: [{ title: 'Standup', startMin: 540 }],
        tasks: [{ title: 'Write report', done: false }, { title: 'Call dentist', done: true }],
      }),
    }
    const next = appendBlocks(existing, blocksFromText('# Added later\n- [ ] follow up'))
    expect(() => check(existing)).not.toThrow()
    expect(() => check(next)).not.toThrow()
    expect(next.content.length).toBe(existing.content.length + 2)
  })

  it('accepts text appended to a fresh note', () => {
    expect(() => check(appendBlocks(emptyDoc(), blocksFromText('hello\n- a')))).not.toThrow()
  })

  it('writes checklist and bullet items in exactly the shape the app’s own writer does', () => {
    const app = dayCopyContent({
      events: [{ title: 'Standup' }, { title: 'Review' }],
      tasks: [{ title: 'Buy milk', done: false }, { title: 'Call', done: true }],
    })
    const ours = blocksFromText('- Standup\n- Review\n- [ ] Buy milk\n- [x] Call')
    expect(ours).toEqual(app)
  })

  it('reads back, as text, what the editor would show for what it wrote', () => {
    const text = '# Plan\nsome words\n- a\n- [ ] open\n- [x] done'
    expect(noteToText(docFromText(text)).text).toBe(text)
  })

  it('leaves markup as literal text, with no marks the editor would have to trust', () => {
    const doc = docFromText(SAMPLES.literalMarkup)
    const node = Node.fromJSON(schema, doc)
    node.descendants((child) => {
      expect(child.marks).toHaveLength(0)
    })
    expect(JSON.stringify(doc)).not.toContain('"marks"')
  })
})
