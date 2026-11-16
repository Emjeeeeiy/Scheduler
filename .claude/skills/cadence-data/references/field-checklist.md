# Adding a field

Work down the list in order; each step names the file. Skip a step only when its condition clearly does not apply.

Normalizers live in `packages/shared/src/normalize.js`: `normalizeTask`, `normalizeEvent`, `normalizeTag`, `normalizeTemplate`, `normalizeFocusSession`. Exported constants for enums: `TASK_PRIORITIES`, `TAG_SLOTS`, `TAG_ICONS`, `DEFAULT_DURATION_MIN`, `DEFAULT_EVENT_DURATION_MIN`, `MAX_EVENT_DAYS`. Journal notes have their own in `packages/shared/src/journal.js`.

## 1. The normalizer (always)

Add the field to the right `normalizeX`, coercing by type with a safe default:

```js
// boolean: only a literal true counts, so an absent or malformed value reads as "off"
pinned: raw?.pinned === true,
// number: Number.isFinite, then clamp to the range the app can draw
durationMin: Number.isFinite(raw?.durationMin) ? Math.min(24 * 60, Math.max(5, Math.round(raw.durationMin))) : DEFAULT_DURATION_MIN,
// enum: validate against the exported list
priority: TASK_PRIORITIES.includes(raw?.priority) ? raw.priority : 'normal',
// string reference: non-empty string or null
tagId: typeof raw?.tagId === 'string' && raw.tagId ? raw.tagId : null,
// list: filter, de-duplicate and cap
blockedBy: Array.isArray(raw?.blockedBy) ? [...new Set(raw.blockedBy.filter((v) => typeof v === 'string' && v))] : [],
```

Rules: a field that only makes sense with another is coerced to `null` without it (`startMin` is null without a `date`; `overrides` survive only with a `recurrence`); never trust `raw` to be an object (`raw?.x`); a timestamp is `Number.isFinite(...) ? value : 0`/`null`. Write a one-line comment on *why* the default is what it is; this file's comments are the spec.

**This one change also carries the field through backup.** Export dumps the *normalized* objects and `importData` re-normalizes on the way back in, so anything `normalizeX` omits is silently dropped from a restore.

## 2. The normalizer test (always)

`tests/normalize.test.js`. The "fills in every field from an empty document" `deepEqual` tests **will fail** until you add the new field's default to them; that is the prompt to do it. Add a coercion test: a valid value kept, a junk value defaulted, an out-of-range value clamped.

## 3. Detaching and derived fields

A detached occurrence is built by spreading the series (`detachOccurrence` in `ScheduleContext.jsx`). If the new field is **derived** (computed, like a tag's `color`) or must **not** carry from a series to a detached day, add it to the destructure exclusions there. A normal field carries over, which is right for most.

## 4. The UI that edits it

`src/components/editors/TaskEditor.jsx` / `EventEditor.jsx` (the draft state and payload), plus the display (`ItemDetail.jsx`, row components). See `cadence-ui`. Build the payload and let `useSchedule()` normalize; do not duplicate validation in the editor.

## 5. Smoke and mock fixtures

`tests/smoke/mockSchedule.jsx` (`mockValue` tasks/events), and any vitest file that builds a task by hand if the field is required by the component. If the field adds a new `useSchedule()` member, add it to `mockValue` and every mock of that context (see `cadence-tests`).

## 6. Exports (when a person would expect to see it)

`packages/shared/src/exportFormats.js` builds the CSV and `.ics`; add a column or property and extend `tests/exportFormats.test.js`. The JSON backup needs nothing beyond step 1.

## 7. AI (when the model should know about it)

Add it to the route's JSON `schema` (every field `required`; nullable via a type array) and to that route's private `sanitize`; see `cadence-api`. Anything sent to the model also goes in `src/lib/aiDisclosure.js`.

## 8. A profile field (`users/{uid}` itself)

The only place `firestore.rules` shapes data. In `firestore.rules`: add the name to `profileKeys()` and a `fieldOk(data, keys, 'name', <validity expression>)` clause in `profileFieldsOk`. Add accept and refuse cases to `tests/rules/firestoreRules.spec.mjs` (needs JDK 21+; CI's `rules` job runs it where you cannot). Write it from a `ScheduleContext` method with `setDoc(…, { merge: true })`.

**Subcollection documents (tasks, events, tags, …) need no rules change**: they are owner-only with no shape checks, so their integrity is entirely the read-side normalizers from step 1.

## 9. Cloud Functions (when the daily digest or another function reads it)

`functions/` imports the shared normalizers through a **copy**: `scripts/syncSharedLib.mjs` copies `date.js`, `recurrence.js`, `normalize.js` and `stats.js` from `packages/shared/src/` into `functions/shared/lib/` (gitignored) on `pretest` and `predeploy`. Firebase uploads only `functions/`, so a file missing from that list works locally and fails once deployed.

- If your change adds an `import` from a new shared file in one of those four, add the new file to `FILES` too. `drift.mjs` (sync check) reports this.
- Run `npm run test:functions`. Add a case to `functions/test/` if the digest should behave differently. Note that nothing in `functions/lib/` or `packages/shared/src/stats.js` checks `deletedAt`, so the digest currently counts trashed tasks; if your change touches what the digest lists, check `deletedAt` yourself and add the test.

## 10. Docs

README "How the data is shaped" for the field and its meaning; PRODUCT.md if a person can now do something new. Then `cadence-verify`.

## Order of operations for a rename or removal

Do not rename a stored field in one step: existing documents still carry the old name. Read the old and new (`raw?.newName ?? raw?.oldName`) in the normalizer, write the new name from now on, and leave the fallback in for as long as old documents can exist. A missing `freq` reading as `'weekly'` in `normalizeRecurrence` is the existing example.
