import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot, updateDoc, writeBatch } from 'firebase/firestore'
import {
  SCHEMA_VERSION,
  emptyDoc,
  normalizeNote,
  normalizeNoteBody,
  normalizePaper,
  sortNotes,
} from '@cadence/shared/journal.js'
import { bodyRef, journalCol, noteRef, purgeNote } from './journalData.js'
import { db } from '../firebase.js'
import { useAuth } from './AuthContext.jsx'
import { useSettings } from './SettingsContext.jsx'

/* The Journal's data seam: what the page reads and every way it writes.
 *
 * Two listeners, deliberately different in weight. The list listens to the
 * metadata collection — small documents, so the whole list stays live and
 * searchable in memory. A note's body is a separate, possibly large document
 * and is listened to only while that note is open.
 *
 * Writes use the client clock and are never awaited for "saved" state: with the
 * offline cache, a write resolves only when the server acknowledges it, which
 * may be never on a train. The UI reports "saved on this device" from the
 * snapshot's own pending-writes flag instead, and treats a rejected write (a
 * permission or size error) as the only real failure.
 */

const now = () => Date.now()

/** Notes for the signed-in account: live, trashed, and whether the first
    snapshot has landed. Same "ready for THIS uid" derivation as the schedule —
    a previous account's notes can never flash while a new one loads. */
export function useJournalNotes() {
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const [state, setState] = useState({ uid: null, notes: [], error: null })

  useEffect(() => {
    if (!uid) return undefined
    return onSnapshot(
      journalCol(db, uid),
      (snapshot) =>
        setState({ uid, notes: snapshot.docs.map((d) => normalizeNote(d.id, d.data())), error: null }),
      (caught) => {
        console.error('Could not read the journal.', caught)
        setState({ uid, notes: [], error: caught.message ?? 'Could not read your notes.' })
      },
    )
  }, [uid])

  const ready = uid !== null && state.uid === uid
  return useMemo(() => {
    const all = ready ? state.notes : []
    return {
      loading: !ready,
      error: ready ? state.error : null,
      notes: sortNotes(all.filter((note) => note.deletedAt === null)),
      trashed: all.filter((note) => note.deletedAt !== null).sort((a, b) => b.deletedAt - a.deletedAt),
    }
  }, [ready, state])
}

/** One note's body, live. `fromCache` + `exists: false` is the offline trap: the
    body was never downloaded on this device, so "missing" does not mean "empty"
    — see NoteEditor, which refuses to open an editor on it. */
export function useNoteBody(noteId) {
  const { user } = useAuth()
  const uid = user?.uid ?? null
  const key = uid && noteId ? `${uid}/${noteId}` : null
  const [snap, setSnap] = useState(null)

  useEffect(() => {
    if (!key) return undefined
    return onSnapshot(
      bodyRef(db, uid, noteId),
      { includeMetadataChanges: true },
      (snapshot) =>
        setSnap({
          key,
          exists: snapshot.exists(),
          body: normalizeNoteBody(snapshot.exists() ? snapshot.data() : undefined),
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          fromCache: snapshot.metadata.fromCache,
          error: null,
        }),
      (caught) => {
        console.error('Could not read the note.', caught)
        setSnap({
          key,
          exists: false,
          body: null,
          hasPendingWrites: false,
          fromCache: false,
          error: caught.message ?? 'Could not open this note.',
        })
      },
    )
  }, [key, uid, noteId])

  const current = snap && snap.key === key ? snap : null
  return current ? { loading: false, ...current } : { loading: true }
}

/** Every write the Journal makes. Each returns the underlying promise so a
    caller can report a failure; none should be awaited to decide "saved". */
export function useJournalActions() {
  const { user } = useAuth()
  const { settings } = useSettings()
  const uid = user?.uid ?? null
  const defaultPaper = settings.journalPaper

  return useMemo(() => {
    if (!uid) return null
    return {
      /** Writes the metadata and an empty body together and returns the new id
          straight away — the id is generated locally, so the editor can open
          before the network is involved at all. */
      createNote({ title = '', dayKey = null, paper } = {}) {
        const ref = doc(journalCol(db, uid))
        const stamp = now()
        const json = JSON.stringify(emptyDoc())
        const batch = writeBatch(db)
        batch.set(ref, {
          title,
          excerpt: '',
          dayKey,
          pinned: false,
          hasDrawing: false,
          bytes: json.length,
          paper: normalizePaper(paper ?? defaultPaper ?? undefined),
          createdAt: stamp,
          updatedAt: stamp,
          deletedAt: null,
        })
        batch.set(bodyRef(db, uid, ref.id), { json, schemaVersion: SCHEMA_VERSION, updatedAt: stamp })
        return { id: ref.id, committed: batch.commit() }
      },

      /** Body and the metadata derived from it, in one atomic batch so the list
          never shows an excerpt that disagrees with the note. `update`, not
          `set`, on the metadata: saving a note someone purged elsewhere should
          fail loudly rather than resurrect a half-empty shell of it. */
      saveNote(id, { json, title, excerpt, hasDrawing, bytes }) {
        const stamp = now()
        const batch = writeBatch(db)
        batch.set(bodyRef(db, uid, id), { json, schemaVersion: SCHEMA_VERSION, updatedAt: stamp })
        batch.update(noteRef(db, uid, id), { title, excerpt, hasDrawing, bytes, updatedAt: stamp })
        return batch.commit()
      },

      /** Pinning and paper are not edits, so they leave "Edited …" alone. */
      updateNoteMeta: (id, patch) => updateDoc(noteRef(db, uid, id), patch),

      trashNote: (id) => updateDoc(noteRef(db, uid, id), { deletedAt: now() }),
      restoreNote: (id) => updateDoc(noteRef(db, uid, id), { deletedAt: null }),
      purgeNote: (id) => purgeNote(db, uid, id),
      async emptyTrash(ids) {
        for (const id of ids) await purgeNote(db, uid, id)
        return ids.length
      },
    }
  }, [uid, defaultPaper])
}
