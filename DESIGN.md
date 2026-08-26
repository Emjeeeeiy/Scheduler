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
    fontFamily: "'Instrument Serif', 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
    fontSize: "clamp(36px, 4vw, 52px)"
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: "-0.01em"
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
- Inter throughout the app, at every scale including the largest number on screen — chosen for its tabular figures in a stat- and chart-heavy product, not as a display statement; the sign-in hero's headline is the one serif, and stays outside the app's own scale
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

Every step below is a token (`--text-*` for size, `--weight-*` for weight, both in `tokens.css`), not a px literal in a component rule. That matters because it was not always true: the scale lived only in this document while the stylesheet held ~100 bare literals, and they had drifted — row titles were documented at 500 and shipped at 400, three 13px labels ran at two different weights, and six components each set "the title of a thing" at their own size and weight. Tokens are what make the documented system the enforced one.

Sizes are **rem**, anchored so a default 16px root resolves each token to exactly the px value it replaced. Nothing moved for anyone; what it buys is that a reader who has raised their browser's default font size finally gets a larger interface. A px scale ignores that setting completely — zoom worked, the font-size preference did nothing.

- **Display** (650, 52px, 1.05 line-height, −0.03em tracking): The Dashboard's hero number (hours planned today) — the one place the type gets loud.
- **Display Sm** (650, 42px): The same hero number, stepped down at the 640px breakpoint.
- **Auth Headline** (Instrument Serif, 400, `clamp(36px, 4vw, 52px)`, −0.01em tracking): The Auth Shell's own hero line ("Plan your day in blocks.") — the one type in the product that is not Inter, and the only step whose size is fluid rather than fixed. It lives in Persuade mode, not Operate: a high-contrast editorial serif against the sign-in form's Inter is what makes the pairing read as considered. Weight 400 is not a choice to revisit — Instrument Serif ships a single weight, and anything heavier would be a synthesised bold. Scale carries the emphasis instead. Declared directly on `.auth-hero__title`, with no `--font-display` token, so the exception cannot spread into the app's own scale.
- **Stat** (650, 28px, −0.02em tracking): A stat tile's headline figure (Open today, Overdue, Done this week).
- **Headline** (650, 22px, −0.02em tracking): Screen-level titles on the setup screen and the Auth Shell's form panel.
- **Unit** (500, 24px): The "h" unit beside the hero number.
- **Mark** (400, 20px): The sidebar brand glyph.
- **Subtitle** (600, 18px): The week grid's day-of-month number.
- **Title** (600, 17px): Dialog/modal headings, the sidebar brand name, and the mobile nav's icon size.
- **Icon** (400, 16px): Icon-button glyphs and the large primary-button variant.
- **Body** (`--text-body`, 400, 15px, 1.5 line-height): Base paragraph and UI text — the document base size.
- **Item** (`--text-item` / `--weight-item`, 550, 14px): The **name of a thing** — a task, event, notification, or index row — plus nav links. One weight for this role wherever it appears: the block, the chip, the row, the notification, the day-peek entry, and the item index all set it identically, rather than each picking its own.
- **Label** (`--text-label` / `--weight-label`, 500, 13px): What a field or a figure is *called* — field labels, stat-tile and hero labels, small ghost/danger buttons, filter chips.
- **Meta** (`--text-meta`, 400, 12px): The **detail about** a thing — when, where, how long. Chart legends, notification meta, empty-state hints. Deliberately the body weight, never the label weight: this is the role an item's name has to win against.
- **Label** (500, 11px, 0.04em tracking, uppercase): Day-of-week headers, the "All day" marker, chart ticks, block/chip time — small structural labels, always uppercase and tracked when they are.
- **Micro** (700, 10px): The smallest text in the system, reserved for a single numeral in a fixed-size badge or a tight inline readout (the notification count, a drag-hover time tooltip, a month cell's planned-time figure).

Numerals are set proportional everywhere except a genuine column of numbers (the data table, chart axis, tag-bar values), where `font-variant-numeric: tabular-nums` keeps digits aligned.

### Named Rules
**The Column-Only Tabular Rule.** Tabular numerals are for columns, not for a hero. A single large standalone number (the Dashboard's planned-hours figure) is set proportional — tabular spacing makes an isolated number look loose rather than precise.

**The Name-Versus-Detail Rule.** Below 15px the steps are 1px apart and carry no hierarchy on their own — 14/13/12/11px all read as "small". **Weight and colour do the separating, size only follows.** A thing's name takes `--weight-item` (550) in primary ink; the detail about it takes `--weight-body` (400) in muted ink. A new component showing "a title and its timestamp" reuses that pair rather than inventing a third size. This is the rule the system had in prose and not in code: row titles shipped at 400, indistinguishable from their own metadata except by colour.

**The Fixed-Geometry Re-pin.** The calendar surfaces — `.grid-body`, `.week__allday`, `.month__week` — redefine the `--text-*` tokens back to px on the container. They are dimensioned in real units that text must fit inside: an hour is 52px (a JS constant in `WeekGrid`/`TodayView`, with blocks positioned as a percentage of it, so a 30-minute block is 26px tall), and month bars sit in 15px lane rows on a 17px stride. A label that scales inside a box that cannot scale with it only clips — strictly worse than not scaling. Everything outside the calendar still responds to the reader's font-size preference. Making the calendar scale too means moving that constant and the percentage and lane maths to rem: a layout change, not a typographic one, and not yet done.

**The min-width: 0 Chain.** Every ellipsis in this app depends on it. A flex or grid item defaults to `min-width: auto` — its content width — so one link left at auto anywhere between a container and a title stops the title shrinking, and a long name widens the whole column instead of truncating. `overflow: hidden` cannot do it alone. The inbox needed it at four levels (column, list, row, title) and the month chip at three (list, `<li>`, chip) before a long task title stopped pushing the page into horizontal scroll.

## Layout

A fixed 232px sidebar (sticky, its own scroll) plus a centered content column capped at 1320px, padded 20px/24px/64px (top/sides/bottom). The base unit is the `.card`: a Panel-colored, 10px-radius, 18px-padded container — nearly every screen is a stack or grid of cards.

Two responsive breakpoints, both collapsing structure rather than just shrinking it:
- **900px** — the sidebar splits into two bars: a sticky **top bar** (brand, the two create buttons, then icon-only Tags / All items / Log out / bell / theme / avatar) and a fixed **bottom tab bar** carrying the four view links in thumb reach. Still one DOM tree and no JS branch — the sidebar's flex-direction flips and `.sidebar__nav` goes `position: fixed` out of its parent's flow, so the two bars cannot drift out of sync with the desktop rail. `.app-content` reserves `76px + env(safe-area-inset-bottom)` of bottom padding so nothing hides behind the bar. The Day view's two-column layout (grid + inbox) collapses to one column.
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
- **Password field:** `PasswordField` — the standard input with a 26px reveal toggle inset 4px from its right edge (Eye / Eye Off, the icon grammar's own drawing), and 36px of matching right padding so text never runs under it. The toggle takes the same Panel → Hover Surface background step as any icon button, is per-field rather than one switch for a form (register's confirm field toggles on its own), and carries a named `aria-label` — "Show confirm password," not a bare "Show password." The label is wired with `htmlFor` instead of wrapping the input, since a button inside a `<label>` would join the field's accessible name.

### Navigation
- **Style:** A vertical list of full-width, left-aligned rows (14px text, 500 weight, Soft Ink), 4px radius, no visible rest-state chrome.
- **Hover:** Hover Surface background, text steps to Ink.
- **Active:** A 12%-opacity Signal Violet tint background with Signal Violet text and 600 weight — the only nav state that uses the accent.
- **Mobile (≤900px):** The four view links become a fixed bottom tab bar — equal `flex: 1 1 0` columns (a fixed grid a thumb can learn, not one that shifts with label length), icon over a 10px label, same active tint. Labels are *shown* here: a bottom tab bar has the room, and an unlabelled one is the harder thing to learn. The occasional controls (Tags, All items, Log out) take the opposite trade in the top bar — icon-only, label kept in a visually-hidden span, `title` tooltip for a mouse.
- **Sign-out:** Its own labelled `.sidebar__link` row directly above the footer rule, not a glyph inside it. It was previously a hidden second meaning of clicking your own avatar — undiscoverable, and one stray click from ending the session. The avatar stays below as identity only: no cursor, no hover, nothing that reads as a control.

### Icons
A small set of drawn stroke icons (`src/components/icons.jsx`) replaced what used to be bare Unicode characters throughout the app — the brand mark, sidebar nav, tag link, repeat mark, close button, date-nav chevrons, theme toggle, and the warning banner. One grammar for all of them: 24×24 viewBox, `currentColor` stroke at 2px, round caps and joins, no fill except the tag icon's single solid dot. Sizing is left to the call site (18px sidebar nav icons, 16px inside a 30px icon-button, 13px inline marks) rather than baked into the icon itself, so one definition serves every context. `NotificationBell`'s hand-drawn bell — the app's original real icon, and the reason the rest of the set exists — lives in the same file now.

### Load Indicator
A day's planned time, shown as a thin filled bar rather than only a number: 3px tall, Sunken Surface track, Signal Violet fill scaled against a 10-hour reference (the same "heavy day" threshold TodayView already warned on before this pattern existed), stepping to Critical past it. Two placements share the identical scale and color logic so a day reads the same way everywhere it appears: under each day's date in the Week header (`.week__load-track`), and as a strip across the top edge of each Month cell (`.month__load-strip`) — layered onto the existing cell content rather than replacing it, so Month's chips stay draggable and clickable exactly as before.

### Background Pattern
A quiet dot-grid (22px pitch, Dot Color, 1px dots) fixed behind the authenticated app shell, masked by two corner-anchored radial gradients — top-right and bottom-left — that fade to nothing by 70% of the way to center, unioned via `mask-composite: add`. It renders only in the negative space between cards; it never gets its own visible field. Fixed to the viewport, `z-index: 0`, `pointer-events: none` — this app lives on drag-and-drop (task blocks, month chips), and a decorative layer must never be reachable by a pointer event. Scoped to `.app-shell` only: the Auth Shell already owns its own glow and doesn't get a second, competing background effect.

### Item Index
`ItemManager` — one modal listing every task and event in the account, reached from **All items** beside Tags in the sidebar. The calendar views answer "what is happening on this day"; this answers "what did I put in here", which is the question you ask when clearing something out. Same modal chrome as Tags: filter chips (All / Tasks / Events, each carrying its count), a title search, then rows of `kind icon · title · meta · Edit · delete`, scrolling inside the panel at `max-height: 46dvh` so a long list never pushes the filters off the top.

Kind is carried by **shape, not colour** — the Day, Span, and Repeat icons the calendar already uses — so a row reads as the thing it will open. Delete uses the same inline confirm as the tag list (Delete / Cancel in place, no second dialog).

It lists **documents, not calendar days**: a repeating task appears once, as its rule, rather than as the occurrences the grids expand it into, and deleting it removes the series. Skipping a single day stays where it belongs — on that occurrence, in the view that draws it. Editing hands off to the existing Task/Event editors and closes the index first: two stacked modals would put two Escape handlers on the window and close both on one press.

### Auth Shell (deliberate exception)
Sign-in and sign-up are a fixed, always-dark two-column screen (`.auth-shell`) — brand and pitch on the left, the actual form on the right — and the one surface in the app that does not follow the light/dark toggle. Every color here is a literal, declared once under `.auth-shell`/`.auth-hero`/`.auth-panel`, never a themed `--token`.

- **Auth Hero** (left, fills whatever the panel leaves — roughly 60–75% on a desktop viewport, hidden below 860px): a radial glow (`rgba(233,213,255,0.9)`, positioned top-center) over a top-to-bottom linear gradient — Auth Violet `#7c3aed` → Auth Violet Deep `#4c1d95` → Auth Void `#1a0b2e` → black — carrying the brand mark, "Cadence," and a 32px headline pitch, all centered, white text at 72%/100% opacity for lead/heading.
- **Auth Panel** (right, a fixed column: `clamp(480px, 50%, 700px)`, sized to its 380px content plus a gutter rather than growing with the viewport; falls back to filling the screen below 860px, where the hero is gone): Auth Panel Background `#050505`, holding a centered 380px-max form column — a white Google button (real multi-color "G," the one exception to the icon grammar), a divider, the existing `.field`/`.input`/`.auth-form__switch`/`.link-button` markup restyled dark via scoped descendant selectors (Auth Input Background `#17171a`, white text, `rgba(255,255,255,*)` steps for label/hint/border), and the shared `.primary-button` (still Signal Violet — the one place the themed accent and the fixed palette intentionally meet).
- **Focus & links:** `.auth-shell :focus-visible` and `.auth-panel .link-button` both use Auth Link `#a78bfa` rather than the themed `--focus`/`--series-1`, chosen for its own contrast against black (7.14:1) regardless of which theme the visitor's browser or OS prefers.
- **Why fixed, not themed:** this is the one branded moment before the app's own theme toggle is even reachable to a visitor — matching a supplied reference image's specific violet-to-black gradient exactly, in every theme, is the point.

### Event Bar
The calendar's vocabulary for an event — a thing that *happens*, as opposed to a task, which gets *done*. Wherever an event covers whole days it draws as a continuous filled bar spanning them: `.month__bar` in the month grid, `.week__span` in the week's all-day row. Both use the Time-Grid Block's exact fill recipe (`color-mix(in srgb, var(--tag) 15%, var(--surface-1))`) at 3px corners, so an event reads as the same *material* as a block — but with **no left border**. That is deliberate twice over: the colored left border is the Time-Grid Block's own sanctioned exception and does not generalise, and a bar clipped at a week boundary carrying a left edge would imply "starts here" on a day it does not.

A bar clipped by the end of a row shows a 10px `ChevronLeftIcon`/`ChevronRightIcon` on the clipped side — the existing icon grammar, semantically exact ("it continues that way"), and never the only signal: a `visually-hidden` "Continues from earlier" / "Continues afterwards" rides alongside. Clipped corners stay rounded; nothing in this system is cut or asymmetric.

**Lane packing.** `src/lib/spans.js` is the one implementation, shared by the month row, the week all-day row, and the day view's single-day rail. Bars are clipped to the row, sorted longest-first, and given the lowest free lane. The critical rule, and the exact inverse of `layoutDay`'s cluster behaviour: **a row's lane bookkeeping is never reset partway across it**. A lane is a vertical offset shared by all seven columns, so restarting it mid-row makes bars disagree from one column to the next and the row reads as a staircase.

Bars live in an overlay grid using the *same* seven tracks as the cells (`grid-column: {start} / span {n}`), which is what makes them align exactly with no measurement and no percentage arithmetic — and renders identically under SSR. The overlay is `pointer-events: none` with each bar restoring `pointer-events: auto`, so the cells underneath stay droppable. This app runs on drag and drop; an overlay that swallowed drops would break the month outright.

### A single-day timed event
Draws as a `.block--event` in the time grid alongside tasks, sharing `layoutDay` so an event and a task that overlap split the column. It drops the tag stripe for a tag-tinted top and bottom rule and has nothing to tick off. **A multi-day event is never sliced into per-day grid segments** — it would need synthetic per-day objects (breaking `id`-keyed lists) and make "which piece did you grab?" a real question. All-day or spanning ⇒ a bar; single-day timed ⇒ a block. That one rule is why `layoutDay` needed no changes at all.

### Mini Calendar
A month at a glance beside the Dashboard hero (`.dashboard__top`, a `minmax(0,1fr) 300px` split that collapses below 900px). Two orthogonal signals per day, neither of them a new color: **1–3 load dots** banded against the same 10-hour reference the week and month load bars use, stepping to Critical past it; and a **filled numeral** when a day carries an event — a shape change, so it stacks with the dots instead of competing. Every cell's `title` spells both out in words. It keeps its own month cursor rather than sharing the app's `focusKey`, so browsing ahead does not move the date every other view is pointed at; clicking a day is what commits.

### Day Peek
The month's "+N more" opens an anchored popover listing that day in place, instead of navigating out of the month to find out what was hidden. Placement comes from `usePopoverPlacement`, extracted from the notification dropdown once a second popover needed the same two non-obvious behaviours: `position: fixed` measured in viewport coordinates (both triggers sit inside a scrolling ancestor that would clip a relatively-positioned panel), and always a single clamped `left` rather than ever switching to `right`.

### Grid Gestures
Three gestures share the time-grid surface and are kept apart on purpose:
- **Moving** a block is HTML5 drag-and-drop, because it transfers a task across columns, views, the month, and the inbox.
- **Creating by dragging a range** and **resizing a block** are Pointer Events. Neither transfers anything, and pointer events work under touch, which `dragstart` never fires for.
- Resize handles render as **siblings** of the block, never children: the block carries `draggable`, and a native `dragstart` fires on press-and-move regardless of pointer capture, so a nested handle would race the drag every time.

The in-progress range previews as `.day-column__draft` — a dashed Signal Violet outline over `--series-1-soft`, labelled with its length. It is a proposal, so it uses the accent's soft step rather than a new color. A press with no travel still creates at the default length, resolved in `pointerup`; there is no separate `onClick`, which would double-fire.

### Free Slots
The inverse of the schedule, and the question a time-blocker actually asks: not "what is on today" but "where can this go". A row of pill buttons under the day's head, each a real gap of 30 minutes or more; clicking one creates a task there. Events count as busy even though they never count as planned work.

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
- **Do** distinguish an event from a task by **shape and fill**, never by a new hue: a bar with no checkbox and no tag stripe, against a chip or block that has both. There is still exactly one accent.
- **Do** name a specific drag MIME type (`DRAG_TASK` or `DRAG_EVENT`) on every drop target. A target opts into what it accepts by which type it checks, which is what makes it *impossible* to drop an event on the inbox — rather than merely wrong.
- **Do** use `packSpans` for any new "things that cover a range of days" surface, rather than writing a second lane packer.
- **Do** use Pointer Events for a new gesture that only manipulates something in place, and leave HTML5 drag-and-drop to gestures that actually transfer an item between containers.

### Don't:
- **Don't** add a second saturated accent color outside the validated 8-slot tag palette.
- **Don't** use a Unicode glyph or emoji standing in for an icon. Every icon in the app is drawn, in the one shared grammar — a text character reads as a placeholder the moment it sits next to a real icon. The Google mark on the Auth Shell's OAuth button is the sole, deliberate exception (a real third-party brand mark, not a UI icon).
- **Don't** let the Auth Shell's fixed dark palette leak into the rest of the app, or the themed `--series-1` token leak into the Auth Shell — they are two deliberately separate systems.
- **Don't** add a colored left border, top border, or accent stripe to a generic card, list item, or callout. The Time-Grid Block's left border is functional tag-color coding on the app's signature calendar element — it does not generalize to anything else.
- **Don't** reach for a shadow as hover feedback or as card decoration. Shadow is reserved for content that floats above the page's own layer (modal, dropdown).
- **Don't** borrow a display or serif typeface for emphasis. Voice comes from size, weight, and tracking within Inter — including the Dashboard's hero number. The Auth Shell's headline (Instrument Serif) is the single named exception, on the same grounds as its fixed palette: it is a marketing surface, not the app. It is scoped to one selector with no token, and it does not generalise — a second serif anywhere in the product would turn a deliberate exception into an inconsistency.
- **Don't** add a second decorative background effect. Glow Violet and the dot-grid are the one motif; a new surface doesn't get its own new pattern.
- **Don't** set tabular numerals on a standalone figure. Tabular spacing is for aligned columns only.
- **Don't** let an event into `dayStats`, `overdueTasks`, `upcomingTasks`, `tagBreakdown`, or any completion rate. Events are commitments, not work: counting a three-day conference as seventy-two planned hours would make the completion rate a ratio against things that cannot be completed. `tasksOn(key)` stays task-only permanently — views compose it with `eventsOn(key)` themselves.
- **Don't** give events a second load bar or capacity meter. A count beside the existing bar is the legal move; a second number answering "how full is this day" would contradict the first.
- **Don't** nest a pointer-driven control inside an element carrying `draggable`. Native `dragstart` fires on press-and-move regardless of pointer capture and will win the race.
- **Don't** slice a multi-day event into per-day pieces to fit an existing per-day renderer. All-day or spanning means a bar; only a single-day timed event belongs in the time grid.
