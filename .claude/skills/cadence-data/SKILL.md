---
name: cadence-data
description: Use when changing Cadence's data — adding or changing a field on a task, event, tag, template or note, a new Firestore write or collection, a profile field, backup/export, recurrence, or anything involving day keys, minutes, timestamps or time zones. Carries the data invariants (day-key strings, minutes from midnight, millisecond timestamps, normalize-on-read, soft delete, occurrence detaching) and the exact checklist of files a field touches. Not for the UI around the data (cadence-ui) or /api routes (cadence-api).
user-invocable: true
argument-hint: "[field | write | recurrence | dates] [what you are changing]"
allowed-tools:
  - Bash(npx vitest run *)
  - Bash(npm test)
  - Bash(npm run test:functions)
  - Bash(node .claude/skills/cadence-verify/scripts/*)
---

Cadence's data layer is small and strict: one Firestore tree per account, pure normalizers shared by the web app and the Cloud Functions, and two date types the whole app agrees on. Most data bugs here are an invariant broken quietly (a `Date` crossing a boundary, a field validated on write but not on read), not a crash. Pick the reference for the job:

| You are | Read |
| --- | --- |
| Adding or changing a field on a task, event, tag, template, profile or note | [references/field-checklist.md](references/field-checklist.md) |
| Adding a write in `ScheduleContext`, or touching delete/undo/import/export | [references/writes.md](references/writes.md) |
| Doing anything with a day, a time, a repeat rule or a reminder time | [references/dates-recurrence.md](references/dates-recurrence.md) |

## The model, in one screen

```text
users/{uid}                          profile: username email createdAt displayName photoBase64 dailyDigestEnabled
users/{uid}/tasks|events|tags|templates|focusSessions/{id}
users/{uid}/journal/{noteId}         metadata (title excerpt dayKey pinned paper …)
users/{uid}/journal/{noteId}/content/body   the note text as ONE JSON string
```

Nothing lives outside `users/{uid}`. Three task states come from two fields: `date` null (inbox), `date` set with `startMin` null (all-day), both set (a real block). The README's data section lags the code (it omits events, templates, focus sessions and the newer task fields); read `packages/shared/src/normalize.js` for the truth.

## Invariants (each one has caused a bug)

1. **Two date types only: a day key `'YYYY-MM-DD'` and a minute `0..1439` from local midnight.** Never pass a `Date` across a module boundary, never store a Timestamp, and never write `new Date('2026-08-24')` (it parses as UTC and is the 23rd for anyone west of Greenwich). Use the helpers in `@cadence/shared/date.js`.
2. **Timestamps are `Date.now()` milliseconds, never `serverTimestamp()`.** The latter reads back `null` until the server acknowledges, which breaks ordering and is wrong offline entirely.
3. **Firestore documents are untrusted.** Every snapshot goes through `normalizeTask`, `normalizeEvent`, `normalizeTag`, `normalizeTemplate` or `normalizeFocusSession` (and `normalizeNote` / `normalizeNoteBody` for the Journal), which coerce every field so one half-written document cannot blank a calendar. **Validation lives on the read side**: `updateTask` writes its patch as given, so a field you add is only safe once its normalizer clause exists.
4. **Deletes are soft.** `removeTask`/`removeEvent` stamp `deletedAt`; `restoreItem` clears it; only `purgeItem`/`emptyTrash` hard-delete. Skipping one day of a repeating series is an override, not a delete, and has no Trash entry.
5. **A repeating item is one document, expanded on read.** Editing or deleting a single day *detaches* it (a new ordinary document plus `overrides.{day} = {detached:true}` on the series). Override paths are always `new FieldPath('overrides', dayKey)`, because a day key is not a valid dotted path. Resolve an id from the UI with `resolveOccurrence` / `resolveEventOccurrence` before any write.
6. **Events are not tasks.** They have no `done`, are not counted in `dayStats`, `overdueTasks`, `upcomingTasks`, `tagBreakdown` or any completion rate, and `tasksOn(key)` stays task-only. Only a **single-day** event may repeat; `normalizeEvent` enforces it, so a hand-edited document cannot smuggle a spanning series past the UI.
7. **A shared file must stay pure.** `packages/shared` imports no `window`, `document`, `localStorage` or Firebase, and is imported **by subpath** (`@cadence/shared/date.js`), never through the barrel. Four of its files are also copied into `functions/shared/lib/` (see the field checklist); a change to them is exercised by `npm run test:functions`.
8. **Batches are chunked at 400** (Firestore's limit is 500): the loop is written out in `ScheduleContext` in five places, so copy it rather than building one big batch.

## Known sharp edges (verified in the code; do not copy, do not "fix" unasked)

- **Importing a backup does not remap ids.** `importData` gives each imported tag, task and event a new auto id but leaves `tagId`, `blockedBy` and a tag's `parentId` pointing at the *old* ones, so restoring into a fresh account loses tag links; the derived `color` field from `normalizeTag` is also written to the document. Anything you add that references another document's id has this problem too.
- **Docs lag the recurrence code.** The header of `recurrence.js`, README, PRODUCT.md and DESIGN.md ("Don't add an end date or an interval") say a rule has no interval and no end date. The code now has three shapes (`weekly`, `monthly`, `interval`) and an optional `until`. Treat the code as current; if you edit those docs, correct the sentence you touch.
- **A test mocking `useSchedule()` supplies only what its component reads**; a new context member breaks the mocks in `tests/*.test.jsx` and `tests/smoke/mockSchedule.jsx` (see `cadence-tests`).

## Done

Run `cadence-verify` (a shared-logic change plans `test`, `test:dom`, `test:render`, `build`, `test:functions` when a synced file changed, and the DST pass for date code). Update README's data section when a field is added, and PRODUCT.md if a capability changed.
