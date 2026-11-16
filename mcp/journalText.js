/* Converting between plain text and the Journal's own document format, so an AI
 * client can read and write notes as ordinary text.
 *
 * A note body is a TipTap/ProseMirror document (JSON). Nothing here talks to
 * Firestore; it only builds and walks that JSON, using the same block shapes the
 * editor itself produces (`dayCopyContent` in packages/shared writes the same
 * taskList/taskItem/bulletList forms), so what an assistant writes opens in the
 * app as ordinary headings, bullets and checklist items.
 *
 * Writing accepts a deliberately small markdown subset — headings, bullets,
 * checklist items, paragraphs — and nothing else. Inline formatting is left as
 * literal text: a `**` an assistant types appears as `**`, never as a mark the
 * editor would then have to trust.
 *
 * Reading is its own renderer rather than noteOutline: that one is built for
 * "Plan it" and deliberately leaves out TICKED checklist items (they are done,
 * not a thing to plan), which would make a note look as if lines were missing.
 */

import { emptyDoc } from '@cadence/shared/journal.js'

const MAX_DEPTH = 64
// The editor's schema allows levels 1-3 only (see buildExtensions).
const MAX_HEADING = 3

const HEADING = /^(#{1,6})\s+(.*)$/
const TASK = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/
const BULLET = /^\s*[-*]\s+(.*)$/
// A marker with nothing after it ("-", "#", "- [ ]"): not text, so not a line.
const BARE_MARKER = /^\s*(#{1,6}|[-*](\s+\[[ xX]\])?)$/

const paragraph = (text) => (text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' })

/**
 * Text -> block nodes. Consecutive bullets (or consecutive checklist items) are
 * grouped into one list; a heading, a paragraph, or a switch between bullet and
 * checklist ends the group. Blank lines are skipped, and an item or heading
 * with nothing after its marker is dropped rather than written as an empty one.
 */
export function blocksFromText(text) {
  const blocks = []
  let list = null // { kind: 'bullet' | 'task', node }

  const closeList = () => {
    list = null
  }
  const addItem = (kind, item) => {
    if (!list || list.kind !== kind) {
      const node = { type: kind === 'task' ? 'taskList' : 'bulletList', content: [] }
      blocks.push(node)
      list = { kind, node }
    }
    list.node.content.push(item)
  }

  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (line.trim() === '' || BARE_MARKER.test(line)) continue

    let match = HEADING.exec(line)
    if (match) {
      closeList()
      const title = match[2].trim()
      if (title) {
        blocks.push({
          type: 'heading',
          attrs: { level: Math.min(match[1].length, MAX_HEADING) },
          content: [{ type: 'text', text: title }],
        })
      }
      continue
    }

    match = TASK.exec(line)
    if (match) {
      const title = match[2].trim()
      if (title) {
        addItem('task', {
          type: 'taskItem',
          attrs: { checked: match[1] !== ' ' },
          content: [paragraph(title)],
        })
      }
      continue
    }

    match = BULLET.exec(line)
    if (match) {
      const title = match[1].trim()
      if (title) addItem('bullet', { type: 'listItem', content: [paragraph(title)] })
      continue
    }

    closeList()
    blocks.push(paragraph(line.trim()))
  }
  return blocks
}

/** A whole document from text; an empty one when there is nothing to write. */
export function docFromText(text) {
  const blocks = blocksFromText(text)
  return blocks.length > 0 ? { type: 'doc', content: blocks } : emptyDoc()
}

/** A fresh note is one empty paragraph. Appending after it would leave a blank
    line at the top, so the new blocks replace it instead. */
const isBlankDoc = (doc) => {
  const content = doc?.content ?? []
  return content.length === 0 || (content.length === 1 && content[0].type === 'paragraph' && !content[0].content?.length)
}

/** `doc` with `blocks` added at the end. Never mutates its input, and keeps every
    node already there — images, drawings and formatting included. */
export function appendBlocks(doc, blocks) {
  const existing = isBlankDoc(doc) ? [] : (doc.content ?? [])
  return { ...doc, type: 'doc', content: [...existing, ...blocks] }
}

/* --------------------------------------------------------------- reading -- */

const squash = (text) => text.replace(/\s+/g, ' ').trim()

function inlineText(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return ''
  if (node.type === 'text') return typeof node.text === 'string' ? node.text : ''
  if (node.type === 'hardBreak') return ' '
  if (node.type === 'drawing') return '[drawing]'
  if (node.type === 'image') return '[image]'
  if (!Array.isArray(node.content)) return ''
  return node.content.map((child) => inlineText(child, depth + 1)).join('')
}

/** The document as text, in the same markdown subset blocksFromText writes, so
    what is read can be written back. Everything is shown — ticked checklist
    items included. Cut at a line boundary at `limit` characters. */
export function noteToText(doc, limit = 20_000) {
  const lines = []

  function walk(node, depth, indent, quote) {
    if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return
    const children = Array.isArray(node.content) ? node.content : []
    const push = (text) => lines.push(`${quote}${indent}${text}`)

    switch (node.type) {
      case 'paragraph': {
        const text = squash(inlineText(node))
        if (text) push(text)
        return
      }
      case 'heading': {
        const text = squash(inlineText(node))
        if (text) push(`${'#'.repeat(Math.min(node.attrs?.level ?? 1, MAX_HEADING))} ${text}`)
        return
      }
      case 'codeBlock': {
        const text = inlineText(node).trim()
        if (text) push(text)
        return
      }
      case 'drawing':
      case 'image':
        push(node.type === 'drawing' ? '[drawing]' : '[image]')
        return
      case 'horizontalRule':
        push('---')
        return
      case 'blockquote':
        for (const child of children) walk(child, depth + 1, indent, `${quote}> `)
        return
      case 'bulletList':
      case 'orderedList':
      case 'taskList': {
        children.forEach((item, i) => {
          // "paragraph block*": the first paragraph is the item's own line, any
          // nested list that follows is read in turn, one level deeper.
          const [first, ...rest] = Array.isArray(item?.content) ? item.content : []
          const own = first?.type === 'paragraph' ? squash(inlineText(first)) : ''
          const marker =
            node.type === 'taskList'
              ? `- [${item?.attrs?.checked === true ? 'x' : ' '}] `
              : node.type === 'orderedList'
                ? `${i + 1}. `
                : '- '
          if (own) push(`${marker}${own}`)
          for (const child of first?.type === 'paragraph' ? rest : (item?.content ?? [])) {
            walk(child, depth + 1, `${indent}  `, quote)
          }
        })
        return
      }
      case 'table':
        for (const row of children) {
          const cells = (row.content ?? []).map((cell) => squash(inlineText(cell)))
          if (cells.some(Boolean)) push(cells.join(' | '))
        }
        return
      default:
        for (const child of children) walk(child, depth + 1, indent, quote)
    }
  }

  walk(doc, 0, '', '')

  const kept = []
  let size = 0
  let truncated = false
  for (const line of lines) {
    const cost = line.length + 1
    if (size + cost > limit) {
      // One enormous line still shows something rather than nothing.
      if (kept.length === 0) kept.push(line.slice(0, limit))
      truncated = true
      break
    }
    kept.push(line)
    size += cost
  }
  return { text: kept.join('\n'), truncated }
}
