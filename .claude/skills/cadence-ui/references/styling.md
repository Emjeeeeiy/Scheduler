# Styling: CSS, tokens, icons, tag colours

DESIGN.md is the source of truth for how things look. This is the mechanics: where a rule goes and which existing piece to reuse.

## Where CSS goes

`src/styles/` has one file per area, loaded by `src/App.jsx` in a fixed order (`shell`, `auth`, `dashboard`, `focus`, `calendar`, `modals`, `toggles-responsive`, `calendar-dnd`, `review`) after `index.css`, which imports Tailwind and `tokens.css`. **That order is the cascade; do not sort it.** `journal.css` and `settings.css` are imported by their lazy views so they ship in the view's chunk, not the main bundle.

| Putting | In |
| --- | --- |
| Shell, buttons, `.frame`/`.stack`/`.divided-row`, toasts, skeleton bars | `shell.css` |
| A dialog, its fields, tags, item index, repeat picker | `modals.css` |
| Day/Week/Month grids, inbox, task rows | `calendar.css` (drag and resize in `calendar-dnd.css`) |
| Filter chips and toggles, **and every ≤900px override of the shared pieces** | `toggles-responsive.css` |
| A single view | that view's file (`dashboard.css`, `focus.css`, `review.css`, `journal.css`, `settings.css`, `auth.css`) |

A view's own ≤900px rules sit in its own file (there are several), so search the area file before adding a media query elsewhere.

## Naming and structure

- **BEM:** `.block__element--modifier`, one block per component (`.settings-row__control`, `.sidebar__link--active`). Toggle a modifier with a template literal in JSX.
- **No utilities, no inline styles.** The only inline `style` is a CSS variable (`style={{ '--tag': tag.color }}`); layout and colour never go inline.
- **Reuse before inventing.** Existing pieces: `.frame` (a page section; hairline dividers, no border), `.stack` (vertical rhythm inside a frame), `.divided-row` (things side by side), `.section-head` (`__title`, `__sub`), `.empty`, `.banner`, `.field` / `.field__label` / `.field__hint` / `.input`, `.filter-row` + `.filter-chip` (`--on`), buttons (`.primary-button`, `.ghost-button`, `.ghost-button--sm`, `.danger-button`, `.icon-button`, `.button--icon-label`), `.modal` / `.modal__panel`, `.skel`, `.visually-hidden`.
- **A "pick one or more" control reuses the toggle-chip idiom** (neutral pill at rest, Ink fill when selected). Do not invent a new selected treatment.
- **Spacing is raw px.** `--spacing-*` tokens exist but are unused (hundreds of raw values are the real convention); follow the neighbouring file.

## Tokens (`src/styles/tokens.css`)

- **Colour:** `--color-page`, `--color-surface-1/2`, `--color-surface-sunken`, `--color-text-primary/secondary/muted`, `--color-border`, `--color-gridline`, `--color-baseline`, `--color-focus`, `--color-now-line`, `--color-glow-neutral`, and status colours (good, warning, serious, critical, each with a `-text` variant) which always appear with an icon and a label.
- **Tag colours:** `--color-tag-{blue, orange, aqua, yellow, magenta, green, violet, red, cyan, lime, purple, slate}`. A tag stores the **slot name**, never a hex. In a component, `style={{ '--tag': tag.color }}` where `tag.color` is the string `var(--color-tag-<slot>)` produced by `normalizeTag`, then `var(--tag)` in CSS.
  - The first eight are the validated colour-blind-safe order; the order *is* the safety mechanism, so a new tag takes the next unused slot. The last four are picked for separation, not validated.
  - Three light-mode slots are under 3:1 contrast, so a tag colour is always shown with its text label.
- **Radii:** `--radius-sm/md/lg` = 4 / 7 / 10 px. DESIGN.md also allows literal 3px (chips), 2px (tiny marks) and 999px (pills); the auth hero's 32/24px is a named exception. Nothing else.
- **Fonts:** `--font-sans` (Inter) for everything; `--font-mono` (Space Mono) **only for a bare numeral** (a count, a time, a duration, a figure) and never mixed in one text run; `--font-pixel` is the Dashboard hero ticker's alone, sized in multiples of 8px. No third face. (The Journal's sheet may use the writer's chosen faces; the chrome never does.)
- **Type scale and weights:** `--text-hero` … `--text-nano`; `--font-weight-figure/title/item/label/meta/body/nano`. A name uses `--font-weight-item` in primary ink; its detail uses `--font-weight-body` in muted ink.

### Adding or changing a colour token (the "No-Auto-Flip Rule")

Dark mode is hand-chosen, never computed. A colour that differs in dark is declared **three times** in `tokens.css`:

1. the light value, in `@theme static { … }`;
2. the dark value in `@media (prefers-color-scheme: dark) { :root:where(:not([data-theme="light"])) { … } }` (the OS default);
3. the same dark value in `:root[data-theme="dark"] { … }` (the in-app toggle, which must always win).

No colour's only definition may live inside a media query. Check new work **dark first** (it is what a new visitor sees), then light. Do not add a hex in a component stylesheet; the few existing literals (print styles in `journal.css`, an email template in `functions/lib/digest.js`) are exceptions, not precedent.

Journal paper/ink colours are content, not tokens: a new paper pattern or preset goes in `src/lib/journalPaper.js`, never in `tokens.css`.

## Icons

- **One set, one grammar:** `src/components/icons.jsx`, 24×24 viewBox, 2px `currentColor` stroke, round caps and joins, `aria-hidden`. The shared `Icon` base is exported (Journal icons in `journalIcons.jsx` build on it so they ship in the lazy chunk).
- **A new icon:**
  ```jsx
  export function FooIcon(props) {
    return (
      <Icon {...props}>
        <path d="…" />
      </Icon>
    )
  }
  ```
  Names end in `Icon`. Size comes from the call site (a class such as `button-icon`, or `width`/`height`), never from the component. An icon-only button is `className="icon-button" aria-label="…"`. Pass an icon as a component reference (`Icon: DashboardIcon`), not an element.
- **Never a Unicode glyph or emoji** as an icon. (The Google mark on the sign-in button is the one real third-party brand exception.)
- **A new tag icon touches four places:** the icon in `icons.jsx`; `TAG_ICON_COMPONENTS` in `src/components/editors/TagGlyph.jsx`; `TAG_ICONS` in `packages/shared/src/normalize.js` (the list a stored `icon` is validated against); and the hand-kept copy of `TAG_ICONS` in `tests/smoke/mockSchedule.jsx`. Miss the last one and `test:render` quietly diverges.

## Responsive

Breakpoints are `900px` (phone/tablet layout) and `640px`; desktop-only rules use `min-width: 901px`. Change CSS on one DOM tree; do not branch in JS (the one JS use of the breakpoint string is `SettingsView`'s two-screen mode). On a phone the Week tab is a seven-day overview and Month a map of dots, by design. Touch targets for block editing are *armed by holding*, never by a tap or scroll (see DESIGN.md "Grid Gestures").

## Check

`npm run build` proves the CSS parses, nothing more. The Impeccable hooks in `.claude/settings.local.json` (if present on this machine) run a design detector after edits; if one flags a deliberate exception, the existing allowances are in `.impeccable/config.json`. For a visual review use `/impeccable`; do not claim a style change looks right without looking at it, dark theme first.
