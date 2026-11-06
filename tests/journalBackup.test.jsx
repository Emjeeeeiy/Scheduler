/* Journal notes in the JSON backup: read out of Firestore on export, written back
   as new notes on import. The Firestore SDK is replaced by an in-memory stand-in
   (paths in, documents out), so these tests cover our reads, writes and batching
   — not Firestore. The pure rules for what a note may become are in journal.test.js. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SCHEMA_VERSION } from '@cadence/shared/journal.js'

const fake = vi.hoisted(() => ({
  notes: [], // [{ id, data }]
  bodies: {}, // id -> data | 'offline'
  commits: [], // each commit: [{ path, data }]
  newIds: 0,
}))

vi.mock('firebase/firestore', () => ({
  collection: (_db, ...segments) => ({ kind: 'collection', path: segments.join('/') }),
  doc: (first, ...segments) => {
    if (first?.kind === 'collection') {
      fake.newIds += 1
      return { kind: 'doc', id: `new${fake.newIds}`, path: `${first.path}/new${fake.newIds}` }
    }
    return { kind: 'doc', id: segments.at(-1), path: segments.join('/') }
  },
  getDocs: async () => ({
    docs: fake.notes.map((n) => ({ id: n.id, data: () => n.data })),
    size: fake.notes.length,
  }),
  getDoc: async (ref) => {
    const id = ref.path.split('/')[3]
    const body = fake.bodies[id]
    if (body === 'offline') throw new Error('Failed to get document because the client is offline.')
    return { exists: () => body !== undefined, data: () => body }
  },
  writeBatch: () => {
    const writes = []
    return {
      set: (ref, data) => writes.push({ path: ref.path, data }),
      delete: () => {},
      commit: async () => {
        fake.commits.push(writes)
      },
    }
  },
}))

const { exportJournal, importJournal } = await import('../src/state/journalData.js')

const db = {}
const doc = (text) => JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

beforeEach(() => {
  fake.notes = []
  fake.bodies = {}
  fake.commits = []
  fake.newIds = 0
})

describe('exportJournal', () => {
  it('returns every note with its body, oldest first', async () => {
    fake.notes = [
      { id: 'b', data: { title: 'Second', createdAt: 200, updatedAt: 200 } },
      { id: 'a', data: { title: 'First', createdAt: 100, updatedAt: 150, pinned: true } },
    ]
    fake.bodies = {
      a: { json: doc('alpha'), schemaVersion: SCHEMA_VERSION },
      b: { json: doc('beta'), schemaVersion: SCHEMA_VERSION },
    }
    const { notes, unreadable } = await exportJournal(db, 'u1')
    expect(unreadable).toBe(0)
    expect(notes.map((n) => n.title)).toEqual(['First', 'Second'])
    expect(notes[0]).toMatchObject({ pinned: true, createdAt: 100, updatedAt: 150, body: doc('alpha') })
    expect(notes[1].body).toBe(doc('beta'))
  })

  it('exports a note whose body doc was never written as an empty note', async () => {
    fake.notes = [{ id: 'a', data: { title: 'Bare', createdAt: 1 } }]
    const { notes, unreadable } = await exportJournal(db, 'u1')
    expect(unreadable).toBe(0)
    expect(notes[0].title).toBe('Bare')
    expect(notes[0].body).toBe('')
  })

  it('says how many it could not read instead of writing blank notes', async () => {
    fake.notes = [
      { id: 'a', data: { title: 'Cached', createdAt: 1 } },
      { id: 'b', data: { title: 'Not on this device', createdAt: 2 } },
    ]
    fake.bodies = { a: { json: doc('here'), schemaVersion: SCHEMA_VERSION }, b: 'offline' }
    const { notes, unreadable } = await exportJournal(db, 'u1')
    expect(notes.map((n) => n.title)).toEqual(['Cached'])
    expect(unreadable).toBe(1)
  })

  it('reads many notes, in groups', async () => {
    fake.notes = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, data: { title: `Note ${i}`, createdAt: i } }))
    for (const n of fake.notes) fake.bodies[n.id] = { json: doc(n.id), schemaVersion: SCHEMA_VERSION }
    const { notes } = await exportJournal(db, 'u1')
    expect(notes).toHaveLength(20)
    expect(notes[19].title).toBe('Note 19')
  })

  it('exports nothing for an empty journal', async () => {
    expect(await exportJournal(db, 'u1')).toEqual({ notes: [], unreadable: 0 })
  })
})

describe('importJournal', () => {
  const entry = (title, text) => ({ title, createdAt: 10, updatedAt: 20, body: doc(text) })

  it('writes each note as a new note with its body, one commit per note', async () => {
    const result = await importJournal(db, 'u1', [entry('One', 'a'), entry('Two', 'b')], 999)
    expect(result).toEqual({ imported: 2, skipped: 0 })
    expect(fake.commits).toHaveLength(2)
    const [meta, body] = fake.commits[0]
    expect(meta.path).toBe('users/u1/journal/new1')
    expect(meta.data).toMatchObject({ title: 'One', excerpt: 'a', createdAt: 10, updatedAt: 20, deletedAt: null })
    expect(body.path).toBe('users/u1/journal/new1/content/body')
    expect(body.data).toEqual({ json: doc('a'), schemaVersion: SCHEMA_VERSION, updatedAt: 999 })
  })

  it('imports as new notes, never under an id from the file', async () => {
    await importJournal(db, 'u1', [{ id: 'victim', ...entry('Mine', 'x') }], 999)
    expect(fake.commits[0][0].path).not.toContain('victim')
  })

  it('skips what is unreadable or from a newer version, and counts it', async () => {
    const result = await importJournal(
      db,
      'u1',
      [entry('Good', 'ok'), { title: 'Broken', body: '{nope' }, { title: 'Newer', body: doc('x'), schemaVersion: SCHEMA_VERSION + 1 }, null],
      999,
    )
    expect(result).toEqual({ imported: 1, skipped: 3 })
    expect(fake.commits).toHaveLength(1)
  })

  it('takes at most 500 notes from one file', async () => {
    const many = Array.from({ length: 503 }, (_, i) => entry(`n${i}`, 'x'))
    const result = await importJournal(db, 'u1', many, 999)
    expect(result).toEqual({ imported: 500, skipped: 3 })
  })

  it('treats a missing or wrong-typed journal as nothing to import', async () => {
    expect(await importJournal(db, 'u1', undefined, 1)).toEqual({ imported: 0, skipped: 0 })
    expect(await importJournal(db, 'u1', 'nope', 1)).toEqual({ imported: 0, skipped: 0 })
    expect(fake.commits).toHaveLength(0)
  })

  it('round-trips an export', async () => {
    fake.notes = [{ id: 'a', data: { title: 'Trip', createdAt: 5, updatedAt: 6, pinned: true, dayKey: '2026-11-07' } }]
    fake.bodies = { a: { json: doc('Book the ferry'), schemaVersion: SCHEMA_VERSION } }
    const exported = await exportJournal(db, 'u1')
    const file = JSON.parse(JSON.stringify(exported.notes))
    fake.commits = []
    await importJournal(db, 'u1', file, 999)
    const [meta, body] = fake.commits[0]
    expect(meta.data).toMatchObject({ title: 'Trip', pinned: true, dayKey: '2026-11-07', createdAt: 5, updatedAt: 6, excerpt: 'Book the ferry' })
    expect(body.data.json).toBe(doc('Book the ferry'))
  })
})
