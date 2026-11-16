---
name: cadence-review
description: Use to review a Cadence change against the project's own rules before committing or opening a PR, and to keep README, PRODUCT.md and DESIGN.md in step with the code. Sweeps the diff's added lines for known project-specific mistakes (day keys parsed as UTC, serverTimestamp, Firestore in components, api route order, hard-coded colours, wrong test runner), walks the rules checklist by area, names the docs the change owes an update to, and drafts a commit message in the repo's style. Not a general bug hunt (use /code-review), not a visual critique (use /impeccable).
user-invocable: true
argument-hint: "[base-branch] [--fix]"
allowed-tools:
  - Bash(node .claude/skills/cadence-review/scripts/*)
  - Bash(node .claude/skills/cadence-verify/scripts/*)
  - Bash(git diff *)
  - Bash(git status *)
  - Bash(git log *)
---

`/code-review` finds bugs in general; this skill checks a change against **this repository's** rules, which a general reviewer cannot know and which are the mistakes that have actually recurred here. It also owns the part of "done" that is easy to forget: the docs.

## Steps

1. **See the change.** `git status` and `git diff <base>...HEAD` (default base `main`) plus uncommitted and untracked files. Read the changed code itself; do not review from filenames.
2. **Sweep.** `node .claude/skills/cadence-review/scripts/sweep.mjs [--base <ref>]`. It scans only lines this change adds and prints each hit with `file:line`, in three levels (*must fix*, *check*, *note*). **A hit is a place to look, not a finding**: open the line in context and decide. Several rules are heuristics (a `#000` in a CSS mask is not a colour choice). A clean sweep means those patterns are absent, nothing more.
3. **Drift.** `node .claude/skills/cadence-verify/scripts/drift.mjs`. Anything in a file you touched is yours to fix; anything older, report.
4. **Walk the checklist** in [references/rules-checklist.md](references/rules-checklist.md) for every area the diff touched (dates and data, shared code, ui, api, tests). These are the judgment checks the sweep cannot make.
5. **Docs.** Use [references/docs-map.md](references/docs-map.md) to name which doc and which section the change owes an update, then make the edit (or list it for the person to approve). A change that alters behaviour and updates no doc is incomplete.
6. **Report** findings grouped by severity, each as `path:line — what is wrong — what to do`, quoting nothing that is not in the diff. Say which of the above steps you ran. If you found nothing, say so plainly and name what you checked; do not pad.
7. **With `--fix`:** apply the fixes that are unambiguous and mechanical (a `new Date(key)` → `fromKey(key)`, a missing `apiTests` entry, a stale path in a README section you edited, a missing smoke-mock export), list exactly what you changed, and leave judgment items as findings. Re-run the sweep afterwards. Never "fix" a finding by editing the rule or the exception list.
8. **Draft the commit message** (below), but do not commit unless asked.

## Commit and PR conventions

From the history of this repo:

- **Work on a feature branch and open a PR to `main`** (merged with a merge commit); do not commit to `main` directly.
- **Subject: a conventional prefix and what changed**, imperative, under about 70 characters: `feat: add day-note shortcut`, `fix: keep clock time across DST`, `refactor: split FocusMode styles`, `test:`, `docs:`, `chore:`. A scope is fine (`feat(auth): …`).
- **Body: a `- ` bullet for everything the commit contains**, including the tests and docs. Subjects in this repo have understated scope before (a commit titled "Add tests for…" also shipped a feature across 47 files); if the diff does more than the subject says, the subject is wrong.
- **Never paste a chat reply as a commit message** ("Fixed. The bug: …", "Straight answer: …"); several old commits are like that and are the anti-example.
- Add attribution lines only as the session's instructions say; do not invent them.
- A change that touches UI, data shape, scripts or security names the doc it updated in the body.

## What this skill does not do

It does not run the test suite (`cadence-verify`), judge whether a screen looks right (`impeccable`), or look for logic bugs and security flaws in general (`/code-review`, `/security-review`). Run those for a change that warrants them; say which you did not run.
