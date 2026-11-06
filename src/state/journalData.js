/* Where the Journal lives in Firestore, and the cascading delete — kept apart
   from the hooks (and from TipTap) because account deletion in the main bundle
   needs the same cleanup, and must not pull the editor in to get it.

     users/{uid}/journal/{noteId}                 metadata, listened to as a list
     users/{uid}/journal/{noteId}/content/body    the document, read for one note
     users/{uid}/journal/{noteId}/assets/{id}     images pasted into a note

   Everything under users/{uid} is owner-only by firestore.rules, so none of it
   needs a rule of its own. */

import { collection, doc, getDoc, getDocs, writeBatch } from 'firebase/firestore'
import {
  MAX_IMPORT_NOTES,
  noteFromBackup,
  noteToBackup,
  normalizeNote,
  normalizeNoteBody,
} from '@cadence/shared/journal.js'

export const journalCol = (db, uid) => collection(db, 'users', uid, 'journal')
export const noteRef = (db, uid, id) => doc(db, 'users', uid, 'journal', id)
export const bodyRef = (db, uid, id) => doc(db, 'users', uid, 'journal', id, 'content', 'body')
export const assetsCol = (db, uid, id) => collection(db, 'users', uid, 'journal', id, 'assets')

const BATCH = 400

async function commitDeletes(db, refs) {
  for (let i = 0; i < refs.length; i += BATCH) {
    const batch = writeBatch(db)
    for (const ref of refs.slice(i, i + BATCH)) batch.delete(ref)
    await batch.commit()
  }
}

/** One note and everything under it. Deleting a document in Firestore leaves its
    subcollections behind as unreachable orphans, so the body and every asset go
    first and the metadata last — a half-finished purge then still shows the note
    in the Trash, where it can be purged again, instead of vanishing with its
    data still stored. */
export async function purgeNote(db, uid, id) {
  const assets = await getDocs(assetsCol(db, uid, id)).catch(() => null)
  const refs = [...(assets?.docs.map((d) => d.ref) ?? []), bodyRef(db, uid, id), noteRef(db, uid, id)]
  await commitDeletes(db, refs)
}

/** Every note this account owns. Used by account deletion. */
export async function deleteAllJournal(db, uid) {
  const snapshot = await getDocs(journalCol(db, uid))
  for (const note of snapshot.docs) await purgeNote(db, uid, note.id)
  return snapshot.size
}

/** Every note, body included, as entries for the JSON backup. A note whose body
    cannot be read (offline, and never opened on this device, so not cached) is
    counted in `unreadable` instead of being written out empty — a backup that
    quietly holds blank notes is worse than one that says what it is missing. */
export async function exportJournal(db, uid) {
  const snapshot = await getDocs(journalCol(db, uid))

  async function read(entry) {
    try {
      const body = await getDoc(bodyRef(db, uid, entry.id))
      return noteToBackup(normalizeNote(entry.id, entry.data()), normalizeNoteBody(body.exists() ? body.data() : {}))
    } catch {
      return null
    }
  }

  const results = []
  for (let i = 0; i < snapshot.docs.length; i += 6) {
    results.push(...(await Promise.all(snapshot.docs.slice(i, i + 6).map(read))))
  }
  const notes = results.filter(Boolean).sort((a, b) => a.createdAt - b.createdAt)
  return { notes, unreadable: results.length - notes.length }
}

/** Notes from a backup file become new notes (new ids, like imported tasks), so
    importing never overwrites anything. One note per commit: each body can be
    close to a megabyte, and a batch is capped well below forty of those. */
export async function importJournal(db, uid, rawNotes, stamp) {
  const list = Array.isArray(rawNotes) ? rawNotes : []
  let imported = 0
  let skipped = Math.max(0, list.length - MAX_IMPORT_NOTES)
  for (const raw of list.slice(0, MAX_IMPORT_NOTES)) {
    const prepared = noteFromBackup(raw, stamp)
    if (prepared.error) {
      skipped += 1
      continue
    }
    const ref = doc(journalCol(db, uid))
    const batch = writeBatch(db)
    batch.set(ref, prepared.meta)
    batch.set(bodyRef(db, uid, ref.id), { json: prepared.json, schemaVersion: prepared.schemaVersion, updatedAt: stamp })
    await batch.commit()
    imported += 1
  }
  return { imported, skipped }
}
