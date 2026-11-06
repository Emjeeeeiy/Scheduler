/* Journal notes — the shapes, limits and pure helpers behind the Journal page.
 *
 * Everything that crosses the Firestore boundary is normalized here, for the
 * same reason normalize.js does it for tasks: a half-written or hand-edited
 * document must never blank out the list, and a note body from a newer build
 * must never be silently rewritten by an older one. The editor itself (TipTap)
 * lives in the web app; this file only knows about plain data.
 *
 * A note is two documents. The metadata (title, excerpt, paper, flags) is small
 * and listened to as a collection, which is what keeps the list light. The body
 * is a ProseMirror document stored as ONE JSON string and read only for the
 * note that is open. A string rather than a nested map because Firestore
 * rejects arrays directly inside arrays and caps nesting at twenty levels —
 * a rich-text tree (lists in lists, tables) hits both — and because a string
 * has an exact byte size to budget against before a write is attempted.
 */

import { isValidKey } from './date.js'

export const SCHEMA_VERSION = 1

export const TITLE_MAX = 200
export const EXCERPT_MAX = 1000

/* Firestore refuses a document over 1 MiB. The body doc is the JSON string plus
   a few small fields, so these leave a wide margin: past SOFT the editor warns,
   past HARD it refuses to save and keeps the text on screen instead of
   truncating it. */
export const BODY_SOFT_LIMIT = 750_000
export const BODY_HARD_LIMIT = 950_000

/** A fresh object every call — a shared constant would let one note's editor
    mutate the starting point of the next. */
export function emptyDoc() {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

/* ---------------------------------------------------------------- paper -- */

export const PAPER_PATTERNS = [
  'plain',
  'lined',
  'dots',
  'grid',
  'graph',
  'isodots',
  'isogrid',
  'hex',
  'cross',
  'staff',
  'handwriting',
  'cornell',
]

export const PAPER_SPACING = { min: 12, max: 64, default: 24 }
export const PAPER_WEIGHTS = [1, 1.5, 2]
export const MARGIN_STYLES = ['none', 'single', 'double']
export const OPACITY_RANGE = { min: 0.1, max: 1 }

/** Dots on the theme's own paper: the same quiet motif as the app shell, and
    the one that follows light/dark without the note ever storing a colour. */
export function defaultPaper() {
  return {
    pattern: 'dots',
    paperColor: 'theme',
    patternColor: 'auto',
    patternOpacity: 1,
    spacing: PAPER_SPACING.default,
    weight: 1,
    margin: 'none',
    marginColor: 'auto',
    snap: false,
  }
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** '#abc' / '#AABBCC' -> '#aabbcc', or null for anything that is not a colour.
    Only hex is ever stored: it is what <input type="color"> speaks, and it
    can be injected into a style attribute without escaping concerns. */
export function normalizeHex(value) {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (!HEX.test(v)) return null
  return v.length === 4 ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v
}

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi)

function closest(options, value) {
  return options.reduce((best, option) =>
    Math.abs(option - value) < Math.abs(best - value) ? option : best,
  )
}

/** `fallback` is what a missing or invalid field becomes — the account's
    default paper when one is set, the built-in default otherwise. */
export function normalizePaper(raw, fallback = defaultPaper()) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const margin =
    source.margin === true
      ? 'single'
      : source.margin === false
        ? 'none'
        : MARGIN_STYLES.includes(source.margin)
          ? source.margin
          : fallback.margin
  return {
    pattern: PAPER_PATTERNS.includes(source.pattern) ? source.pattern : fallback.pattern,
    paperColor:
      source.paperColor === 'theme'
        ? 'theme'
        : (normalizeHex(source.paperColor) ?? fallback.paperColor),
    patternColor:
      source.patternColor === 'auto'
        ? 'auto'
        : (normalizeHex(source.patternColor) ?? fallback.patternColor),
    patternOpacity: Number.isFinite(source.patternOpacity)
      ? clamp(source.patternOpacity, OPACITY_RANGE.min, OPACITY_RANGE.max)
      : fallback.patternOpacity,
    spacing: Number.isFinite(source.spacing)
      ? clamp(Math.round(source.spacing), PAPER_SPACING.min, PAPER_SPACING.max)
      : fallback.spacing,
    weight: Number.isFinite(source.weight) ? closest(PAPER_WEIGHTS, source.weight) : fallback.weight,
    margin,
    marginColor:
      source.marginColor === 'auto'
        ? 'auto'
        : (normalizeHex(source.marginColor) ?? fallback.marginColor),
    snap: typeof source.snap === 'boolean' ? source.snap : fallback.snap,
  }
}

/* ---------------------------------------------------------------- notes -- */

const finiteOr = (value, fallback) => (Number.isFinite(value) ? value : fallback)

export function normalizeNote(id, raw, fallbackPaper) {
  const createdAt = finiteOr(raw?.createdAt, 0)
  return {
    id,
    title: typeof raw?.title === 'string' ? raw.title.slice(0, TITLE_MAX) : '',
    excerpt: typeof raw?.excerpt === 'string' ? raw.excerpt.slice(0, EXCERPT_MAX) : '',
    dayKey: isValidKey(raw?.dayKey) ? raw.dayKey : null,
    pinned: raw?.pinned === true,
    hasDrawing: raw?.hasDrawing === true,
    bytes: Math.max(0, finiteOr(raw?.bytes, 0)),
    paper: normalizePaper(raw?.paper, fallbackPaper),
    createdAt,
    updatedAt: finiteOr(raw?.updatedAt, createdAt),
    deletedAt: Number.isFinite(raw?.deletedAt) ? raw.deletedAt : null,
  }
}

/** What the list and the editor header call a note. An empty title is a normal
    state (a note starts that way), not an error. */
export function noteDisplayTitle(note) {
  return note.title.trim() || 'Untitled'
}

/** Pinned first, then most recently edited, then id so two notes saved in the
    same millisecond keep a stable order between renders. */
export function sortNotes(notes) {
  return [...notes].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      b.updatedAt - a.updatedAt ||
      a.id.localeCompare(b.id),
  )
}

/** Title or excerpt contains every word of the query, in any order. */
export function matchesQuery(note, query) {
  const words = String(query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return true
  const haystack = `${note.title} ${note.excerpt}`.toLowerCase()
  return words.every((word) => haystack.includes(word))
}

/** The live (not trashed) note that was created for `dayKey`, if any — what the
    "Today" button opens instead of making a second note for the same day. */
export function findNoteForDay(notes, dayKey) {
  return notes.find((note) => note.dayKey === dayKey && note.deletedAt === null) ?? null
}

/* ----------------------------------------------------------------- body -- */

function isDocShape(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    value.type === 'doc' &&
    (value.content === undefined || Array.isArray(value.content))
  )
}

/** The body document as stored -> something the editor can be started from.
    `valid` is false for a body that exists but cannot be read as a document,
    and `supported` is false for one written by a newer build. In both cases the
    editor opens read-only and never autosaves, so the stored text is not
    replaced by an empty or partial version of itself. A body doc that simply
    does not exist yet is valid and empty. */
export function normalizeNoteBody(raw) {
  const schemaVersion = Number.isInteger(raw?.schemaVersion) ? raw.schemaVersion : SCHEMA_VERSION
  const json = typeof raw?.json === 'string' ? raw.json : ''
  let doc = null
  if (json) {
    try {
      const parsed = JSON.parse(json)
      if (isDocShape(parsed)) doc = parsed
    } catch {
      /* falls through to valid: false */
    }
  }
  return {
    json,
    doc: doc ?? emptyDoc(),
    valid: json === '' || doc !== null,
    supported: schemaVersion <= SCHEMA_VERSION,
    schemaVersion,
    updatedAt: finiteOr(raw?.updatedAt, 0),
  }
}

/* Nodes that end a line of prose — a space is added after each so "one" and
   "two" in separate paragraphs never read as "onetwo" in the excerpt. */
const BLOCK_NODES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'listItem',
  'taskItem',
  'tableRow',
  'tableCell',
  'tableHeader',
  'horizontalRule',
])
const MAX_DEPTH = 64

/** One pass over the document: the plain-text excerpt the list shows and
    searches, and whether it holds a drawing or an image. Drawings and images
    contribute no text. A depth cap keeps a pathological document from
    overflowing the stack. */
export function summarizeDoc(doc, { limit = EXCERPT_MAX } = {}) {
  let text = ''
  let hasDrawing = false
  let hasImage = false
  // Stop building the string once it is comfortably past the limit; the walk
  // continues only to find drawings and images.
  const room = limit * 2

  function walk(node, depth) {
    if (!node || typeof node !== 'object' || depth > MAX_DEPTH) return
    if (node.type === 'drawing') {
      hasDrawing = true
      return
    }
    if (node.type === 'image') {
      hasImage = true
      return
    }
    if (node.type === 'text') {
      if (typeof node.text === 'string' && text.length < room) text += node.text
      return
    }
    if (node.type === 'hardBreak') {
      if (text.length < room) text += ' '
      return
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child, depth + 1)
    }
    if (BLOCK_NODES.has(node.type) && text.length < room) text += ' '
  }

  walk(doc, 0)
  return {
    excerpt: text.replace(/\s+/g, ' ').trim().slice(0, limit),
    hasDrawing,
    hasImage,
  }
}

export function plainTextOf(doc, limit = EXCERPT_MAX) {
  return summarizeDoc(doc, { limit }).excerpt
}

const encoder = typeof TextEncoder === 'undefined' ? null : new TextEncoder()

/** UTF-8 size — what Firestore actually counts, not the string's length. */
export function bodyBytes(json) {
  if (typeof json !== 'string') return 0
  return encoder ? encoder.encode(json).length : json.length
}

/** 'ok' | 'warn' (getting large) | 'full' (refuse the save). */
export function bodyLimitState(bytes) {
  if (bytes > BODY_HARD_LIMIT) return 'full'
  if (bytes > BODY_SOFT_LIMIT) return 'warn'
  return 'ok'
}

/* --------------------------------------------------------------- backup -- */

/** The most notes one import will take. A file claiming more than this is not a
    backup of a notebook; it is a mistake or an attack on the write quota. */
export const MAX_IMPORT_NOTES = 500

/** A note as it goes into a JSON backup: what is the writer's, nothing that is
    the database's. Ids, the excerpt, the size and the drawing flag are all
    rebuilt from the body on import, so they are left out rather than trusted.
    `body` is the stored JSON string exactly as it was — even one that does not
    parse is kept, so a backup never loses text it could not read. */
export function noteToBackup(note, body) {
  return {
    title: note.title,
    dayKey: note.dayKey,
    pinned: note.pinned,
    paper: note.paper,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    deletedAt: note.deletedAt,
    schemaVersion: body.schemaVersion,
    body: body.json,
  }
}

/** One note out of a backup file -> what to write, or why it cannot be. The
    file is untrusted input (hand-edited, truncated, from another build), so it
    gets the same treatment a Firestore snapshot gets: the metadata is
    normalized, and the body must parse as a document, be one this build
    understands, and fit under the size limit — a note that does not is skipped
    and counted, never written half-valid. A note with no body at all is an empty
    note. */
export function noteFromBackup(raw, stamp) {
  if (!raw || typeof raw !== 'object') return { error: 'unreadable' }
  // A body that is there but not a string would normalize to "empty" — a note
  // that imports fine and has quietly lost its text. Refuse it instead.
  if (raw.body !== undefined && raw.body !== null && typeof raw.body !== 'string') return { error: 'unreadable' }
  const body = normalizeNoteBody({ json: raw.body, schemaVersion: raw.schemaVersion })
  if (!body.valid) return { error: 'unreadable' }
  if (!body.supported) return { error: 'newer' }
  const json = body.json || JSON.stringify(emptyDoc())
  const bytes = bodyBytes(json)
  if (bodyLimitState(bytes) === 'full') return { error: 'too-large' }

  const { id: _id, ...note } = normalizeNote('imported', raw)
  const { excerpt, hasDrawing } = summarizeDoc(body.doc)
  return {
    meta: {
      ...note,
      excerpt,
      hasDrawing,
      bytes,
      createdAt: note.createdAt || stamp,
      updatedAt: note.updatedAt || stamp,
    },
    json,
    schemaVersion: SCHEMA_VERSION,
  }
}
