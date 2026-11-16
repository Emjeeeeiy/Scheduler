---
name: cadence-tests
description: Use when writing or changing tests in Cadence — a new test file, a regression test for a bug, mocking a context, testing an api route, a Firestore rule, a Cloud Function or the SSR smoke render. Picks the right layer (node:test vs vitest vs rules vs functions vs smoke), and carries the file-naming, mocking, time-faking and registration rules that otherwise fail in confusing ways. Not for deciding which checks to run (cadence-verify).
user-invocable: true
argument-hint: "[what to test]"
allowed-tools:
  - Bash(npx vitest run *)
  - Bash(node --test *)
  - Bash(npm test)
  - Bash(node .claude/skills/cadence-verify/scripts/*)
---

Cadence tests live in five layers that look alike and break differently. Choose the layer first; the rest follows from it. Copy-ready skeletons are in [references/templates.md](references/templates.md).

## 1. Pick the layer

| The thing under test | Layer | File | Runs with |
| --- | --- | --- | --- |
| Pure logic: `packages/shared`, JSX-free `src/lib/*.js` (dates, recurrence, normalizers, parsing, layout, stats) | node:test | `tests/<name>.test.js` | `npm test` |
| A component, hook or context consumer (needs a DOM) | vitest + jsdom | `tests/<name>.test.jsx` | `npx vitest run tests/<name>.test.jsx` |
| An `api/*.js` route or `api/_lib` helper | vitest, **node project** | `tests/<name>.test.jsx` + **add to `apiTests`** | `npx vitest run --project node` |
| `firestore.rules` | node:test + emulator | `tests/rules/<name>.spec.mjs` | `npm run test:rules` (JDK 21+) |
| `functions/lib/*` | node:test | `functions/test/<name>.test.js` | `npm run test:functions` |
| "Does every view still render?" | SSR smoke | a `cases` entry + `expect(...)` in `tests/smoke/entry.jsx` | `npm run test:render` |

## 2. The rules that fail confusingly

- **The extension picks the runner.** `npm test` globs `tests/**/*.test.js` and runs them with `node --test`; vitest includes only `tests/**/*.test.jsx`. So a `.test.js` file must import `describe`/`it` from `node:test`, a `.test.jsx` from `vitest`, and swapping them misbehaves (the `vitest.config.js` header says as much). Node cannot parse JSX, so a node:test file may only import JSX-free modules.
- **Api handler tests are named `.jsx` only to reach vitest**, and must be listed in `apiTests` in `vitest.config.js` (including one that only does a lazy `await import('../api/...')`). Unlisted, it runs under jsdom and dies with `ReadableStream is not defined`. `cadence-verify`'s `drift.mjs` catches a missing entry.
- **Rules specs are `.spec.mjs` on purpose**, outside both globs, because they need the emulator.
- **A mock supplies only what its consumer reads.** `vi.mock('../src/state/ScheduleContext.jsx', ...)` returns an object with just the members the component under test uses. If the component later reads a new `useSchedule()` member, every test mocking it for that component breaks; add the member to those mocks. Mock paths are relative and include the extension.
- **Mock before you import the component.** `vi.mock` calls and the `vi.hoisted` state they close over go above `import { X } from '../src/...'`.
- **The smoke mocks are shared.** `tests/smoke/mockSchedule.jsx`, `mockAuth.jsx`, `mockJournal.js` replace the real modules for `test:render` *and* are reused by some vitest files (`vi.mock('../src/state/useJournal.js', async () => import('./smoke/mockJournal.js'))`). A new `useSchedule()` member or a new named export from a real context needs mirroring there, or `test:render` fails to build.
- **Two fake-timer idioms, both reset with `vi.useRealTimers()` in `afterEach`.** To pin "today": `vi.useFakeTimers({ toFake: ['Date'] })` then `vi.setSystemTime(new Date('<day>T12:00:00'))` (local time, no `Z`), which leaves `setTimeout` and animation frames real. To step a debounce such as the Journal's 0.8 s autosave: mount and `await` the editor first (`await editorOf(container)` in `journalSurface.test.jsx`), then call `vi.useFakeTimers()` and `await vi.advanceTimersByTimeAsync(800)` inside `act`. Build relative fixtures from `todayKey()` / `addDays()` rather than literals when the test is about "today".
- **node:test files never fake the clock.** They use fixed day keys, with a comment naming the weekday (`// 2026-08-24 is a Monday`), and factory functions with a `patch` argument (`series({ done: true })`).
- **Time-zone tests are only meaningful in a zone with DST.** This machine (Asia/Singapore) and CI (UTC) have none, so a test written "whatever the zone" proves nothing here. When you add one, say so in a comment, and run it with `cadence-verify`'s `with-tz.mjs America/Los_Angeles -- npm test`.
- **The default timeout is 5 s and is never raised.** Files that mount the editor are slow (`notePlan` takes ~25 s alone); if one test times out only in the full run, that is the known load flake, not a reason to add a timeout.

## 3. How these tests are written

- **Open with a contract.** Each vitest file starts with a block comment that says what is worth pinning and what is deliberately not tested (`itemManager.test.jsx`, `apiHandlers.test.jsx`). A reader should learn the promises from the header.
- **Name tests as present-tense sentences** with no "should": `'drops junk days and de-duplicates'`. `describe` takes the function, component or behaviour.
- **Query by role and name**, as a user would: `screen.getByRole('dialog', { name: 'All items' })`. There is no `user-event`; drive with `fireEvent`. Reach for a class selector only for structure that has no accessible name.
- **Guard a fixed bug with a `// Regression:` comment** that says what broke, in the test that now fails if it returns (see `journalSurface.test.jsx`, `journalDrawing.test.jsx`). The past bug classes: local date vs UTC, stale closures, an async answer arriving after dismiss, touch drag arming, and nested forms.
- **Assert behaviour, not markup trivia.** For a dialog: its role and name, what Close and the backdrop do, what is announced; for a write: which `useSchedule` function was called with what.
- **Helpers that already exist** (use them, do not rewrite them):
  - `tests/helpers/prosemirrorDom.js`: `installProseMirrorDom()` (call in `beforeAll`) and `installPointerEvents()`.
  - `tests/fakeRedis.js`: `FakeRedis`, an Upstash stand-in with real `ZREM` counts and `MULTI` ordering; inspect with `queue()`, `score()`, `has()`, `keys()`.
  - `functions/test/fakeFirestore.js`: `FakeFirestore` and `seedUser`. It supports only `where(field, '==', value)`.
  - `tests/smoke/mockSchedule.jsx` `mockValue`: realistic tasks and events (overlaps, an all-day item, an early block, an overdue task).

## 4. Smoke render checks

`entry.jsx` renders every view with `renderToString`, so effects never run and `localStorage` does not exist. It proves a view renders, not that it behaves. To cover a new view or dialog: add `['Name', <View requiredProps />]` to `cases`, then add an `expect('what it exists to show', html.includes(...))` for the thing it must not silently drop. **Never assert on the date or the hour** (the file comments explain: it would pass today and fail tomorrow); build expectations from `mockValue`.

## 5. Done

A new or changed test is not finished until it has been run in its own layer and, for date logic, under `with-tz.mjs`. Then use `cadence-verify`.
