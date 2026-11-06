/* The Journal editor's schema and commands, driven directly through TipTap's
 * command API in jsdom — no React, no toolbar. This is the layer every toolbar
 * button and keyboard shortcut ends up calling, so a wrong command name or a
 * mark that does not round-trip fails here, in a few milliseconds, rather than
 * as a button that silently does nothing.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Editor } from '@tiptap/core'
import { buildExtensions } from '../src/components/journal/extensions/index.js'
import { MAX_INDENT } from '../src/components/journal/extensions/indent.js'
import { installProseMirrorDom } from './helpers/prosemirrorDom.js'

beforeAll(installProseMirrorDom)

const editors = []

function make(content = '<p>hello world</p>', options = {}) {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const editor = new Editor({
    element,
    extensions: buildExtensions(),
    content,
    ...options,
  })
  editors.push(editor)
  return editor
}

afterEach(() => {
  while (editors.length) editors.pop().destroy()
  document.body.innerHTML = ''
})

const selectAll = (editor) => editor.commands.selectAll()

describe('schema', () => {
  it('has every mark and node the toolbar needs', () => {
    const { marks, nodes } = make().schema
    for (const name of [
      'bold',
      'italic',
      'underline',
      'strike',
      'code',
      'link',
      'textStyle',
      'highlight',
      'subscript',
      'superscript',
    ]) {
      expect(marks[name], `mark ${name}`).toBeTruthy()
    }
    for (const name of [
      'paragraph',
      'heading',
      'bulletList',
      'orderedList',
      'listItem',
      'taskList',
      'taskItem',
      'blockquote',
      'codeBlock',
      'horizontalRule',
      'hardBreak',
    ]) {
      expect(nodes[name], `node ${name}`).toBeTruthy()
    }
  })

  it('offers headings 1 to 3 and no deeper', () => {
    const editor = make('<h4>deep</h4>')
    expect(editor.getJSON().content[0].type).toBe('paragraph')
    const h3 = make('<h3>ok</h3>')
    expect(h3.getJSON().content[0]).toMatchObject({ type: 'heading', attrs: { level: 3 } })
  })
})

describe('inline formatting', () => {
  it.each([
    ['toggleBold', 'strong'],
    ['toggleItalic', 'em'],
    ['toggleUnderline', 'u'],
    ['toggleStrike', 's'],
    ['toggleCode', 'code'],
    ['toggleSubscript', 'sub'],
    ['toggleSuperscript', 'sup'],
  ])('%s wraps the selection in <%s> and toggles back off', (command, tag) => {
    const editor = make()
    selectAll(editor)
    editor.commands[command]()
    expect(editor.getHTML()).toContain(`<${tag}`)
    editor.commands[command]()
    expect(editor.getHTML()).not.toContain(`<${tag}`)
  })

  it('sets text colour, family and size on one textStyle mark', () => {
    const editor = make()
    selectAll(editor)
    editor.commands.setColor('#e03131')
    editor.commands.setFontFamily('Georgia, serif')
    editor.commands.setFontSize('18pt')
    expect(editor.getAttributes('textStyle')).toMatchObject({
      color: '#e03131',
      fontFamily: 'Georgia, serif',
      fontSize: '18pt',
    })
    const html = editor.getHTML()
    // jsdom re-serialises #e03131 as rgb(224, 49, 49); the stored attribute above is the real check.
    expect(html).toMatch(/color: (#e03131|rgb\(224, 49, 49\))/)
    expect(html).toContain('font-size: 18pt')
    expect(html.match(/<span/g)).toHaveLength(1)
  })

  it('removes each textStyle property independently', () => {
    const editor = make()
    selectAll(editor)
    editor.chain().setColor('#e03131').setFontSize('18pt').run()
    editor.commands.unsetColor()
    expect(editor.getAttributes('textStyle').color).toBeFalsy()
    expect(editor.getAttributes('textStyle').fontSize).toBe('18pt')
    editor.commands.unsetFontSize()
    expect(editor.getAttributes('textStyle').fontSize).toBeFalsy()
  })

  it('highlights with a translucent colour and keeps the text colour', () => {
    const editor = make()
    selectAll(editor)
    editor.commands.setColor('#e03131')
    editor.commands.setHighlight({ color: '#fab21999' })
    const html = editor.getHTML()
    expect(html).toContain('<mark')
    expect(html).toContain('#fab21999')
    expect(html).toMatch(/color: (#e03131|rgb\(224, 49, 49\))/)
    // The marker must not recolour the text it sits on: that is what keeps
    // coloured text readable on a highlight, and white text readable on dark paper.
    expect(html).toMatch(/<mark[^>]*color: inherit/)
    editor.commands.unsetHighlight()
    expect(editor.getHTML()).not.toContain('<mark')
  })

  it('applies one mark to partial selections without touching the rest', () => {
    const editor = make('<p>hello world</p>')
    editor.commands.setTextSelection({ from: 1, to: 6 })
    editor.commands.toggleBold()
    expect(editor.getHTML()).toBe('<p><strong>hello</strong> world</p>')
  })
})

describe('font size stepping', () => {
  it('walks up and down the offered sizes from the default 12pt', () => {
    const editor = make()
    selectAll(editor)
    editor.commands.increaseFontSize()
    expect(editor.getAttributes('textStyle').fontSize).toBe('14pt')
    editor.commands.increaseFontSize()
    expect(editor.getAttributes('textStyle').fontSize).toBe('16pt')
    editor.commands.decreaseFontSize()
    editor.commands.decreaseFontSize()
    expect(editor.getAttributes('textStyle').fontSize).toBe('12pt')
    editor.commands.decreaseFontSize()
    expect(editor.getAttributes('textStyle').fontSize).toBe('11pt')
  })
})

describe('block formatting', () => {
  it('aligns paragraphs and headings', () => {
    const editor = make('<p>a</p><h2>b</h2>')
    selectAll(editor)
    editor.commands.setTextAlign('center')
    const [p, h] = editor.getJSON().content
    expect(p.attrs.textAlign).toBe('center')
    expect(h.attrs.textAlign).toBe('center')
  })

  it('sets and clears paragraph line spacing', () => {
    const editor = make()
    selectAll(editor)
    editor.commands.setLineSpacing(2)
    expect(editor.getJSON().content[0].attrs.lineHeight).toBe(2)
    expect(editor.getHTML()).toContain('line-height: 2')
    editor.commands.unsetLineSpacing()
    expect(editor.getJSON().content[0].attrs.lineHeight).toBeNull()
    expect(editor.getHTML()).not.toContain('line-height')
  })

  it('ignores a pasted line-height that is not a plain multiplier', () => {
    const editor = make('<p style="line-height: 150%">a</p><p style="line-height: 1.5">b</p>')
    const [a, b] = editor.getJSON().content
    expect(a.attrs.lineHeight).toBeNull()
    expect(b.attrs.lineHeight).toBe(1.5)
  })

  it('indents in steps, clamped to 0 and the maximum', () => {
    const editor = make()
    selectAll(editor)
    expect(editor.commands.outdent()).toBe(false)
    editor.commands.indent()
    editor.commands.indent()
    expect(editor.getJSON().content[0].attrs.indent).toBe(2)
    expect(editor.getHTML()).toContain('margin-left: 4rem')
    for (let i = 0; i < 20; i++) editor.commands.indent()
    expect(editor.getJSON().content[0].attrs.indent).toBe(MAX_INDENT)
    editor.commands.outdent()
    expect(editor.getJSON().content[0].attrs.indent).toBe(MAX_INDENT - 1)
  })

  it('switches between lists and plain paragraphs', () => {
    const editor = make('<p>a</p>')
    editor.commands.setTextSelection(2)
    editor.commands.toggleBulletList()
    expect(editor.getJSON().content[0].type).toBe('bulletList')
    editor.commands.toggleOrderedList()
    expect(editor.getJSON().content[0].type).toBe('orderedList')
    editor.commands.toggleTaskList()
    expect(editor.getJSON().content[0].type).toBe('taskList')
    expect(editor.getJSON().content[0].content[0].type).toBe('taskItem')
    editor.commands.toggleTaskList()
    expect(editor.getJSON().content[0].type).toBe('paragraph')
  })

  it('toggles a list on and off after Select All — Ctrl+A must not strand the list commands', () => {
    // ProseMirror's own selectAll makes an AllSelection that liftListItem rejects.
    const stock = make('<p>one</p><p>two</p>')
    stock.commands.selectAll()
    stock.commands.toggleBulletList()
    stock.commands.selectAll()
    stock.commands.toggleBulletList()
    expect(stock.getJSON().content[0].type, 'stock selectAll cannot turn the list off').toBe('bulletList')

    const editor = make('<p>one</p><p>two</p>')
    editor.commands.selectAllText()
    editor.commands.toggleBulletList()
    expect(editor.getJSON().content[0].type).toBe('bulletList')
    expect(editor.getJSON().content[0].content).toHaveLength(2)
    editor.commands.selectAllText()
    editor.commands.toggleBulletList()
    expect(editor.getJSON().content.slice(0, 2).map((n) => n.type)).toEqual(['paragraph', 'paragraph'])
  })

  it('selects the whole text range, so marks still apply to every paragraph', () => {
    const editor = make('<p>one</p><p>two</p>')
    editor.commands.selectAllText()
    editor.commands.toggleBold()
    expect(editor.getHTML()).toBe('<p><strong>one</strong></p><p><strong>two</strong></p>')
  })

  it('turns a heading and a quote back into prose', () => {
    const editor = make('<p>a</p>')
    selectAll(editor)
    editor.commands.toggleHeading({ level: 1 })
    expect(editor.getJSON().content[0].type).toBe('heading')
    editor.commands.setParagraph()
    editor.commands.toggleBlockquote()
    expect(editor.getJSON().content[0].type).toBe('blockquote')
  })
})

describe('clearFormatting', () => {
  it('strips marks and every block-level style at once', () => {
    const editor = make('<h2>title</h2>')
    selectAll(editor)
    editor
      .chain()
      .toggleBold()
      .setColor('#e03131')
      .setTextAlign('center')
      .setLineSpacing(2)
      .run()
    editor.commands.clearFormatting()
    const [block] = editor.getJSON().content
    expect(block.type).toBe('paragraph')
    expect(block.marks).toBeUndefined()
    expect(block.content[0].marks).toBeUndefined()
    expect(block.attrs.textAlign).not.toBe('center')
    expect(block.attrs.lineHeight).toBeNull()
  })

  it('lifts a list item back out of its list', () => {
    const editor = make('<ul><li><p>one</p></li></ul>')
    selectAll(editor)
    editor.commands.clearFormatting()
    expect(editor.getJSON().content[0].type).toBe('paragraph')
  })
})

describe('links', () => {
  it('accepts the allowed protocols', () => {
    for (const href of ['https://example.com', 'http://example.com', 'mailto:a@b.co', 'tel:+639171234567']) {
      const editor = make()
      selectAll(editor)
      expect(editor.commands.setLink({ href }), href).toBe(true)
      expect(editor.getHTML()).toContain(`href="${href}"`)
    }
  })

  it('refuses javascript: and data: URLs', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x']) {
      const editor = make()
      selectAll(editor)
      editor.commands.setLink({ href })
      expect(editor.getHTML(), href).not.toContain('href=')
    }
  })

  it('does not follow pasted javascript: links in stored content either', () => {
    const editor = make('<p><a href="javascript:alert(1)">x</a></p>')
    expect(editor.getHTML()).not.toContain('javascript:')
  })

  it('opens in a new tab without leaking the opener', () => {
    const editor = make()
    selectAll(editor)
    editor.commands.setLink({ href: 'https://example.com' })
    expect(editor.getHTML()).toMatch(/target="_blank"/)
    expect(editor.getHTML()).toMatch(/rel="noopener noreferrer nofollow"/)
  })

  it('unsets a link', () => {
    const editor = make()
    selectAll(editor)
    editor.commands.setLink({ href: 'https://example.com' })
    editor.commands.unsetLink()
    expect(editor.getHTML()).not.toContain('<a')
  })
})

describe('storage round trip', () => {
  it('survives JSON stringify and parse unchanged', () => {
    const editor = make('<h1>Title</h1><p>one <strong>two</strong> <em>three</em></p><ul><li><p>x</p></li></ul>')
    selectAll(editor)
    editor.chain().setColor('#1971c2').setFontSize('20pt').run()
    const stored = JSON.stringify(editor.getJSON())
    const reopened = make(JSON.parse(stored))
    expect(JSON.stringify(reopened.getJSON())).toBe(stored)
  })

  it('counts words for the status line', () => {
    const editor = make('<p>one two three</p><p>four</p>')
    expect(editor.storage.characterCount.words()).toBe(4)
  })

  it('replaces content without reporting a user edit', () => {
    const onUpdate = vi.fn()
    const editor = make('<p>old</p>', { onUpdate })
    editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'new' }] }] }, { emitUpdate: false })
    expect(editor.getText()).toBe('new')
    expect(onUpdate).not.toHaveBeenCalled()
    editor.commands.insertContent('!')
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })
})

describe('content check', () => {
  const alien = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'kept' }] },
      { type: 'holographicChart', attrs: { data: [1, 2, 3] } },
    ],
  }

  it('reports content this build cannot read — and opens empty, which is why saving must stop', () => {
    const onContentError = vi.fn()
    const editor = make(alien, { enableContentCheck: true, onContentError })
    expect(onContentError).toHaveBeenCalledTimes(1)
    // It opens EMPTY, not partly filled — the stored note looks wiped. That is
    // exactly why the caller must treat this event as "read-only, never save":
    // an autosave of what is on screen would replace the real note with nothing.
    expect(editor.getText()).toBe('')
  })

  it('does not report valid content', () => {
    const onContentError = vi.fn()
    make({ type: 'doc', content: [{ type: 'paragraph' }] }, { enableContentCheck: true, onContentError })
    expect(onContentError).not.toHaveBeenCalled()
  })

  it('throws from setContent for invalid content when the check is on, so a remote change can be refused', () => {
    const editor = make('<p>x</p>', { enableContentCheck: true })
    expect(() => editor.commands.setContent(alien, { emitUpdate: false })).toThrow()
  })
})

describe('tables', () => {
  const rowsOf = (editor) => editor.getJSON().content.find((node) => node.type === 'table').content

  it('inserts a 3 × 3 table with a header row and puts the caret in it', () => {
    const editor = make('<p>before</p>')
    editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true })
    const rows = rowsOf(editor)
    expect(rows).toHaveLength(3)
    expect(rows[0].content.map((cell) => cell.type)).toEqual(['tableHeader', 'tableHeader', 'tableHeader'])
    expect(rows[1].content.map((cell) => cell.type)).toEqual(['tableCell', 'tableCell', 'tableCell'])
    expect(editor.isActive('table')).toBe(true)
  })

  it('adds and removes rows and columns, and deletes the whole table', () => {
    const editor = make('<p>x</p>')
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: false })
    editor.commands.addRowAfter()
    editor.commands.addColumnAfter()
    expect(rowsOf(editor)).toHaveLength(3)
    expect(rowsOf(editor)[0].content).toHaveLength(3)
    editor.commands.deleteRow()
    editor.commands.deleteColumn()
    expect(rowsOf(editor)).toHaveLength(2)
    expect(rowsOf(editor)[0].content).toHaveLength(2)
    editor.commands.deleteTable()
    expect(editor.isActive('table')).toBe(false)
    expect(editor.getJSON().content.some((node) => node.type === 'table')).toBe(false)
  })

  it('leaves Tab to the table — it moves between cells instead of indenting', () => {
    const editor = make('<p>x</p>')
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: false })
    const before = editor.state.selection.from
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(editor.state.selection.from).toBeGreaterThan(before)
    expect(JSON.stringify(editor.getJSON())).not.toContain('"indent":1')
    expect(editor.getHTML()).not.toContain('data-indent')
  })

  it('still indents ordinary text with Tab', () => {
    const editor = make('<p>plain</p>')
    editor.commands.focus('end')
    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(editor.getJSON().content[0].attrs.indent).toBe(1)
  })

  it('survives a JSON round trip', () => {
    const editor = make('<p>x</p>')
    editor.commands.insertTable({ rows: 2, cols: 3, withHeaderRow: true })
    const stored = JSON.stringify(editor.getJSON())
    expect(JSON.stringify(make(JSON.parse(stored)).getJSON())).toBe(stored)
  })
})

describe('images', () => {
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

  const imagesIn = (editor) => {
    const found = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'image') found.push(node.attrs.src)
    })
    return found
  }

  it('accepts an image stored as a data URI', () => {
    const editor = make(`<p>a</p><img src="${PNG}" alt="dot">`)
    expect(imagesIn(editor)).toEqual([PNG])
  })

  it('drops an image that points at another server — opening a note must not fetch anything', () => {
    const editor = make('<p>a</p><img src="https://tracker.example/pixel.gif"><img src="http://example.com/a.png">')
    expect(imagesIn(editor)).toEqual([])
  })

  it('drops script and non-raster sources', () => {
    const editor = make(
      '<p>a</p><img src="javascript:alert(1)"><img src="data:text/html;base64,PHNjcmlwdD4="><img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">',
    )
    expect(imagesIn(editor)).toEqual([])
  })

  it('inserts through the command and round-trips through JSON', () => {
    const editor = make('<p>a</p>')
    editor.commands.setImage({ src: PNG, alt: '' })
    expect(imagesIn(editor)).toEqual([PNG])
    const stored = JSON.stringify(editor.getJSON())
    expect(imagesIn(make(JSON.parse(stored)))).toEqual([PNG])
  })
})
