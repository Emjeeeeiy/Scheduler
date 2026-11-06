/* An in-memory stand-in for src/state/useJournal.js, swapped in by the smoke
 * build's alias (tests/smoke/vite.config.js) so the Journal renders without a
 * Firebase project — the same arrangement mockSchedule.jsx has for the schedule.
 *
 * It is a small working store rather than a static fixture: writes change what
 * the hooks return and notify subscribers, so the same module also backs a
 * browser harness that drives the real editor (typing, formatting, switching
 * paper) and watches the list react.
 */

import { useMemo, useSyncExternalStore } from 'react'
import {
  SCHEMA_VERSION,
  emptyDoc,
  normalizeNote,
  normalizeNoteBody,
  normalizePaper,
  sortNotes,
} from '@cadence/shared/journal.js'

const text = (value, marks) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) })
const para = (...content) => ({ type: 'paragraph', content })

export const SEED_DOC = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [text('Trip to Cebu')] },
    para(text('Book the '), text('ferry', [{ type: 'bold' }]), text(' and pack '), text('sunscreen', [{ type: 'italic' }]), text('.')),
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [para(text('Passports'))] },
        { type: 'listItem', content: [para(text('Snorkel gear'))] },
      ],
    },
    {
      type: 'taskList',
      content: [
        { type: 'taskItem', attrs: { checked: true }, content: [para(text('Reserve the hotel'))] },
        { type: 'taskItem', attrs: { checked: false }, content: [para(text('Buy ferry tickets'))] },
      ],
    },
    para(),
  ],
}

const NOW = Date.UTC(2026, 10, 6, 7, 0, 0)

function seedNote(id, fields, doc) {
  const json = JSON.stringify(doc ?? emptyDoc())
  return {
    note: normalizeNote(id, {
      excerpt: '',
      hasDrawing: false,
      bytes: json.length,
      createdAt: NOW - 86_400_000,
      updatedAt: NOW - 3_600_000,
      deletedAt: null,
      ...fields,
    }),
    body: { json, schemaVersion: SCHEMA_VERSION, updatedAt: NOW },
  }
}

function initial() {
  const seeds = [
    seedNote('n1', { title: 'Trip to Cebu', excerpt: 'Book the ferry and pack sunscreen. Passports Snorkel gear', pinned: true }, SEED_DOC),
    seedNote('n2', { title: 'Reading list', excerpt: 'Three books to finish this month', updatedAt: NOW - 3 * 86_400_000, paper: { pattern: 'lined', spacing: 28 } }),
    seedNote('n3', { title: '', excerpt: '', updatedAt: NOW - 20 * 60_000 }),
    seedNote('n4', { title: 'Old draft', excerpt: 'Throwaway', deletedAt: NOW - 3_600_000 }),
  ]
  return {
    notes: Object.fromEntries(seeds.map((s) => [s.note.id, s.note])),
    bodies: Object.fromEntries(seeds.map((s) => [s.note.id, s.body])),
  }
}

let state = initial()
let counter = 0
const listeners = new Set()

function commit(next) {
  state = next
  for (const listener of listeners) listener()
}

const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const getState = () => state

/** Back to the seed data — for tests that mutate the store. */
export function resetMockJournal() {
  state = initial()
  counter = 0
  for (const listener of listeners) listener()
}

export function useJournalNotes() {
  const current = useSyncExternalStore(subscribe, getState, getState)
  return useMemo(() => {
    const all = Object.values(current.notes)
    return {
      loading: false,
      error: null,
      notes: sortNotes(all.filter((n) => n.deletedAt === null)),
      trashed: all.filter((n) => n.deletedAt !== null).sort((a, b) => b.deletedAt - a.deletedAt),
    }
  }, [current])
}

export function useNoteBody(noteId) {
  const current = useSyncExternalStore(subscribe, getState, getState)
  return useMemo(() => {
    const raw = current.bodies[noteId]
    return {
      loading: false,
      exists: Boolean(raw),
      body: normalizeNoteBody(raw),
      hasPendingWrites: false,
      fromCache: false,
      error: null,
    }
  }, [current, noteId])
}

export function useJournalActions() {
  return useMemo(
    () => ({
      createNote({ title = '', dayKey = null, paper } = {}) {
        const id = `new${++counter}`
        const json = JSON.stringify(emptyDoc())
        const stamp = Date.now()
        commit({
          notes: {
            ...state.notes,
            [id]: normalizeNote(id, {
              title,
              dayKey,
              bytes: json.length,
              paper: normalizePaper(paper),
              createdAt: stamp,
              updatedAt: stamp,
            }),
          },
          bodies: { ...state.bodies, [id]: { json, schemaVersion: SCHEMA_VERSION, updatedAt: stamp } },
        })
        return { id, committed: Promise.resolve() }
      },
      saveNote(id, { json, title, excerpt, hasDrawing, bytes }) {
        const stamp = Date.now()
        commit({
          notes: { ...state.notes, [id]: { ...state.notes[id], title, excerpt, hasDrawing, bytes, updatedAt: stamp } },
          bodies: { ...state.bodies, [id]: { json, schemaVersion: SCHEMA_VERSION, updatedAt: stamp } },
        })
        return Promise.resolve()
      },
      updateNoteMeta(id, patch) {
        commit({ ...state, notes: { ...state.notes, [id]: normalizeNote(id, { ...state.notes[id], ...patch }) } })
        return Promise.resolve()
      },
      trashNote(id) {
        commit({ ...state, notes: { ...state.notes, [id]: { ...state.notes[id], deletedAt: Date.now() } } })
        return Promise.resolve()
      },
      restoreNote(id) {
        commit({ ...state, notes: { ...state.notes, [id]: { ...state.notes[id], deletedAt: null } } })
        return Promise.resolve()
      },
      purgeNote(id) {
        const { [id]: _note, ...notes } = state.notes
        const { [id]: _body, ...bodies } = state.bodies
        commit({ notes, bodies })
        return Promise.resolve()
      },
      async emptyTrash(ids) {
        for (const id of ids) await this.purgeNote(id)
        return ids.length
      },
    }),
    [],
  )
}
