# Writes in `ScheduleContext`

`src/state/ScheduleContext.jsx` is the one data seam: one `onSnapshot` per collection (tasks, tags, events gate `loading`; the profile, templates and focus sessions are optional and do not), all derived data built once in a single `useMemo`, and every write a method on that memo's value. Components never import Firestore.

## Reading: what the memo guarantees

- **Soft-deleted items are filtered out once**, at the top of the memo; views never see them (the Trash lists come from `trashedTasks` / `trashedEvents`).
- **`tasksOn(key)` and `eventsOn(key)`** bucket by day and are cached. `tasksOn` is task-only, permanently; a view that wants both composes them.
- **Tag cycles are resolved** in the memo, so a bad `parentId` cannot loop the tag tree.
- **`loading` is derived** as `uid !== null && readyUid !== uid`. A new listener's error branch must still mark itself ready, or the app never leaves its skeleton.
- Consumers call `useSchedule()`, which throws outside the provider.

## Writing: the rules

1. **Stamp with `now()` (ms)** and always set `updatedAt`. Never `serverTimestamp()`.
2. **Resolve an id first.** An id coming from the UI may be a *virtual occurrence* (`seriesId~YYYY-MM-DD`, see `parseOccurrenceId`). Pass it through `resolveOccurrence` (tasks) or `resolveEventOccurrence` (events); if it returns an occurrence, the write is different:
   - **edit or move one day** → `detachOccurrence(occurrence, patch)`: one `writeBatch` that creates an ordinary document from the occurrence (minus `id`, `seriesId`, `occurrenceDate`, `recurrence`, `createdAt`, `updatedAt`; with `recurrence: null`, `overrides: {}`) and stamps the series with `overrides.{day} = { detached: true }`. It resolves to the **new** document's id, which a caller making several edits in a row must use for the later ones.
   - **tick one day done** → `updateDoc(series, overrideAt(day), { done: true, completedAt }, 'updatedAt', now())`; un-ticking uses `deleteField()`.
   - **skip one day** → the same override with `{ detached: true }`. No Trash entry, because there is no document to restore.
3. **Override paths are `new FieldPath('overrides', dayKey)`** (`overrideAt`). A day key has hyphens, so a dotted string path would be parsed wrongly.
4. **Delete is a `deletedAt` stamp.** `restoreItem(kind, id)` sets it back to `null`; `purgeItem` and `emptyTrash` are the only hard deletes and the caller must confirm first. Undo restores by clearing the stamp, never by writing a snapshot back (that would create a second copy).
5. **Build new documents through the normalizers**, as `addTask` does: `normalizeTask('new', { ...draft, date })`, drop `id`, then apply the fresh-item values (`done: false`, `completedAt: null`, `overrides: {}`, `createdAt`/`updatedAt` = now) *after* the spread so they always win.
6. **`updateX(id, patch)` writes the patch as given.** The normalizer runs on the next read, not on the write; so a patch must already be well-formed, and a new field is only safe once its normalizer clause exists.
7. **Batch in chunks of 400**: `for (let i = 0; i < refs.length; i += 400) { const batch = writeBatch(db); for (const ref of refs.slice(i, i + 400)) batch.…; await batch.commit() }`. The loop appears five times; copy it, do not build one oversized batch.
8. **Return the Firestore promise** and let the caller `await` it in a `try`; the UI turns a failure into `pushError` (see `cadence-ui`).
9. **Deleting an account must delete everything**: `deleteAllData` lists the collections it clears. Today it does not include `templates` or `focusSessions`; a new collection needs adding there (and to export, if it should round-trip).

## Adding a write method

1. Add it inside the memo's value object, near its siblings, following the rules above.
2. Add a `noop` for it to `mockValue` in `tests/smoke/mockSchedule.jsx` (the SSR smoke build swaps the whole context for that file), and to the `useSchedule` mock of any vitest file whose component will call it.
3. Test the contract that matters (which write, with what) from the component's test; the real provider needs Firebase and is not under test anywhere, so be careful with this file and check the write by reading it twice.
4. Document the method with a comment on *why* it is shaped that way: the existing methods' comments are where the decisions are recorded.

## Backup: export and import

- **Export** (`DataSection.jsx`) writes the normalized tasks, events and tags plus Journal notes (`exportJournal` reads each body on demand). An export that could not read some notes says so; keep that honesty.
- **Import** (`importData`) re-normalizes every item and writes full documents directly (not through `addTask`), preserving done state and overrides. Notes are imported one at a time (each is two documents and can approach a megabyte). It resolves to `{ count, skippedNotes }`.
- **Import does not remap references.** Tags, tasks and events get new auto ids while `tagId`, `blockedBy` and `parentId` keep the exported ones, so links break when restoring into an account without the original documents. If you add a field that stores another document's id, say that it will break the same way, or fix it properly (build an old-id → new-id map before writing); do not leave it silent.
- CSV and `.ics` exports are one-way (`packages/shared/src/exportFormats.js`).

## The Journal seam

Notes are separate: `src/state/useJournal.js` (`useJournalNotes`, `useNoteBody`, `useJournalActions`) and `src/state/journalData.js`. A note is two documents (metadata for the list, body read only for the open note) and the body is **one JSON string**, because Firestore rejects arrays directly inside arrays and caps nesting at twenty levels. Check the size before writing (warn at 750 KB, refuse at 950 KB, never truncate). A body that cannot be read, or that a newer build wrote, opens **read-only** and is never autosaved over. "Saved" means *queued* (the pending-writes flag), not server-acknowledged, because awaiting the server hangs offline.
