# Cadence

A personal time-blocking planner: React 19 + Vite on Firebase Firestore, with Vercel serverless routes (`api/`), Firebase Cloud Functions (`functions/`), shared pure logic (`packages/shared`), and an Expo shell (`apps/mobile`). One person, one private data tree per account. Read `README.md` (setup, decisions, security), `PRODUCT.md` (what it is and is not), and `DESIGN.md` (the design system) before changing behaviour; they are accurate except where a skill below says they lag.

## Where things live

- `src/` is the web app. `state/` holds the contexts (`ScheduleContext` is the one Firestore seam), `components/<area>/` the UI, `styles/` one CSS file per area, `lib/` hooks and browser adapters (not date or business logic).
- `packages/shared/src/` is **pure logic** (dates, recurrence, normalizers, stats, parsing) used by the web app, `api/`, `functions/` and mobile. Import it by subpath: `@cadence/shared/date.js`, never the barrel. No `window`, `document`, storage or Firebase in it.
- `functions/` gets a *copy* of four shared files (`date`, `recurrence`, `normalize`, `stats`) made by `scripts/syncSharedLib.mjs`; Firebase uploads only `functions/`. A new shared import there must be added to that list.
- `api/_lib/` is the route toolkit; `api/*.js` are routes. `tests/` holds all web tests; `functions/test/` the functions' own.
- `.claude/skills/impeccable/` is a third-party design skill that is gitignored and local; the `cadence-*` skills next to it are ours and are committed.

## Commands

The path contains a space: quote it. Shell is PowerShell or Git Bash on Windows.

| Command | What it covers |
| --- | --- |
| `npm run lint` | oxlint; 0 errors required (a few old warnings exist) |
| `npm test` | pure-logic tests, `node --test` on `tests/**/*.test.js` |
| `npx vitest run tests/itemManager.test.jsx` | one component test (iterate with this); `npm run test:dom` runs all (~70 s) |
| `npx vitest run --project node` | the api handler tests only |
| `npm run test:functions` | Cloud Functions logic |
| `npm run test:render` | SSR smoke render of every view against mocks |
| `npm run test:rules` | Firestore rules in the emulator; needs JDK 21+ (CI runs it) |
| `npm run build` | production bundle |

CI runs all of these. To know which a change needs, use `/cadence-verify`.

## Data invariants

- A day is the string `'YYYY-MM-DD'`; a time is an integer minute from local midnight. Never `new Date('YYYY-MM-DD')` (that is UTC) and never pass a `Date` across a boundary. Use the helpers in `packages/shared/src/date.js`.
- Timestamps are `Date.now()` milliseconds, never `serverTimestamp()`.
- Firestore documents are untrusted: every read goes through a `normalize*` function, and a new field needs its clause there first.
- Deletes are soft (`deletedAt`, with Undo). A repeating item is one document expanded on read; editing one day *detaches* it, and override paths use `FieldPath('overrides', key)`.
- Events are not tasks: no `done`, and they never count in stats, planned hours or the load meter.

## UI rules (the full set is in DESIGN.md)

- One accent: coral, only through the `--color-accent*` tokens, and only for action, selection and now (never data, a meter, a frame, or a ring round another colour). On a coral fill the label is `--color-on-accent` (black); coral as text uses `--color-accent-text`, as a line or ring `--color-accent-line`. Any other colour is a user's tag colour (a *slot name*, via `--tag`) or a system status. New colours are tokens declared in three places in `tokens.css`.
- Inter for words, Space Mono only for a bare numeral. Icons are drawn in `icons.jsx`, never emoji. Hover is a background step; shadow only on floating layers.
- Every modal uses `useModalA11y` and is added to `modalOpen` in `App.jsx`. A tag colour always comes with its text label.
- Components take data from context hooks; plain BEM classes in the area's stylesheet (Tailwind is installed but not used in existing components).
- Failures: `console.error('Could not X.', caught)` plus `pushError(...)`. Destructive actions offer `pushUndo`.

## API rules

Every route is `route(name, methods, handler)` and follows this order: `verifyRequest` (verified email), parse body, read through `aiInput.js` caps, `enforceAiLimits`, `generateJson`, then a private `sanitize` that rebuilds the answer. A caught error's text is logged, never returned. Server env vars are never `VITE_`-prefixed. The client calls only through `callApi` (never throws, returns `null`) and always has a non-AI fallback.

## Tests

- `*.test.js` is `node:test` (pure, no JSX); `*.test.jsx` is vitest. An api handler test is `.jsx` and **must be listed in `apiTests`** in `vitest.config.js`.
- A new `useSchedule()` member or context export must also go in `tests/smoke/mockSchedule.jsx` (and the other smoke mocks), or `test:render` breaks.
- This machine and CI are both in zones without DST, so date code needs the extra pass in `/cadence-verify` (`with-tz.mjs`). `test:rules` cannot run here (Java 8); say so rather than reporting it as passing.
- Report only what you ran. A flaky timeout that passes alone is reported as a flake, not as a pass.

## Docs are part of the change

UI change: the matching DESIGN.md section. New capability: PRODUCT.md. Data shape, scripts or security: README. The map is in the `cadence-review` skill. Some docs lag the code (the README Layout tree, the "no interval, no end date" recurrence claim); fix the sentence you are standing next to.

## Git

Work on a feature branch and open a PR to `main`. Commit subjects are conventional (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`) and say what changed; the body bullets list everything in the commit. Never paste a chat reply as a message. Do not commit `.env*` (only `.env.example`).

## Skills

| Skill | Use it when |
| --- | --- |
| `/cadence-verify` | before calling anything done: picks, runs and honestly reports the checks the diff needs |
| `/cadence-tests` | writing or fixing a test, in any of the five layers |
| `/cadence-ui` | adding a view, dialog, settings row, shortcut, palette action, CSS, token or icon |
| `/cadence-data` | a field, a write, a repeat rule, anything with days, minutes or time zones |
| `/cadence-api` | an `api/` route, a rate limit, an AI call or its client |
| `/cadence-review` | before commit or PR: project-rule review, docs owed, commit message |
| `/impeccable` | visual design critique and polish (third-party, local) |

`/code-review` and `/security-review` are the general-purpose reviews; run them for risky changes.
