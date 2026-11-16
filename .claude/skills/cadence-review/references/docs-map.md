# Which doc a change owes

This repo's documentation is part of the change, not a follow-up: in the history, UI redesigns land with a rewritten DESIGN.md component section, and new capabilities with README/PRODUCT edits. (`DESIGN.md` is touched by about a quarter of commits, `README.md` and `PRODUCT.md` by a tenth.) Decide from the table, make the edit in the same commit, and name the doc in the commit body.

| The change | Update |
| --- | --- |
| A visual or interaction change to a component, a new component, a new token, a changed rule | **DESIGN.md**: the matching component section (headings below); `Colors` / `Typography` / `Shapes` for tokens; add a Do or Don't if you established or broke a rule |
| A new or changed capability a person can use (a view, a setting, a shortcut, an AI action, an export) | **PRODUCT.md** "Capabilities and Constraints" (and "Product Purpose"/"Principles" if the product's stance changed); the view list in README's intro |
| A new view, file or folder, or a moved module | **README.md** "Layout" tree |
| A data field, collection or document shape; a changed storage decision | **README.md** "How the data is shaped" and "Notable decisions" |
| A new npm script, test layer, or changed command | **README.md** "Scripts" (and `CLAUDE.md`'s command list) |
| Anything on auth, rate limits, what reaches Gemini, headers, console settings | **README.md** "Security"; `src/lib/aiDisclosure.js` if data leaving the device changed |
| The Journal's behaviour | **README.md** "The Journal"; PRODUCT.md's Journal bullet; DESIGN.md "Journal (notes)" |
| A keyboard shortcut | **README.md** "Keyboard" table; PRODUCT.md's shortcuts bullet |
| Push notifications | **README-push.md** (How it works, Limits, What lives in Redis) |
| The daily digest or a Cloud Function | **README-functions.md** |
| A new environment variable | **`.env.example`** (with a comment, server vs `VITE_`), README deploy steps if required |
| A deliberate non-goal or a deferred feature | PRODUCT.md "Deliberately not built…" and README "Not built yet" |
| A new convention a future change must follow | `CLAUDE.md`, and the matching `cadence-*` skill |

## DESIGN.md component headings

Overview · Colors · Typography · Layout · Elevation & Depth · Shapes · Components: Buttons, Chips, Cards & Frames, Inputs / Fields, Navigation, Icons, Load Indicator, Background Pattern, Item Index, Auth Shell, Repeat Picker, Event Bar, A single-day timed event, Mini Calendar, Day Peek, The Journal link, Grid Gestures, Free Slots, Day/Week/Month, Schedule on a phone, Time-Grid Block, Settings page, Journal (notes), Focus (the timer), Ask AI (the chat) · Do's and Don'ts.

## How to write it

- **Match the existing voice:** prose that records *why* and what was rejected, not a changelog. DESIGN.md is explicit about the rule and the reason ("Don't … because …").
- **Replace, do not append.** A section that describes the old behaviour is deleted or rewritten; the docs describe the current system.
- **State limits and non-goals** next to the feature (the Journal's 950 KB cap, "only a single-day event may repeat").
- **Name files by path** so the next reader (and `drift.mjs`) can check them, and by symbol rather than line number.
- **Do not claim what was not run.** README-functions.md and README-push.md say plainly what was never exercised against real services; keep that honesty.

## Stale spots to fix when you are already in the section

`drift.mjs` lists missing paths. Known others:

- README "Layout" lists `date.js`, `layout.js`, `normalize.js`, `recurrence.js`, `stats.js` and `useTheme.js` under `src/lib/`, but they now live in `packages/shared/src/` (or `ThemeContext`); it also omits `SettingsContext`, `ThemeContext`, `api/`, `functions/`, `apps/mobile`. README "Notable decisions" and DESIGN.md (the lane-packer note) still give a `src/lib/` path for `normalize` and `spans`.
- README "How the data is shaped" omits events, templates, focus sessions and several task fields (`priority`, `pinned`, `blockedBy`, `subtasks`, `deletedAt`).
- README, PRODUCT.md, DESIGN.md and the `recurrence.js` header say a repeat rule has "no interval, no end date"; the code has an `interval` shape and an optional `until`.
- README "Security" lists the api order as auth, rate limit, input caps; the code validates and caps input **before** spending the rate limit.
- README "Scripts" calls `test:render` "all eleven views"; it renders many more cases than that. And `vitest.config.js`'s header still calls the DOM layer "narrow".

Fix the sentence you are standing next to; do not turn a feature change into a documentation rewrite. If a stale spot is large, list it for the person instead.
