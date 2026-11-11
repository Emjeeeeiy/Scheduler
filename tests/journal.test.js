import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BODY_HARD_LIMIT,
  BODY_SOFT_LIMIT,
  EXCERPT_MAX,
  MAX_IMPORT_NOTES,
  PAPER_PATTERNS,
  PAPER_SPACING,
  SCHEMA_VERSION,
  TITLE_MAX,
  bodyBytes,
  bodyLimitState,
  defaultPaper,
  emptyDoc,
  findNoteForDay,
  matchesQuery,
  normalizeHex,
  normalizeNote,
  normalizeNoteBody,
  normalizePaper,
  noteDisplayTitle,
  noteFromBackup,
  noteToBackup,
  plainTextOf,
  sortNotes,
  stripRemoteImages,
  summarizeDoc,
} from '@cadence/shared/journal.js'

const text = (value) => ({ type: 'text', text: value })
const para = (...content) => ({ type: 'paragraph', content })

describe('normalizeHex', () => {
  it('expands shorthand and lowercases', () => {
    assert.equal(normalizeHex('#ABC'), '#aabbcc')
    assert.equal(normalizeHex(' #FFaa00 '), '#ffaa00')
  })

  it('rejects anything that is not a hex colour', () => {
    for (const bad of ['red', '#12', '#12345', '#gggggg', 'rgb(0,0,0)', '', null, 7, undefined]) {
      assert.equal(normalizeHex(bad), null, String(bad))
    }
  })
})

describe('normalizePaper', () => {
  it('turns nothing into the default paper', () => {
    assert.deepEqual(normalizePaper(undefined), defaultPaper())
    assert.deepEqual(normalizePaper(null), defaultPaper())
    assert.deepEqual(normalizePaper('nonsense'), defaultPaper())
  })

  it('keeps valid values and fixes invalid ones field by field', () => {
    const paper = normalizePaper({
      pattern: 'grid',
      paperColor: '#FFF8E7',
      patternColor: 'blue',
      patternOpacity: 5,
      spacing: 9999,
      weight: 1.4,
      margin: 'double',
      marginColor: '#C00',
      snap: true,
    })
    assert.equal(paper.pattern, 'grid')
    assert.equal(paper.paperColor, '#fff8e7')
    assert.equal(paper.patternColor, 'auto', 'an invalid colour falls back, it does not throw')
    assert.equal(paper.patternOpacity, 1, 'opacity is clamped')
    assert.equal(paper.spacing, PAPER_SPACING.max, 'spacing is clamped')
    assert.equal(paper.weight, 1.5, 'weight snaps to the nearest offered stroke')
    assert.equal(paper.margin, 'double')
    assert.equal(paper.marginColor, '#cc0000')
    assert.equal(paper.snap, true)
  })

  it('rejects an unknown pattern id', () => {
    assert.equal(normalizePaper({ pattern: 'hologram' }).pattern, defaultPaper().pattern)
  })

  it('reads a legacy boolean margin', () => {
    assert.equal(normalizePaper({ margin: true }).margin, 'single')
    assert.equal(normalizePaper({ margin: false }).margin, 'none')
  })

  it('uses the supplied fallback, e.g. the account default paper', () => {
    const fallback = { ...defaultPaper(), pattern: 'lined', paperColor: '#fff8e7' }
    const paper = normalizePaper({ spacing: 30 }, fallback)
    assert.equal(paper.pattern, 'lined')
    assert.equal(paper.paperColor, '#fff8e7')
    assert.equal(paper.spacing, 30)
  })

  it('offers every pattern the renderer must draw', () => {
    assert.equal(new Set(PAPER_PATTERNS).size, PAPER_PATTERNS.length, 'ids are unique')
    for (const id of PAPER_PATTERNS) assert.equal(normalizePaper({ pattern: id }).pattern, id)
  })
})

describe('normalizeNote', () => {
  it('fills every field from an empty document', () => {
    const note = normalizeNote('n1', {})
    assert.deepEqual(note, {
      id: 'n1',
      title: '',
      excerpt: '',
      dayKey: null,
      pinned: false,
      hasDrawing: false,
      bytes: 0,
      paper: defaultPaper(),
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    })
  })

  it('coerces hostile values instead of throwing', () => {
    const note = normalizeNote('n2', {
      title: 'x'.repeat(TITLE_MAX + 50),
      excerpt: 'y'.repeat(EXCERPT_MAX + 50),
      dayKey: 'not a date',
      pinned: 'yes',
      hasDrawing: 1,
      bytes: -5,
      createdAt: '1',
      updatedAt: NaN,
      deletedAt: 'now',
    })
    assert.equal(note.title.length, TITLE_MAX)
    assert.equal(note.excerpt.length, EXCERPT_MAX)
    assert.equal(note.dayKey, null)
    assert.equal(note.pinned, false, 'only a real true pins')
    assert.equal(note.hasDrawing, false)
    assert.equal(note.bytes, 0)
    assert.equal(note.createdAt, 0)
    assert.equal(note.updatedAt, 0)
    assert.equal(note.deletedAt, null)
  })

  it('defaults updatedAt to createdAt', () => {
    assert.equal(normalizeNote('n3', { createdAt: 500 }).updatedAt, 500)
  })

  it('keeps a valid day key and a trash stamp', () => {
    const note = normalizeNote('n4', { dayKey: '2026-11-06', deletedAt: 1234 })
    assert.equal(note.dayKey, '2026-11-06')
    assert.equal(note.deletedAt, 1234)
  })
})

describe('noteDisplayTitle', () => {
  it('names an untitled note', () => {
    assert.equal(noteDisplayTitle({ title: '' }), 'Untitled')
    assert.equal(noteDisplayTitle({ title: '   ' }), 'Untitled')
    assert.equal(noteDisplayTitle({ title: ' Trip ' }), 'Trip')
  })
})

describe('sortNotes', () => {
  const n = (id, updatedAt, pinned = false) => ({ id, updatedAt, pinned })

  it('puts pinned notes first, then newest first', () => {
    const sorted = sortNotes([n('a', 1), n('b', 3), n('c', 2, true), n('d', 9)])
    assert.deepEqual(
      sorted.map((x) => x.id),
      ['c', 'd', 'b', 'a'],
    )
  })

  it('is stable for notes saved in the same millisecond', () => {
    const sorted = sortNotes([n('b', 5), n('a', 5)])
    assert.deepEqual(
      sorted.map((x) => x.id),
      ['a', 'b'],
    )
  })

  it('does not mutate its input', () => {
    const input = [n('a', 1), n('b', 2)]
    sortNotes(input)
    assert.deepEqual(
      input.map((x) => x.id),
      ['a', 'b'],
    )
  })
})

describe('matchesQuery', () => {
  const note = { title: 'Trip to Cebu', excerpt: 'Book the ferry and pack sunscreen' }

  it('matches every word in any order, case-insensitively', () => {
    assert.equal(matchesQuery(note, 'cebu ferry'), true)
    assert.equal(matchesQuery(note, 'SUNSCREEN trip'), true)
  })

  it('requires all words', () => {
    assert.equal(matchesQuery(note, 'cebu passport'), false)
  })

  it('treats an empty query as everything', () => {
    assert.equal(matchesQuery(note, ''), true)
    assert.equal(matchesQuery(note, '   '), true)
    assert.equal(matchesQuery(note, undefined), true)
  })
})

describe('findNoteForDay', () => {
  const notes = [
    { id: 'a', dayKey: '2026-11-05', deletedAt: null },
    { id: 'b', dayKey: '2026-11-06', deletedAt: 99 },
    { id: 'c', dayKey: '2026-11-06', deletedAt: null },
  ]

  it('finds the live note for a day and ignores trashed ones', () => {
    assert.equal(findNoteForDay(notes, '2026-11-06').id, 'c')
  })

  it('returns null when the day has no note', () => {
    assert.equal(findNoteForDay(notes, '2026-12-01'), null)
  })
})

describe('normalizeNoteBody', () => {
  it('treats a missing body as a valid, empty document', () => {
    const body = normalizeNoteBody(undefined)
    assert.equal(body.valid, true)
    assert.equal(body.supported, true)
    assert.deepEqual(body.doc, emptyDoc())
  })

  it('parses a stored document', () => {
    const doc = { type: 'doc', content: [para(text('hello'))] }
    const body = normalizeNoteBody({ json: JSON.stringify(doc), schemaVersion: 1, updatedAt: 7 })
    assert.equal(body.valid, true)
    assert.deepEqual(body.doc, doc)
    assert.equal(body.updatedAt, 7)
  })

  it('flags a body that cannot be read, so the editor will not overwrite it', () => {
    for (const json of ['{not json', '[]', '"string"', '{"type":"paragraph"}', '{"type":"doc","content":5}']) {
      const body = normalizeNoteBody({ json })
      assert.equal(body.valid, false, json)
      assert.deepEqual(body.doc, emptyDoc())
    }
  })

  it('flags a body written by a newer build', () => {
    const body = normalizeNoteBody({ json: JSON.stringify(emptyDoc()), schemaVersion: SCHEMA_VERSION + 1 })
    assert.equal(body.supported, false)
    assert.equal(body.valid, true)
  })

  it('returns a fresh empty document each time', () => {
    const a = normalizeNoteBody(undefined).doc
    a.content.push(para(text('mutated')))
    assert.equal(normalizeNoteBody(undefined).doc.content.length, 1)
  })
})

describe('summarizeDoc / plainTextOf', () => {
  it('separates blocks so words do not run together', () => {
    const doc = { type: 'doc', content: [para(text('one')), para(text('two'))] }
    assert.equal(plainTextOf(doc), 'one two')
  })

  it('reads nested lists, tables and hard breaks', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [para(text('alpha')), { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('beta'))] }] }],
            },
          ],
        },
        {
          type: 'table',
          content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [para(text('cell'))] }] }],
        },
        para(text('line'), { type: 'hardBreak' }, text('break')),
      ],
    }
    assert.equal(plainTextOf(doc), 'alpha beta cell line break')
  })

  it('collapses whitespace and honours the limit', () => {
    const doc = { type: 'doc', content: [para(text('a   b\n\n  c'))] }
    assert.equal(plainTextOf(doc), 'a b c')
    assert.equal(plainTextOf({ type: 'doc', content: [para(text('x'.repeat(5000)))] }, 40).length, 40)
  })

  it('reports drawings and images without reading them as text', () => {
    const doc = {
      type: 'doc',
      content: [para(text('before')), { type: 'drawing', attrs: { strokes: ['abc'] } }, { type: 'image', attrs: {} }],
    }
    const summary = summarizeDoc(doc)
    assert.equal(summary.hasDrawing, true)
    assert.equal(summary.hasImage, true)
    assert.equal(summary.excerpt, 'before')
    assert.equal(summarizeDoc({ type: 'doc', content: [para(text('plain'))] }).hasDrawing, false)
  })

  it('survives garbage and absurd nesting', () => {
    assert.equal(plainTextOf(null), '')
    assert.equal(plainTextOf({ type: 'doc', content: [null, 5, 'x', { type: 'text' }] }), '')
    let deep = para(text('deep'))
    for (let i = 0; i < 500; i++) deep = { type: 'blockquote', content: [deep] }
    assert.doesNotThrow(() => summarizeDoc({ type: 'doc', content: [deep] }))
  })
})

describe('bodyBytes / bodyLimitState', () => {
  it('counts UTF-8 bytes, not characters', () => {
    assert.equal(bodyBytes('abc'), 3)
    assert.equal(bodyBytes('é'), 2)
    assert.equal(bodyBytes('日本'), 6)
    assert.equal(bodyBytes('😀'), 4)
    assert.equal(bodyBytes(undefined), 0)
  })

  it('moves from ok to warn to full at the documented limits', () => {
    assert.equal(bodyLimitState(0), 'ok')
    assert.equal(bodyLimitState(BODY_SOFT_LIMIT), 'ok')
    assert.equal(bodyLimitState(BODY_SOFT_LIMIT + 1), 'warn')
    assert.equal(bodyLimitState(BODY_HARD_LIMIT), 'warn')
    assert.equal(bodyLimitState(BODY_HARD_LIMIT + 1), 'full')
  })

  it('keeps the hard limit safely under the 1 MiB Firestore document cap', () => {
    assert.ok(BODY_HARD_LIMIT < 1_048_576 - 50_000)
  })
})

describe('journal backup', () => {
  const doc = (...blocks) => ({ type: 'doc', content: blocks })
  const stored = (value) => ({ json: JSON.stringify(value), schemaVersion: SCHEMA_VERSION })
  const note = normalizeNote('abc', {
    title: 'Trip',
    dayKey: '2026-11-07',
    pinned: true,
    hasDrawing: true,
    bytes: 99,
    excerpt: 'stale excerpt',
    createdAt: 100,
    updatedAt: 200,
    deletedAt: null,
    paper: { pattern: 'grid', paperColor: '#fff6a8' },
  })

  it('writes only what belongs to the writer, and the body as stored', () => {
    const entry = noteToBackup(note, normalizeNoteBody(stored(doc(para(text('hi'))))))
    assert.deepEqual(Object.keys(entry).sort(), [
      'body',
      'createdAt',
      'dayKey',
      'deletedAt',
      'paper',
      'pinned',
      'schemaVersion',
      'title',
      'updatedAt',
    ])
    assert.equal(entry.body, JSON.stringify(doc(para(text('hi')))))
  })

  it('keeps a body it cannot parse rather than losing the text', () => {
    const entry = noteToBackup(note, normalizeNoteBody({ json: '{"type":"doc", broken', schemaVersion: 1 }))
    assert.equal(entry.body, '{"type":"doc", broken')
  })

  it('round-trips: what is exported imports as the same note', () => {
    const body = stored(doc(para(text('Book the ferry'))))
    const entry = noteToBackup(note, normalizeNoteBody(body))
    const back = noteFromBackup(JSON.parse(JSON.stringify(entry)), 999)
    assert.equal(back.error, undefined)
    assert.equal(back.json, body.json)
    assert.equal(back.meta.title, 'Trip')
    assert.equal(back.meta.dayKey, '2026-11-07')
    assert.equal(back.meta.pinned, true)
    assert.equal(back.meta.paper.pattern, 'grid')
    assert.equal(back.meta.createdAt, 100)
    assert.equal(back.meta.updatedAt, 200)
  })

  it('rebuilds the excerpt, size and drawing flag from the body instead of trusting the file', () => {
    const body = doc(para(text('real words')), { type: 'drawing', attrs: { strokes: [], height: 300, label: '' } })
    const back = noteFromBackup(
      { title: 'x', excerpt: 'forged', bytes: 1, hasDrawing: false, body: JSON.stringify(body) },
      5,
    )
    assert.equal(back.meta.excerpt, 'real words')
    assert.equal(back.meta.hasDrawing, true)
    assert.equal(back.meta.bytes, bodyBytes(JSON.stringify(body)))
  })

  it('never carries an id into the new note', () => {
    const back = noteFromBackup({ id: 'old-id', title: 'x', body: JSON.stringify(doc(para())) }, 5)
    assert.equal('id' in back.meta, false)
  })

  it('fills missing dates from the import time', () => {
    const back = noteFromBackup({ title: 'x', body: JSON.stringify(doc(para())) }, 777)
    assert.equal(back.meta.createdAt, 777)
    assert.equal(back.meta.updatedAt, 777)
  })

  it('treats a note with no body as an empty note', () => {
    const back = noteFromBackup({ title: 'Only a title' }, 5)
    assert.equal(back.error, undefined)
    assert.equal(back.json, JSON.stringify(emptyDoc()))
  })

  it('keeps a trashed note trashed', () => {
    const back = noteFromBackup({ title: 'x', deletedAt: 1234, body: JSON.stringify(doc(para())) }, 5)
    assert.equal(back.meta.deletedAt, 1234)
  })

  it('normalizes hostile metadata like any stored note', () => {
    const back = noteFromBackup(
      { title: 'x'.repeat(5000), pinned: 'yes', paper: { pattern: 'nope', paperColor: 'javascript:1' }, body: JSON.stringify(doc(para())) },
      5,
    )
    assert.equal(back.meta.title.length, TITLE_MAX)
    assert.equal(back.meta.pinned, false)
    assert.ok(PAPER_PATTERNS.includes(back.meta.paper.pattern))
    assert.match(back.meta.paper.paperColor, /^(theme|#[0-9a-f]{6})$/i)
  })

  it('refuses what it cannot safely write', () => {
    assert.equal(noteFromBackup(null, 5).error, 'unreadable')
    assert.equal(noteFromBackup('text', 5).error, 'unreadable')
    assert.equal(noteFromBackup({ body: '{not json' }, 5).error, 'unreadable')
    assert.equal(noteFromBackup({ body: JSON.stringify({ type: 'paragraph' }) }, 5).error, 'unreadable')
    // a body that was edited into an object would otherwise import as an empty note
    assert.equal(noteFromBackup({ body: { type: 'doc', content: [] } }, 5).error, 'unreadable')
    assert.equal(noteFromBackup({ body: JSON.stringify(doc(para())), schemaVersion: SCHEMA_VERSION + 1 }, 5).error, 'newer')
    const huge = JSON.stringify(doc(para(text('x'.repeat(BODY_HARD_LIMIT + 10)))))
    assert.equal(noteFromBackup({ body: huge }, 5).error, 'too-large')
  })

  it('caps how many notes one file may bring', () => {
    assert.equal(MAX_IMPORT_NOTES, 500)
  })
})

describe('stripRemoteImages — a note never loads a picture from someone else’s server', () => {
  const DATA = 'data:image/png;base64,iVBORw0KGgo='
  const image = (src) => ({ type: 'image', attrs: { src } })
  const docOf = (...content) => ({ type: 'doc', content })

  it('keeps data-URI images and drops remote, protocol-relative and script ones', () => {
    const doc = docOf(
      para(text('a')),
      image(DATA),
      image('https://tracker.example/pixel.png'),
      image('//tracker.example/p.gif'),
      image('javascript:alert(1)'),
      { type: 'blockquote', content: [image('http://x.example/y.jpg'), para(text('b'))] },
    )
    const { doc: safe, stripped } = stripRemoteImages(doc)
    assert.equal(stripped, 4)
    assert.deepEqual(safe, docOf(para(text('a')), image(DATA), { type: 'blockquote', content: [para(text('b'))] }))
  })

  it('returns the very same object when there is nothing to strip, and never mutates its input', () => {
    const doc = docOf(para(text('a')), image(DATA))
    const before = JSON.stringify(doc)
    assert.equal(stripRemoteImages(doc).doc, doc)
    stripRemoteImages(docOf(image('https://x.example/a.png')))
    assert.equal(JSON.stringify(doc), before)
  })

  it('drops whatever sits deeper than any real note nests', () => {
    let deep = image('https://x.example/deep.png')
    for (let i = 0; i < 100; i += 1) deep = { type: 'blockquote', content: [deep] }
    const { doc: safe, stripped } = stripRemoteImages(docOf(deep))
    assert.ok(stripped >= 1)
    assert.ok(!JSON.stringify(safe).includes('deep.png'))
  })

  it('applies when a stored body is loaded', () => {
    const json = JSON.stringify(docOf(para(text('hi')), image('https://x.example/a.png')))
    const body = normalizeNoteBody({ json, schemaVersion: SCHEMA_VERSION })
    assert.equal(body.valid, true)
    assert.ok(!body.json.includes('x.example'))
    assert.deepEqual(body.doc, docOf(para(text('hi'))))
  })

  it('leaves an ordinary stored body’s string exactly as it was', () => {
    const json = JSON.stringify(docOf(para(text('hi')), image(DATA)))
    assert.equal(normalizeNoteBody({ json, schemaVersion: SCHEMA_VERSION }).json, json)
  })

  it('applies to a note imported from a backup file', () => {
    const raw = {
      title: 'Imported',
      body: JSON.stringify(docOf(para(text('x')), image('https://tracker.example/p.png'))),
      schemaVersion: SCHEMA_VERSION,
    }
    const result = noteFromBackup(raw, 1)
    assert.ok(!result.error)
    assert.ok(!result.json.includes('tracker.example'))
  })
})
