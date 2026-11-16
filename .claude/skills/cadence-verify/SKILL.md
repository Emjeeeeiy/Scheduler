---
name: cadence-verify
description: Use before calling any change to Cadence done, before committing or opening a PR, or when asked to verify, test, check or validate work. Works out which of the repo's checks (lint, node tests, vitest, api, functions, SSR render, build, Firestore rules, timezone/DST pass, doc drift) the current diff needs, runs them cheapest first, and reports exactly what passed, failed, flaked or could not run. Not for writing tests (cadence-tests) or reviewing code against project rules (cadence-review).
user-invocable: true
argument-hint: "[base-branch]"
allowed-tools:
  - Bash(node .claude/skills/cadence-verify/scripts/*)
  - Bash(npm run *)
  - Bash(npm test)
  - Bash(npx vitest run *)
  - Bash(npx oxlint *)
  - Bash(git diff *)
  - Bash(git status *)
---

Cadence has seven checks and each covers something the others do not, so "tests pass" means nothing until you know *which* tests. This skill picks the checks the diff needs, runs them, and reports honestly. Run it from the repo root (the path contains a space; quote it).

## Steps

1. **Plan.** `node .claude/skills/cadence-verify/scripts/plan-checks.mjs` (add `--base <branch>` if the base is not `main`). It lists the checks this diff needs, cheapest first, each with its reason. Anything under "Not needed" is skipped on purpose; anything under "Not classified" you decide by hand. Do not add checks it did not list, and do not drop ones it did.
2. **Run them in the order given**, stopping to fix a failure before running the slower ones. While iterating, use the `dom-targeted` command; run the full `test:dom` once at the end.
3. **Lint.** `npm run lint` must have 0 errors. The baseline is 16 warnings, all in files you did not write; also run `npx oxlint <files you changed>` and fix any warning in a file you touched.
4. **Timezone pass.** If the plan includes `dst`, run it. Do not substitute `TZ=America/Los_Angeles npm test`: in Git Bash that is silently ignored for any zone but UTC, so it passes in the wrong zone. `with-tz.mjs` sets the zone for the child and prints what the child actually sees; if it does not say `DST yes`, the pass proves nothing. Then run the relevant vitest files the same way, e.g. `node .claude/skills/cadence-verify/scripts/with-tz.mjs America/Los_Angeles -- npx vitest run tests/reminderSync.test.jsx`. This machine is Asia/Singapore and CI is UTC, neither has DST, so this is the only place a DST bug can surface.
5. **Drift.** `drift.mjs` is in the plan every time. Fix findings in files you touched (a stale path in a README section you edited, a smoke mock missing an export, a new api test not in `apiTests`). Findings that predate your change: report them, do not fix them unasked.
6. **Report** (below).

## Known behaviours

- **One vitest timeout in a full `test:dom`** (typically the first test of `notePlan.test.jsx`) is a known load flake on Windows: rerun that file alone. If it passes alone, report "flaked under load, passed alone" and say it happened. If it fails alone, or two files fail, it is a real failure.
- **`test:rules` needs JDK 21+.** The plan marks it `[CANNOT RUN HERE]` when the JDK is missing or older (this machine has Java 8). Say it was not run and that CI's `rules` job is the gate. Never describe it as passing.
- **`test:render` fails to build** when a component imports a name the smoke mock lacks. The fix is in `tests/smoke/mockSchedule.jsx` (or `mockAuth.jsx` / `mockJournal.js`), not in the component. `drift.mjs` names the missing export.
- **A new test file** that imports from `api/` must be added to `apiTests` in `vitest.config.js` (drift catches it); otherwise it runs under jsdom and fails with `ReadableStream is not defined`.
- **Visual changes** (anything in `src/styles/` or JSX markup): a build only proves the CSS parses. Say that the look was not checked unless you checked it in a browser, dark theme first.
- Timings seen here: lint 3 s, `npm test` 14 s, `test:dom` ~70 s, a single editor test file ~25 s.

## Report format

End with a table, then one line of verdict. Include every planned check, including skipped ones.

| Check | Result | Time |
| --- | --- | --- |
| `npm run lint` | pass, 0 errors, 16 warnings (baseline) | 3 s |
| `npm test` | pass, 500/500 | 14 s |
| `test:dom` | pass, 1084/1084 (1 flake, passed alone) | 70 s |
| `test:rules` | **not run**: JDK 8, needs 21+; CI covers it | — |

State only what you ran and saw. "Should pass" and "unchanged code" are not results. A check that failed stays in the table as a failure even after you fixed it and reran, with both outcomes.

When the checks are done, the docs step is in `cadence-review` (`references/docs-map.md`): UI → DESIGN.md, capability → PRODUCT.md, data/scripts/security → README.
