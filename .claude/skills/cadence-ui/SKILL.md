---
name: cadence-ui
description: Use when adding or changing Cadence's user interface structure — a new view or page, a dialog or editor, a Settings category or row, a keyboard shortcut or command-palette entry, new CSS, a design token or an icon. Gives the wiring recipes (every place a view, dialog or setting must be registered) and the hard design rules from DESIGN.md. Not for visual critique, polish or redesign (use impeccable), and not for data fields (cadence-data).
user-invocable: true
argument-hint: "[view | dialog | settings | shortcut | styling] [what you are adding]"
allowed-tools:
  - Bash(node .claude/skills/cadence-verify/scripts/*)
  - Bash(npx vitest run *)
---

The app shell is a single `src/App.jsx` with no router, so most UI changes are really *registration* changes: a view id, dialog or setting that is missing from one of several lists fails quietly in a place you did not edit. Each recipe below names every list. For how something should *look*, `DESIGN.md` is the source of truth (it is 100 KB; read the section for the component you touch, plus Do's and Don'ts at the end); for visual review use `/impeccable`.

## Pick the recipe

| You are adding | Read |
| --- | --- |
| A page in the sidebar, a Schedule tab, a landing-page option | [references/new-view.md](references/new-view.md) |
| A modal, an editor, a confirm | [references/dialogs-and-editors.md](references/dialogs-and-editors.md) |
| A Settings category or a row in one | [references/settings.md](references/settings.md) |
| A keyboard shortcut or a command-palette action | [references/shortcuts-palette.md](references/shortcuts-palette.md) |
| CSS, a token, an icon, a tag colour | [references/styling.md](references/styling.md) |

Adding a field to a task, event, tag or note, or a new write to Firestore, is `cadence-data`. A button that calls an AI route is `cadence-api`.

## Idioms every UI change follows

- **Plain components, named exports.** One `PascalCase.jsx` per component, a named export matching the file (only `App.jsx` has a default). No PropTypes, no TypeScript, no clsx.
- **Data from context hooks, not props.** `useSchedule()`, `useSettings()`, `useToast()`, `useAuth()`. Props are for callbacks (`onEdit`, `onCreate`, `onClose`, `onFocusDay`), a `focusKey` day string, and the `editor` object.
- **Modifier classes by template literal:** ``className={`filter-chip${on ? ' filter-chip--on' : ''}`}``. Names are BEM (`block__element--modifier`) in the one stylesheet for that area.
- **No Tailwind utilities in existing components.** Tailwind v4 is installed and `index.css` says utilities are available for new markup, but nothing uses them; follow the hand-written classes unless you are told otherwise.
- **Errors surface as a toast and a log:** `catch (caught) { console.error('Could not X.', caught); pushError('Could not X. Try again.') }`. Never swallow, never `alert()`.
- **A destructive action offers Undo** through `pushUndo`, which restores by clearing the soft-delete stamp (see the dialogs reference).
- **Phones change CSS, not the tree.** One DOM; breakpoints are `900px` and `640px`; the touch behaviour (hold to arm a drag) is deliberate. Do not branch on viewport in JS.
- **Labels over colour.** A tag colour never appears without its text label; selected state is the coral fill, coral text or a surface step, never any other hue.
- **Comments say why.** The codebase's comments record the alternative that was rejected and the bug that prompted the choice; match that, and do not narrate what the code plainly does.

## The design rules that are easy to break

From DESIGN.md "Do's and Don'ts" (the full list is there):

- **One accent: coral.** It marks action, selection and now, nothing else, and is always one of the six `--color-accent*` tokens: `accent` (a fill) with `on-accent` (black) on it, `accent-hover`, `accent-text` (coral as text; light needs this deeper step for 4.5:1), `accent-line` (a ring, border, stroke, 2px line or lone icon; 3:1 is enough, so it stays nearer coral), `accent-wash` (a passing tint, a drop target). Never white on coral, never coral on a meter, a surface at rest or a ring round a tag colour. Every other colour is a user's tag colour or a system status. No new hue, ever.
- **Tokens, never hex.** A tag colour is `style={{ '--tag': tag.color }}` and `var(--tag)` in CSS. Any new colour is a token declared in three places (see styling).
- **Two fonts only.** Inter for everything, Space Mono (`--font-mono`) for a *bare numeral* only (a count, a time, a duration), never mixed within one text run. `--font-pixel` is the Dashboard hero's alone.
- **Hover is a background step**, never a shadow, lift, scale or new border. **Shadows are for floating layers only** (modal, dropdown, popover).
- **Build pages from `.frame`, `.stack` and `.divided-row`.** No bordered cards; a hairline divider is the vocabulary. No coloured left/top border on anything except the time-grid block.
- **Icons are drawn** in `src/components/icons.jsx`, never a Unicode glyph or emoji (the Google mark on sign-in is the one exception).
- **Events are not tasks.** They have no checkbox and no tag stripe, are drawn as a bar, and never count in stats, planned hours or the load meter. `tasksOn(key)` stays task-only.
- **Drop targets name their MIME type** (`DRAG_TASK` or `DRAG_EVENT`); pointer events for in-place gestures, HTML5 drag only to move between containers; never nest a pointer control inside a `draggable`.
- **A Journal note's paper, ink and typeface belong to the sheet.** The toolbar and list around it stay neutral.
- **Test dark first**, then confirm light. Dark is what a new visitor sees.

## Done

Update the matching DESIGN.md component section (and PRODUCT.md if a capability changed, README if layout did) as part of the change, then run `cadence-verify`. A view or dialog needs a smoke case in `tests/smoke/entry.jsx` (see `cadence-tests`). A build proves CSS parses, not that it looks right: say whether you looked at it.
