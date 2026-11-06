/* Where the Journal lives in Firestore, and the cascading delete — kept apart
   from the hooks (and from TipTap) because account deletion in the main bundle
   needs the same cleanup, and must not pull the editor in to get it.

     users/{uid}/journal/{noteId}                 metadata, listened to as a list
     users/{uid}/journal/{noteId}/content/body    the document, read for one note
     users/{uid}/journal/{noteId}/assets/{id}     images pasted into a note

   Everything under users/{uid} is owner-only by firestore.rules, so none of it
   needs a rule of its own. */

import { collection, doc, getDocs, writeBatch } from 'firebase/firestore'

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
