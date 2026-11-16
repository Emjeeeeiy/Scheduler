# Rules checklist

Walk the sections for the areas the diff touched. Items marked **(sweep)** are also caught mechanically by `sweep.mjs`; confirm those by reading the hit. The rest are judgment checks the sweep cannot make. Each item is a rule this repo has already been burned by.

## Dates and data

- [ ] No `new Date('YYYY-MM-DD')`, `Date.parse(key)`, or `toISOString().slice(0, 10)` for a day; `fromKey` / `toKey` instead. **(sweep)**
- [ ] No `serverTimestamp()` / `Timestamp`; timestamps are `Date.now()` ms. **(sweep)**
- [ ] "N days ago" / "yesterday" is `addDays(todayKey(), -n)`, not `now - n * 86400000` (DST days are 23 or 25 hours). **(sweep)**
- [ ] A time is a minute `0..1439`; a day is a key. No `Date` crosses a function boundary or is stored.
- [ ] A reminder's instant comes from `reminderFireAt(key, min)`.
- [ ] A new field exists in its `normalizeX` with a type-checked default, and the normalizer test's "empty document" `deepEqual` was updated (see `cadence-data`).
- [ ] A write touching one occurrence of a repeating item goes through `resolveOccurrence` / `detachOccurrence` / `overrideAt`; override paths use `FieldPath` (sweep catches a dotted string). **(sweep)**
- [ ] Deletes are soft with Undo that clears `deletedAt`; a hard delete is only purge or account deletion. Anything new that stores another document's id is aware that backup import does not remap ids.
- [ ] Events are not counted anywhere a completion rate, planned hours or the load meter is computed; `tasksOn` stayed task-only.
- [ ] A batch is chunked at 400.
- [ ] A new collection is added to `deleteAllData` (and to export if it should round-trip).
- [ ] A new profile field has `profileKeys()` + `fieldOk` in `firestore.rules` and a rules test; a subcollection field needs no rules change.

## Shared package and functions

- [ ] `packages/shared` stays pure: no `window`, `document`, storage, Firebase. **(sweep)**
- [ ] Imports are `@cadence/shared/<module>.js` subpaths, not the barrel or a relative path. **(sweep)**
- [ ] If `functions/` imports a shared file, it is in `scripts/syncSharedLib.mjs` `FILES` along with everything that file imports (`drift.mjs` sync check).

## UI (see `cadence-ui`)

- [ ] **Registration is complete.** A new view is in `isViewId`, `NAV_ITEMS`/`SCHEDULE_TABS`, the render branch, `SKELETONS`, `LANDING_VIEW_OPTIONS` (if landable), `viewRestore`'s table. A new modal is in `modalOpen`, uses `useModalA11y` (`drift.mjs`), and has a smoke case. A new shortcut is in `SHORTCUT_ACTIONS`, `DEFAULT_SHORTCUTS` and the keydown effect's dependency array.
- [ ] No accent colour; no hex in components or CSS (tokens only); a colour that differs in dark is declared in all three places in `tokens.css`. **(sweep)**
- [ ] Hover is a background step; no shadow, lift or scale as feedback; shadow only on floating layers. **(sweep, note)**
- [ ] No coloured left/top stripe except the time-grid block. **(sweep)**
- [ ] Two faces only; `--font-mono` for bare numerals only, never mixed within one text run. **(sweep)**
- [ ] Icons are drawn in `icons.jsx`, no glyph/emoji. **(sweep)**
- [ ] A tag colour is accompanied by its text label; selected state is not a hue.
- [ ] New page sections are `.frame` / `.stack` / `.divided-row`, not bordered boxes.
- [ ] A phone layout is a CSS change on one DOM tree, not a JS branch; touch block editing still requires a hold to arm.
- [ ] Data comes from context hooks; no Firestore import in a component. **(sweep)**
- [ ] Failures are `console.error('Could not X.', caught)` + `pushError(...)`; no `alert`/`confirm`; no swallowed `catch`. **(sweep)**
- [ ] Interactive controls: icon-only buttons have `aria-label`; toggles have `aria-pressed`; groups have `role="group"` + a label; the dialog is named.
- [ ] Remembered UI state uses `usePersistentState` with a `cadence-app:` key and a `revive` that cannot throw. **(sweep, note)**
- [ ] The journal's paper, ink and typeface did not leak into chrome, and no Journal value went into `tokens.css`.

## API (see `cadence-api`)

- [ ] Order is `verifyRequest` → `readJsonBody` → `aiInput` readers/caps → `enforceAiLimits` → `generateJson` → `sanitize`; an empty request returns a cheap 200 before the budget.
- [ ] The route imports no `@google/genai`; reads no `VITE_` variable. **(sweep)**
- [ ] A new budget is in `LIMITS`; a new input shape has a `CAPS` entry and reader.
- [ ] The model's answer is rebuilt field by field: ids from this request only, ranges checked, a proposed time fits a supplied slot, a real calendar day verified.
- [ ] User text enters the prompt through `JSON.stringify`.
- [ ] A caught error's message is never returned; user-facing text is an `ApiError`. Configuration problems are logged, not shown. **(sweep)**
- [ ] The client call goes through `callApi`, has a heuristic fallback, is gated on `emailVerified`, and fires only on a press or a debounce. **(sweep, raw fetch)**
- [ ] `aiDisclosure.js` and the README Security section match what now leaves the device.
- [ ] A session-less push route has a per-IP budget and a proof of ownership.

## Tests (see `cadence-tests`)

- [ ] The test is in the right layer and the right runner (`.test.js` node:test vs `.test.jsx` vitest). **(sweep)**
- [ ] An api test is in `apiTests`; a new `useSchedule()` member or context export is in every mock and in `tests/smoke/mockSchedule.jsx` (`drift.mjs`).
- [ ] No `.only`; no `.skip` left behind. **(sweep)**
- [ ] A bug fix carries a `// Regression:` test that fails without the fix.
- [ ] Date tests use fixed keys with a weekday comment; date logic was also run under `with-tz.mjs America/Los_Angeles`.
- [ ] Tests assert behaviour by role and name, not incidental markup; smoke `expect`s do not depend on the date or hour.

## General

- [ ] No `console.log` or commented-out code left behind. **(sweep)**
- [ ] No new `TODO`/`FIXME`; there are none today. **(sweep, note)**
- [ ] Comments explain *why* (the rejected alternative, the bug), not what the code plainly says.
- [ ] Nothing outside the change's scope was refactored along the way.
- [ ] No secret, key or `.env` value in the diff.
