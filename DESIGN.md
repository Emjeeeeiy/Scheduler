---
name: Cadence
description: A quiet, restrained personal time-blocking planner — one accent color, flat neutral surfaces, no decoration
colors:
  signal-violet: "#7c3aed"
  signal-violet-soft: "#e5d9fb"
  paper: "#f9f9f7"
  panel: "#fcfcfb"
  hover-surface: "#f2f1ed"
  sunken-surface: "#edece7"
  ink: "#0b0b0b"
  soft-ink: "#52514e"
  faint-ink: "#898781"
  hairline: "rgba(11, 11, 11, 0.10)"
  gridline: "#e1e0d9"
  good: "#0ca30c"
  good-text: "#006300"
  warning: "#fab219"
  serious: "#ec835a"
  critical: "#d03b3b"
  critical-text: "#b02b2b"
  tag-blue: "#2a78d6"
  tag-orange: "#eb6834"
  tag-aqua: "#1baf7a"
  tag-yellow: "#eda100"
  tag-magenta: "#e87ba4"
  tag-green: "#008300"
  tag-violet: "#4a3aa7"
  tag-red: "#e34948"
  auth-glow: "rgba(233, 213, 255, 0.9)"
  auth-violet: "#7c3aed"
  auth-violet-deep: "#4c1d95"
  auth-void: "#1a0b2e"
  auth-black: "#000000"
  auth-panel-bg: "#050505"
  auth-input-bg: "#17171a"
  auth-button-ink: "#1f1f1f"
  auth-link: "#a78bfa"
  auth-critical-bg: "rgba(224, 82, 82, 0.16)"
  auth-critical-text: "#ff9d9d"
  glow-violet: "rgba(124, 58, 237, 0.06)"
  dot-color: "rgba(124, 58, 237, 0.14)"
typography:
  auth-headline:
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "32px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  display:
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "52px"
    fontWeight: 650
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  display-sm:
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "42px"
    fontWeight: 650
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  stat:
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "28px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  unit:
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
  mark:
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
  subtitle:
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "normal"
  title:
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  icon:
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
  body:
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  ui:
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  meta:
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 450
    lineHeight: 1.3
    letterSpacing: "normal"
  caption:
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 450
    lineHeight: 1.3
    letterSpacing: "normal"
  label:
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.04em"
  micro:
    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "normal"
  mono:
    fontFamily: "ui-monospace, 'Cascadia Code', 'Segoe UI Mono', monospace"
    fontSize: "0.9em"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
rounded:
  micro: "2px"
  tight: "3px"
  sm: "4px"
  md: "7px"
  lg: "10px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.signal-violet}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "7px 14px"
  button-primary-hover:
    backgroundColor: "{colors.signal-violet}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.soft-ink}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  button-ghost-hover:
    backgroundColor: "{colors.hover-surface}"
    textColor: "{colors.ink}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.critical-text}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
  card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.lg}"
    padding: "18px"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "7px 10px"
  chip-toggle:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.soft-ink}"
    rounded: "{rounded.pill}"
    padding: "5px 14px"
  chip-toggle-on:
    backgroundColor: "{colors.signal-violet}"
    textColor: "#ffffff"
  google-button:
    backgroundColor: "#ffffff"
    textColor: "{colors.auth-button-ink}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  auth-input:
    backgroundColor: "{colors.auth-input-bg}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "7px 10px"
---

# Design System: Cadence

## Overview

**Creative North Star: "The Quiet Instrument"**

Cadence is a precise, unshowy tool that does one job well: turn a list of tasks into real blocks of a real day, and show you afterward what actually happened. Nothing in the interface performs for attention — there is one accent color, used sparingly, and everything else is neutral. Restraint is the point, not a placeholder for a bolder pass that never came.

The system is quiet, precise, and unshowy by deliberate choice. Its confirmed anti-reference is the gamified productivity app: no streaks, no confetti, no badges, no cheerful mascot nudging you back in. The interface stays out of the way of the work it's tracking — feedback is a background-color step, not a celebration.

**Key Characteristics:**
- Dark is the identity now, not an alternate: a first-time visitor lands on dark, deepened toward the Auth Shell's true black; light stays one toggle away, unremoved
- One accent (Signal Violet), everything else neutral — a Restrained color strategy, not a themed one
- Flat by default: depth comes from stacked neutral surfaces and hairline borders first, a tuned shadow second — see Elevation & Depth
- Inter throughout, at every scale including the largest number on screen — chosen for its tabular figures in a stat- and chart-heavy product, not as a display statement
- A validated, colorblind-safe 8-color palette for user data (tags), kept strictly separate from the one UI accent
- A single reusable "selected" idiom (neutral pill → filled Signal Violet pill) used everywhere something toggles
- One drawn icon grammar, not a scatter of Unicode characters — every icon in the app shares a stroke style and lives in one file
- A quiet dot-grid in the app shell's negative space, and a low-key violet glow on the Dashboard hero — both direct, deliberately restrained echoes of the Auth Shell's motif, not a new decoration invented from scratch
- One deliberate exception: the Auth Shell (sign-in/sign-up) is a fixed dark surface with its own literal colors, not the themed token system — see Components

## Colors

The palette is almost entirely neutral. Signal Violet is the one color that means "this is interactive, active, or now" — everywhere else, color belongs to the user's own tags or to a status. (The Auth Shell's own violet gradient is a separate, fixed exception — see Components.)

### Primary
- **Signal Violet** (`#7c3aed` light / `#8b5cf6` dark): The only accent in the themed system. Marks the one thing that matters on a screen — primary buttons, the active sidebar link, today's date, the drag/drop-target highlight, the focus ring, and the "done" series in every chart. It appears on well under 10% of any given screen. Chosen over the system's original blue for both light- and dark-mode contrast: 5.70:1 / 4.23:1 against white button text, versus the previous blue's 4.42:1 / 3.64:1.
- **Signal Violet Soft** (`#e5d9fb` light / `#3b2172` dark): The planned-but-not-done half of a chart bar, and the today-drop tint. A pale (light) or deep (dark) wash of the same hue, never a second color.

### Neutral
- **Paper** (`#f9f9f7` light / `#050505` dark): The page background — the surface everything else sits on top of. The dark value was deepened toward the Auth Shell's own `#050505` (it was a softer `#0d0d0d` before the Auth Shell existed); every surface below it moved down by the same step so the whole scale reads as one deliberate move, not a color picked in isolation.
- **Panel** (`#fcfcfb` light / `#131313` dark): Card and control surface, one step lighter than Paper so a card reads as "raised" through color alone. The light-vs-dark step size is intentionally the same ratio in both themes (contrast-verified, not eyeballed) even though the dark value moved.
- **Hover Surface** (`#f2f1ed` light / `#1e1e1e` dark): The one hover/active feedback color for buttons, list rows, and nav links. Every interactive rest-state uses Panel; every interactive hover-state uses Hover Surface. That swap is the entire feedback vocabulary.
- **Sunken Surface** (`#edece7` light / `#0a0a0a` dark): Recessed content — inline `code`, the count pill, a progress track, an out-of-month calendar cell.
- **Ink** (`#0b0b0b` light / `#ffffff` dark): Primary text.
- **Soft Ink** (`#52514e` light / `#c3c2b7` dark): Secondary text — labels, metadata, supporting copy.
- **Faint Ink** (`#898781`): Muted text — hints, placeholders, timestamps, empty-state copy. Same value in both themes; it was already contrast-safe against the deepened dark surfaces without adjustment.
- **Hairline** (`rgba(11, 11, 11, 0.10)` light / `rgba(255, 255, 255, 0.10)` dark): The only border color in the system, at one low alpha. Structure comes from this line plus a surface-color step, never from a heavier stroke.
- **Gridline** (`#e1e0d9` light / `#232323` dark): A second, slightly firmer hairline reserved for the time grid and month grid — dense repeating structure that needs to read at a glance without competing with content borders.
- **Glow Violet** (`rgba(124, 58, 237, 0.06)` light / `rgba(139, 92, 246, 0.16)` dark) and **Dot Color** (`rgba(124, 58, 237, 0.14)` light / `rgba(139, 92, 246, 0.22)` dark): the two decorative tokens behind the Dashboard hero's glow and the app shell's background dot-grid — see Components.

### Tertiary
The categorical and status colors — data the user assigns or the app reports, never chrome.

- **The eight tag colors** (`tag-blue` `#2a78d6`, `tag-orange` `#eb6834`, `tag-aqua` `#1baf7a`, `tag-yellow` `#eda100`, `tag-magenta` `#e87ba4`, `tag-green` `#008300`, `tag-violet` `#4a3aa7`, `tag-red` `#e34948`): A validated, colorblind-safe categorical palette (worst adjacent ΔE 9.1 light / 8.4 dark), deliberately untouched by the Signal Violet rename — recoloring it would invalidate the CVD ordering. Handed out to new tags in this fixed order, never chosen freely — the order is the safety mechanism. Stored as a slot name, never a hex, so light and dark themes each get their own correctly-stepped value. Note `tag-blue` and `tag-violet` no longer coincide with the UI accent the way `tag-blue` once did — that was a coincidence of the old palette, not a rule.
- **Good** (`#0ca30c`) / **Warning** (`#fab219`) / **Serious** (`#ec835a`) / **Critical** (`#d03b3b`): System-reported state, not user choice. Always shipped with an icon or label — never the only signal.

### Named Rules
**The One Accent Rule.** Signal Violet is the only saturated color used for UI meaning in the themed system. A new interactive state does not get a new color; it gets a Signal Violet treatment or a neutral one. The Auth Shell's fixed violet-to-black gradient is the one named exception, confirmed as a permanent, always-dark surface rather than a themed color — see Components.

**The Label-Not-Just-Color Rule.** A tag color is never the only signal. Three tag slots fall under 3:1 contrast on the light surface, so anything wearing a tag color also carries a visible text label.

**The No-Auto-Flip Rule.** Dark mode is a hand-chosen set of values, not a computed inversion. Every dark-mode color is declared twice — once under `@media (prefers-color-scheme: dark)` for the OS setting, once under `[data-theme="dark"]` for the in-app toggle — so the explicit choice always wins over the system default. No color's only definition ever lives inside a media query.

## Typography

**Body Font:** Inter, with the system stack (`system-ui, -apple-system, "Segoe UI", sans-serif`) as fallback
**Display Font:** the same face, distinguished only by size, weight, and tracking
**Monospace:** `ui-monospace, "Cascadia Code", "Segoe UI Mono", monospace` — inline `code` only (the setup screen's env-var and rule-file references). Not a general voice; nothing else in the app uses it.

**Character:** One typeface for the whole product, including the largest number on screen. Voice comes from scale and weight, never from switching families — the system deliberately refuses a "display font moment." Inter replaced the pure system-font stack this app started with; it was chosen for its tabular figures and small-size legibility in a product whose UI is mostly numerals — stat tiles, chart axes, the time grid's hour labels, the load bars' hour counts — not for a bespoke display identity. The system stack remains the fallback chain, not a discarded choice.

### Hierarchy

The scale is dense rather than a handful of marketing-style jumps — sixteen steps, each earned by one specific, named use, from a 10px numeral to a 52px hero. Nothing here is decorative; every step is a real component doing real work at that size.

- **Display** (650, 52px, 1.05 line-height, −0.03em tracking): The Dashboard's hero number (hours planned today) — the one place the type gets loud.
- **Display Sm** (650, 42px): The same hero number, stepped down at the 640px breakpoint.
- **Auth Headline** (650, 32px, −0.02em tracking): The Auth Shell's own hero line ("Plan your day in blocks.") — larger than the themed system's Headline step because it lives in Persuade mode, not Operate.
- **Stat** (650, 28px, −0.02em tracking): A stat tile's headline figure (Open today, Overdue, Done this week).
- **Headline** (650, 22px, −0.02em tracking): Screen-level titles on the setup screen and the Auth Shell's form panel.
- **Unit** (500, 24px): The "h" unit beside the hero number.
- **Mark** (400, 20px): The sidebar brand glyph.
- **Subtitle** (600, 18px): The week grid's day-of-month number.
- **Title** (600, 17px): Dialog/modal headings, the sidebar brand name, and the mobile nav's icon size.
- **Icon** (400, 16px): Icon-button glyphs and the large primary-button variant.
- **Body** (400, 15px, 1.5 line-height): Base paragraph and UI text — the document root size.
- **UI** (500, 14px): Compact interactive text — nav links, task-row and chip titles.
- **Meta** (450, 13px): The most common secondary size — field labels, hints, small ghost/danger buttons.
- **Caption** (450, 12px): Smaller supporting text — chart legends, notification meta, empty-state hints.
- **Label** (500, 11px, 0.04em tracking, uppercase): Day-of-week headers, the "All day" marker, chart ticks, block/chip time — small structural labels, always uppercase and tracked when they are.
- **Micro** (700, 10px): The smallest text in the system, reserved for a single numeral in a fixed-size badge or a tight inline readout (the notification count, a drag-hover time tooltip, a month cell's planned-time figure).

Numerals are set proportional everywhere except a genuine column of numbers (the data table, chart axis, tag-bar values), where `font-variant-numeric: tabular-nums` keeps digits aligned.

### Named Rules
**The Column-Only Tabular Rule.** Tabular numerals are for columns, not for a hero. A single large standalone number (the Dashboard's planned-hours figure) is set proportional — tabular spacing makes an isolated number look loose rather than precise.

## Layout

A fixed 232px sidebar (sticky, its own scroll) plus a centered content column capped at 1320px, padded 20px/24px/64px (top/sides/bottom). The base unit is the `.card`: a Panel-colored, 10px-radius, 18px-padded container — nearly every screen is a stack or grid of cards.

Two responsive breakpoints, both collapsing structure rather than just shrinking it:
- **900px** — the sidebar becomes a wrapping top bar (brand + new-task on one row, icon-only nav on the next, in the same markup — no duplicated JSX, just a flex-direction flip); the Day view's two-column layout (grid + inbox) collapses to one column.
- **640px** — tighter page padding, the hero number steps down to 42px, paired form fields stack to one column, cards lose 4px of padding.

Grids follow content, not a fixed column count: the stat-tile row and chart row both use `repeat(auto-fit, minmax(…, 1fr))` so they reflow rather than break. The time grid is the one true fixed grid — a 60px gutter plus 7 equal day columns (1 on the Day view), scaled by a single `--hour-height` variable.

## Elevation & Depth

Flat by default, still — but "flat" now means depth comes from stacked surfaces first, with a deliberate, tuned shadow reinforcing it, rather than shadow being near-absent. Hover and active feedback is still primarily a background-color step; a card may additionally step up to Card on hover, but nothing lifts, scales, or moves.

### Shadow Vocabulary
- **Ambient** (`0 1px 2px rgba(11,11,11,0.06)`): Reserved for the smallest surfaces that still want a whisper of separation without competing with a real card — not `.card` itself anymore (see Card, below).
- **Card** (light: `0 2px 10px rgba(11,11,11,0.08)`; dark: `0 0 0 1px rgba(255,255,255,0.06), 0 8px 24px rgba(0,0,0,0.5)`): Every `.card`'s resting shadow, and a stat tile's hover state. A black shadow is invisible against the deepened dark surfaces, so dark mode's version is a hairline light-alpha ring plus a soft black shadow, not a bigger black shadow — definition comes from the edge, not the blur, once the page is this close to true black.
- **Floating** (`0 6px 24px rgba(11,11,11,0.08)`): Reserved for content that genuinely floats above the page: the modal panel, the notification dropdown.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest; a hairline border and a surface-color step still do most of the work. Shadow is now a deliberate second layer, not an afterthought — Card on every card at rest, stepping up on a stat tile's hover — but it never substitutes for the surface-color step, and nothing ever lifts, scales, or moves on interaction. A shadow beyond Card (Floating) is still reserved for content that floats above the page's own stacking order.

## Shapes

Tightened from the system's original 6/10/16px scale to read sharper and more consistent: a core three-step scale — 4px / 7px / 10px — covers every control and card, plus two smaller steps that shrink in step with the element: 3px on chip-like marks (blocks, chips, the month-cell add button) and 2px on the smallest marks of all — a 9–10px legend swatch, a tag-bars dot, or the drag-hover time tooltip — where anything larger would read as a circle rather than a softened square. A full 999px pill closes the scale for anything circular or fully rounded (badges, the avatar, filter chips) — pills are a distinct shape choice, not a "roundness" the tightened scale reaches into. The rule underneath all of it: radius shrinks with the element, never stays fixed regardless of size. Every corner is soft and uniform; nothing is cut, asymmetric, or sharp. Borders are hairline (1px, 10% alpha) throughout — the system never reaches for a heavier stroke to add emphasis.

## Components

### Buttons
- **Shape:** 4px radius, always.
- **Primary:** Signal Violet fill, white text, 7px/14px padding, 550-weight label. `filter: brightness(1.07)` on hover — the one button that brightens rather than swaps surface.
- **Ghost:** Transparent at rest, Hover Surface on hover, Soft Ink → Ink text. The default for every secondary action.
- **Danger:** Transparent, Critical-Text colored, a faint Critical-tinted wash on hover. Reserved for destructive actions (delete task, delete series).
- **Icon:** 30×30px, transparent, Hover Surface on hover, holds a 16px icon (see Icons below) — theme toggle, notification bell, close, date-nav chevrons.

### Chips
- **Toggle chip** (`.filter-chip`, `.weekday-picker__day`): The system's one reusable "selected" idiom. At rest: Panel background, hairline border, Soft Ink text. Selected: Signal Violet fill, white text, no border needed. Used for Dashboard's trends date-range picker, the repeat-frequency picker, and the weekday picker — same visual contract everywhere something is chosen from a small fixed set.
- **Tag chip:** A small colored dot (7px, from the tag's own `--tag` custom property) plus a text label — never the dot alone.
- **Calendar chip** (`.chip`, month view / week all-day row): Hover Surface background, 3px radius, truncates with ellipsis; a done chip drops to 55% opacity with a strikethrough.

### Cards / Containers
- **Corner Style:** 10px radius (`{rounded.lg}`).
- **Background:** Panel.
- **Shadow Strategy:** Card — see Elevation & Depth.
- **Border:** 1px Hairline.
- **Internal Padding:** 18px (14px at the 640px breakpoint).
- **Hero card:** the Dashboard's "Planned today" card additionally carries the Glow Violet radial-gradient wash (positioned top-right, fading by 70%) — the one place a card's background is anything but a flat color. No other card gets this; it marks the Dashboard's headline figure, not a general card option.
- **Stat tile:** a lighter `{rounded.md}` card that steps from Panel to Hover Surface plus the Card shadow on hover (a hover state a purely static card doesn't get), and carries a small (15px) muted icon top-right of its label — a category mark, sized to never compete with the number below it. `--critical`/`--good` tones recolor the icon along with the value.

### Inputs / Fields
- **Style:** Panel background, 1px Hairline border, 4px radius, 7px/10px padding.
- **Hover:** Border steps to the slightly firmer Baseline tone (`#c3c2b7`) — a hint before focus, not a color change.
- **Focus:** A 2px Signal Violet outline with 2px offset, applied globally via `:focus-visible` — every focusable element in the app gets the identical ring, never a per-component reinvention. (The Auth Shell overrides this to a fixed `#a78bfa` regardless of theme — see Auth Shell.)
- **Disabled:** 55% opacity, `cursor: not-allowed`.

### Navigation
- **Style:** A vertical list of full-width, left-aligned rows (14px text, 500 weight, Soft Ink), 4px radius, no visible rest-state chrome.
- **Hover:** Hover Surface background, text steps to Ink.
- **Active:** A 12%-opacity Signal Violet tint background with Signal Violet text and 600 weight — the only nav state that uses the accent.
- **Mobile (≤900px):** Collapses to an icon-only horizontal row; labels move to a visually-hidden span plus a `title` tooltip, so the same markup serves both breakpoints.

### Icons
A small set of drawn stroke icons (`src/components/icons.jsx`) replaced what used to be bare Unicode characters throughout the app — the brand mark, sidebar nav, tag link, repeat mark, close button, date-nav chevrons, theme toggle, and the warning banner. One grammar for all of them: 24×24 viewBox, `currentColor` stroke at 2px, round caps and joins, no fill except the tag icon's single solid dot. Sizing is left to the call site (18px sidebar nav icons, 16px inside a 30px icon-button, 13px inline marks) rather than baked into the icon itself, so one definition serves every context. `NotificationBell`'s hand-drawn bell — the app's original real icon, and the reason the rest of the set exists — lives in the same file now.

### Load Indicator
A day's planned time, shown as a thin filled bar rather than only a number: 3px tall, Sunken Surface track, Signal Violet fill scaled against a 10-hour reference (the same "heavy day" threshold TodayView already warned on before this pattern existed), stepping to Critical past it. Two placements share the identical scale and color logic so a day reads the same way everywhere it appears: under each day's date in the Week header (`.week__load-track`), and as a strip across the top edge of each Month cell (`.month__load-strip`) — layered onto the existing cell content rather than replacing it, so Month's chips stay draggable and clickable exactly as before.

### Background Pattern
A quiet dot-grid (22px pitch, Dot Color, 1px dots) fixed behind the authenticated app shell, masked by two corner-anchored radial gradients — top-right and bottom-left — that fade to nothing by 70% of the way to center, unioned via `mask-composite: add`. It renders only in the negative space between cards; it never gets its own visible field. Fixed to the viewport, `z-index: 0`, `pointer-events: none` — this app lives on drag-and-drop (task blocks, month chips), and a decorative layer must never be reachable by a pointer event. Scoped to `.app-shell` only: the Auth Shell already owns its own glow and doesn't get a second, competing background effect.

### Auth Shell (deliberate exception)
Sign-in and sign-up are a fixed, always-dark two-column screen (`.auth-shell`) — brand and pitch on the left, the actual form on the right — and the one surface in the app that does not follow the light/dark toggle. Every color here is a literal, declared once under `.auth-shell`/`.auth-hero`/`.auth-panel`, never a themed `--token`.

- **Auth Hero** (left, 44% width, hidden below 860px): a radial glow (`rgba(233,213,255,0.9)`, positioned top-center) over a top-to-bottom linear gradient — Auth Violet `#7c3aed` → Auth Violet Deep `#4c1d95` → Auth Void `#1a0b2e` → black — carrying the brand mark, "Cadence," and a 32px headline pitch, all centered, white text at 72%/100% opacity for lead/heading.
- **Auth Panel** (right, flexes to fill): Auth Panel Background `#050505`, holding a centered 360px-max form column — a white Google button (real multi-color "G," the one exception to the icon grammar), a divider, the existing `.field`/`.input`/`.auth-form__switch`/`.link-button` markup restyled dark via scoped descendant selectors (Auth Input Background `#17171a`, white text, `rgba(255,255,255,*)` steps for label/hint/border), and the shared `.primary-button` (still Signal Violet — the one place the themed accent and the fixed palette intentionally meet).
- **Focus & links:** `.auth-shell :focus-visible` and `.auth-panel .link-button` both use Auth Link `#a78bfa` rather than the themed `--focus`/`--series-1`, chosen for its own contrast against black (7.14:1) regardless of which theme the visitor's browser or OS prefers.
- **Why fixed, not themed:** this is the one branded moment before the app's own theme toggle is even reachable to a visitor — matching a supplied reference image's specific violet-to-black gradient exactly, in every theme, is the point.

### Time-Grid Block (signature component)
The calendar's own vocabulary for a scheduled task, and the one place a colored border appears anywhere in the system. A `.block` gets a 3px left border in the task's own tag color, a matching 15%-tint background (`color-mix(in srgb, var(--tag) 15%, var(--surface-1))`), and 3px corners. This is functional color-coding for the task's category, not a decorative accent — it is the one sanctioned exception to "no colored left borders," confirmed for this component alone and not a pattern to extend to generic cards or list items. A repeating occurrence adds a small repeat icon after its time label; a completed block drops its border and gets a strikethrough title.

## Do's and Don'ts

### Do:
- **Do** keep the interface to one accent color, Signal Violet (`#7c3aed` light / `#8b5cf6` dark). Every other color is neutral, a user's own tag, or a system status.
- **Do** keep the Auth Shell's colors as literals scoped under `.auth-shell`/`.auth-hero`/`.auth-panel` — never themed tokens — since it is meant to look the same in every theme.
- **Do** give hover/active feedback with a background-color step (Panel → Hover Surface → Sunken Surface), never a shadow, lift, or scale transform.
- **Do** pair any tag color with a visible text label. Never let color alone carry information.
- **Do** reuse the toggle-chip idiom (neutral pill at rest → Signal Violet fill when selected) for any new "pick one or more from a small set" control, rather than inventing a new selected-state treatment.
- **Do** resolve a tag's color through the `--tag` custom property and a themed `var(--tag-*)` token, never an inline hex — the only way a component works correctly in both themes.
- **Do** declare a dark-mode color in both the `prefers-color-scheme` media query and the `[data-theme="dark"]` scope, so the manual toggle always overrides the OS default.
- **Do** draw a new icon in `src/components/icons.jsx`'s existing grammar (24×24, 2px `currentColor` stroke, round caps/joins) rather than reaching for a Unicode character.
- **Do** reuse the load-indicator's 10-hour reference and color logic (Signal Violet → Critical) for any new "how full is this day" treatment, rather than inventing a second capacity number.
- **Do** reuse Glow Violet and Dot Color for any future decorative echo of the Auth Shell's motif, rather than picking a new violet by eye.
- **Do** treat dark as the default a new visitor sees; test new work there first, then confirm light still holds — not the other way around.

### Don't:
- **Don't** add a second saturated accent color outside the validated 8-slot tag palette.
- **Don't** use a Unicode glyph or emoji standing in for an icon. Every icon in the app is drawn, in the one shared grammar — a text character reads as a placeholder the moment it sits next to a real icon. The Google mark on the Auth Shell's OAuth button is the sole, deliberate exception (a real third-party brand mark, not a UI icon).
- **Don't** let the Auth Shell's fixed dark palette leak into the rest of the app, or the themed `--series-1` token leak into the Auth Shell — they are two deliberately separate systems.
- **Don't** add a colored left border, top border, or accent stripe to a generic card, list item, or callout. The Time-Grid Block's left border is functional tag-color coding on the app's signature calendar element — it does not generalize to anything else.
- **Don't** reach for a shadow as hover feedback or as card decoration. Shadow is reserved for content that floats above the page's own layer (modal, dropdown).
- **Don't** borrow a display or serif typeface for emphasis. Voice comes from size, weight, and tracking within Inter — including the Dashboard's hero number.
- **Don't** add a second decorative background effect. Glow Violet and the dot-grid are the one motif; a new surface doesn't get its own new pattern.
- **Don't** set tabular numerals on a standalone figure. Tabular spacing is for aligned columns only.
