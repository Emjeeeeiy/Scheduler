---
name: Cadence
description: A quiet, restrained personal time-blocking planner — zero accent color, line-based structure, no decoration
colors:
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
  auth-button-ink: "#1f1f1f"
  glow-neutral: "rgba(11, 11, 11, 0.05)"
  dot-color: "rgba(11, 11, 11, 0.12)"
typography:
  auth-headline:
    fontFamily: "'Space Mono', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: "clamp(36px, 4vw, 52px)"
    fontWeight: 650
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  display:
    fontFamily: "'Space Mono', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: "52px"
    fontWeight: 650
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  display-sm:
    fontFamily: "'Space Mono', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: "42px"
    fontWeight: 650
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  stat:
    fontFamily: "'Space Mono', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: "28px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "'Space Mono', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  unit:
    fontFamily: "'Space Mono', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
  mark:
    fontFamily: "'Space Mono', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
  subtitle:
    fontFamily: "'Space Mono', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "normal"
  title:
    fontFamily: "'Space Mono', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  icon:
    fontFamily: "'Space Mono', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
  body:
    fontFamily: "'Space Mono', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  ui:
    fontFamily: "'Space Mono', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  meta:
    fontFamily: "'Space Mono', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: "13px"
    fontWeight: 450
    lineHeight: 1.3
    letterSpacing: "normal"
  caption:
    fontFamily: "'Space Mono', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: "12px"
    fontWeight: 450
    lineHeight: 1.3
    letterSpacing: "normal"
  label:
    fontFamily: "'Space Mono', ui-monospace, 'SFMono-Regular', monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.04em"
  micro:
    fontFamily: "'Space Mono', ui-monospace, 'SFMono-Regular', monospace"
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
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "7px 14px"
  button-primary-hover:
    backgroundColor: "{colors.soft-ink}"
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
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  google-button:
    backgroundColor: "#ffffff"
    textColor: "{colors.auth-button-ink}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
---

# Design System: Cadence

## Overview

**Creative North Star: "The Quiet Instrument"**

Cadence is a precise, unshowy tool that does one job well: turn a list of tasks into real blocks of a real day, and show you afterward what actually happened. Nothing in the interface performs for attention — there is no accent color at all, and interactive states are signaled by ink and structure instead: a filled pill, a bolder weight, a hairline. Restraint is the point, not a placeholder for a bolder pass that never came.

The system is quiet, precise, and unshowy by deliberate choice. Its confirmed anti-reference is the gamified productivity app: no streaks, no confetti, no badges, no cheerful mascot nudging you back in. The interface stays out of the way of the work it's tracking — feedback is a background-color step, not a celebration.

**Key Characteristics:**
- Dark is the identity now, not an alternate: a first-time visitor lands on dark; light stays one toggle away, unremoved
- Zero accent color anywhere — an interactive or "selected" state inverts to solid Ink instead of reaching for a hue, the one idiom the whole app shares
- Line-based, not card-based: depth comes from a hairline border and the surrounding page color, never a fill or a shadow — shadow is reserved for content that floats above the page (a modal, a dropdown), never for a card at rest — see Elevation & Depth
- Space Mono throughout the app, at every scale including the largest number on screen and the sign-in hero's headline — one fixed-width, technical voice everywhere rather than a neutral system default; emphasis comes from weight and tracking, never a second typeface
- A validated, colorblind-safe 8-color palette for user data (tags), kept strictly separate from the app's own chrome
- A single reusable "selected" idiom (neutral pill → filled Ink pill) used everywhere something toggles
- One drawn icon grammar, not a scatter of Unicode characters — every icon in the app shares a stroke style and lives in one file
- A quiet dot-grid in the app shell's negative space, and a low-key neutral glow on the Dashboard hero — the app's one restrained decorative motif, not scattered across multiple surfaces
- One structural exception: the Auth Shell (sign-in/sign-up) is built from lines rather than cards — a topbar rule, one column divider, and corner-tick marks in place of the bordered `.card` language used elsewhere — but follows the same zero-accent rule and the same themed light/dark tokens as the rest of the app — see Components

## Colors

The palette is entirely neutral — there is no accent color anywhere in the themed system. "This is interactive, active, or now" is signaled by inverting to solid Ink instead; everywhere else, color belongs to the user's own tags or to a status.

### Interactive (no accent)
The system used to carry one accent, Signal Violet, retired app-wide in favor of a single **Ink Invert** idiom: an interactive or selected element fills with Ink (`#0b0b0b` light / `#ffffff` dark) and flips its own text to Paper, the same two tokens the whole type scale already uses. One rule replaces what used to need a second color:

- **Ink Invert**: primary buttons, a selected toggle chip or weekday key, the active sidebar link's tab, today's date badge, and a drag/drop-target's dashed outline all fill with Ink and read Paper text. Hover steps the fill to Soft Ink rather than brightening a hue. Applies identically in both themes because Ink and Paper already swap at the theme boundary — nothing new to compute.
- **Solid vs. Hollow** (charts only): a two-series comparison — planned vs. done — used to separate its series by hue (solid violet vs. a pale violet wash). It now separates by **value contrast** instead: the done series is a solid Ink fill, the planned series is a hollow Hover-Surface swatch with a hairline border. The legend swatches use the same pairing, so a chart's key and its bars never disagree.
- **Today / now markers** (the week header's date badge, the mini-calendar's today numeral, a month cell's today ring) use the same Ink Invert fill or an Ink inset ring — never a color a reader would have to have already learned.

### Neutral
- **Paper** (`#f9f9f7` light / `#050505` dark): The page background — the surface everything else sits on top of. The dark value was deepened toward the Auth Shell's own `#050505` (it was a softer `#0d0d0d` before the Auth Shell existed); every surface below it moved down by the same step so the whole scale reads as one deliberate move, not a color picked in isolation.
- **Panel** (`#fcfcfb` light / `#131313` dark): The **raised** surface — controls (inputs, chips, weekday keys) in both themes, and anything that genuinely floats above the page (the modal panel, the notification dropdown, the day-peek popover, the chart tooltip). One step lighter than Paper, so a raised thing reads as raised through color alone.
- **Container:** a *container* — the sidebar, a card, a stat tile, the mobile bottom bar — carries no fill of its own in either theme; it sits flat on Paper and lets its hairline border do the separating. This used to be a themed token (`--surface-card`, split because light and dark wanted different answers); it went away along with card shadows, once "flat on the page" stopped being dark mode's special case and became the rule everywhere.

  This is exactly why floating content needs its own explicit surface. `.modal__panel` carries `.card` for its shape and padding but takes Panel back explicitly — a page-coloured modal in dark would be the same near-black as the scrim behind it, and unlike a container, a modal has to read as raised.
- **Hover Surface** (`#f2f1ed` light / `#1e1e1e` dark): The one hover/active feedback color for buttons, list rows, and nav links. Every interactive rest-state uses Panel; every interactive hover-state uses Hover Surface. That swap is the entire feedback vocabulary.
- **Sunken Surface** (`#edece7` light / `#0a0a0a` dark): Recessed content — inline `code`, the count pill, a progress track, an out-of-month calendar cell.

  An out-of-month cell additionally carries **diagonal hatching** (`repeating-linear-gradient` at 45°, 1px lines on an 8px pitch, drawn in `--gridline`). The surface step alone used to carry "not this month", and it stopped being enough once containers went page-flat in dark: Sunken `#0a0a0a` against a `#050505` card is a difference too small to see. The hatch uses the grid's own ink so it reads as more of the calendar's structure rather than a new decorative texture, and it stays quiet because those days still hold real chips and bars that have to remain readable through it. `background-color` and `background-image` are set separately so the drop-target rule's `background` shorthand clears the hatch — a day being dragged onto shows a clean ink tint, not a tint over stripes.
- **Ink** (`#0b0b0b` light / `#ffffff` dark): Primary text.
- **Soft Ink** (`#52514e` light / `#c3c2b7` dark): Secondary text — labels, metadata, supporting copy.
- **Faint Ink** (`#898781`): Muted text — hints, placeholders, timestamps, empty-state copy. Same value in both themes; it was already contrast-safe against the deepened dark surfaces without adjustment.
- **Hairline** (`rgba(11, 11, 11, 0.10)` light / `rgba(255, 255, 255, 0.10)` dark): The only border color in the system, at one low alpha. Structure comes from this line plus a surface-color step, never from a heavier stroke.
- **Gridline** (`#e1e0d9` light / `#232323` dark): A second, slightly firmer hairline reserved for the time grid and month grid — dense repeating structure that needs to read at a glance without competing with content borders.
- **Glow Neutral** (`rgba(11, 11, 11, 0.05)` light / `rgba(255, 255, 255, 0.10)` dark) and **Dot Color** (`rgba(11, 11, 11, 0.12)` light / `rgba(255, 255, 255, 0.16)` dark): the two decorative tokens behind the Dashboard hero's glow and the app shell's background dot-grid — a low-alpha step of Ink, not a hue, since there is no accent left to echo — see Components.

### Tertiary
The categorical and status colors — data the user assigns or the app reports, never chrome.

- **The eight tag colors** (`tag-blue` `#2a78d6`, `tag-orange` `#eb6834`, `tag-aqua` `#1baf7a`, `tag-yellow` `#eda100`, `tag-magenta` `#e87ba4`, `tag-green` `#008300`, `tag-violet` `#4a3aa7`, `tag-red` `#e34948`): A validated, colorblind-safe categorical palette (worst adjacent ΔE 9.1 light / 8.4 dark), deliberately untouched by the move to zero accent — recoloring it would invalidate the CVD ordering. Handed out to new tags in this fixed order, never chosen freely — the order is the safety mechanism. Stored as a slot name, never a hex, so light and dark themes each get their own correctly-stepped value. This is the one place saturated color still lives in the system, on purpose: it is the user's own data, never chrome.
- **Good** (`#0ca30c`) / **Warning** (`#fab219`) / **Serious** (`#ec835a`) / **Critical** (`#d03b3b`): System-reported state, not user choice. Always shipped with an icon or label — never the only signal.

### Named Rules
**The Zero Accent Rule.** No saturated color is used for UI meaning anywhere in the themed system. A new interactive state does not get a color; it gets Ink Invert (fill Ink, text Paper) or a neutral surface-step. The one thing this rule does not touch is the user's own tag palette, which is data, not chrome.

**The Label-Not-Just-Color Rule.** A tag color is never the only signal. Three tag slots fall under 3:1 contrast on the light surface, so anything wearing a tag color also carries a visible text label.

**The No-Auto-Flip Rule.** Dark mode is a hand-chosen set of values, not a computed inversion. Every dark-mode color is declared twice — once under `@media (prefers-color-scheme: dark)` for the OS setting, once under `[data-theme="dark"]` for the in-app toggle — so the explicit choice always wins over the system default. No color's only definition ever lives inside a media query.

## Typography

**Body Font:** Space Mono, with a monospace system stack (`ui-monospace, "SFMono-Regular", monospace`) as fallback
**Display Font:** the same face, distinguished only by size, weight, and tracking
**Code Monospace:** `ui-monospace, "Cascadia Code", "Segoe UI Mono", monospace` — inline `code` only (the setup screen's env-var and rule-file references). Its own stack, kept separate from the app's own Space Mono so a code reference still reads as "the OS's code font" rather than the product's own voice.

**Character:** One typeface for the whole product, including the largest number on screen and the sign-in hero. Voice comes from scale and weight, never from switching families — the system deliberately refuses a "display font moment." Space Mono replaced Fredoka project-wide: a fixed-width mono face chosen to give the whole interface a technical, typewritten identity rather than a conventional proportional sans. The system's monospace fallback stack remains the fallback chain, not a discarded choice.

Every character in Space Mono occupies the same advance width, so numeral columns (stat tiles, chart axes, the tag-bar values) stay aligned by construction — no `tabular-nums` feature to verify, unlike the proportional faces this system used before. Space Mono ships only Regular (400) and Bold (700), not the five-step weight scale the tokens ask for elsewhere: the CSS font-matching algorithm resolves every token above 500 (`--weight-item` 550, `--weight-title` 600, `--weight-figure` 650) up to Bold and everything at or below (`--weight-label` 500, `--weight-meta` 450, `--weight-body` 400) down to Regular. The Name-Versus-Detail Rule below still holds — a name is now Bold-vs-Regular rather than five shades apart — but a design that actually needs an intermediate weight will not get one from this face.

### Hierarchy

The scale is dense rather than a handful of marketing-style jumps — sixteen steps, each earned by one specific, named use, from a 10px numeral to a 52px hero. Nothing here is decorative; every step is a real component doing real work at that size.

Every step below is a token (`--text-*` for size, `--weight-*` for weight, both in `tokens.css`), not a px literal in a component rule. That matters because it was not always true: the scale lived only in this document while the stylesheet held ~100 bare literals, and they had drifted — row titles were documented at 500 and shipped at 400, three 13px labels ran at two different weights, and six components each set "the title of a thing" at their own size and weight. Tokens are what make the documented system the enforced one.

Sizes are **rem**, anchored so a default 16px root resolves each token to exactly the px value it replaced. Nothing moved for anyone; what it buys is that a reader who has raised their browser's default font size finally gets a larger interface. A px scale ignores that setting completely — zoom worked, the font-size preference did nothing.

- **Display** (650, 52px, 1.05 line-height, −0.03em tracking): The Dashboard's hero number (hours planned today) — the one place the type gets loud.
- **Display Sm** (650, 42px): The same hero number, stepped down at the 640px breakpoint.
- **Auth Headline** (650, `clamp(36px, 4vw, 52px)`, 1.05 line-height, −0.03em tracking): The Auth Shell's own hero line ("Plan your day in blocks.") — the same Display weight and tracking as the Dashboard's hero number, just fluid rather than fixed since it lives in the hero panel's own variable width rather than a fixed-width card. Declared directly on `.auth-hero__title`, with no separate `--font-display` token, so it stays the app's one voice rather than a second typeface for the sign-in moment.
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

A fixed 232px sidebar (sticky, its own scroll) plus a centered content column capped at 1320px, padded 20px/24px/64px (top/sides/bottom). The base unit is the `.card`: an unfilled, hairline-bordered, 10px-radius, 18px-padded container — nearly every screen is a stack or grid of these, structured by their borders alone rather than by sitting on a raised surface.

Two responsive breakpoints, both collapsing structure rather than just shrinking it:
- **900px** — the sidebar splits into two bars: a sticky **top bar** (brand, the two create buttons, then icon-only Tags / All items / Log out / bell / theme / avatar) and a fixed **bottom tab bar** carrying the four view links in thumb reach. Still one DOM tree and no JS branch — the sidebar's flex-direction flips and `.sidebar__nav` goes `position: fixed` out of its parent's flow, so the two bars cannot drift out of sync with the desktop rail. `.app-content` reserves `76px + env(safe-area-inset-bottom)` of bottom padding so nothing hides behind the bar. The Day view's two-column layout (grid + inbox) collapses to one column.
- **640px** — tighter page padding, the hero number steps down to 42px, paired form fields stack to one column, cards lose 4px of padding.

Grids follow content, not a fixed column count: the stat-tile row, the chart row, and the queue row (`.queue-row`, Next up beside Overdue) all use `repeat(auto-fit, minmax(…, 1fr))` so they reflow rather than break. `auto-fit` is doing real work in the queue row: Overdue only renders when something is overdue, and Next up takes the whole width on its own with no second rule. Next up leads because it is always present — a column that keeps its place is easier to read than one that slides left whenever the other disappears — and `align-items: start` lets each card size to its own content rather than padding a one-item Overdue out to match a three-item Next up. The time grid is the one true fixed grid — a 60px gutter plus 7 equal day columns (1 on the Day view), scaled by a single `--hour-height` variable.

## Elevation & Depth

Flat, full stop: a card carries no fill and no shadow of its own, ever — only a hairline border on the same page color everything else sits on. Depth exists in exactly one place: content that genuinely floats above the page. Hover and active feedback on a non-card control is still a background-color step (Panel → Hover Surface); a card's own hover feedback, where it has one (a stat tile), is a border-color step instead, since there is no fill to step from. Nothing ever lifts, scales, or moves.

### Shadow Vocabulary
- **Ambient** (`0 1px 2px rgba(11,11,11,0.06)`): Reserved for the smallest surfaces that still want a whisper of separation — not currently drawn on anything shipping, kept for a future case that needs less than Floating.
- **Floating** (`0 6px 24px rgba(11,11,11,0.08)`): The one shadow tier actually in use, reserved for content that genuinely floats above the page's own stacking order: the modal panel, the notification and account dropdowns, the day-peek popover, the chart tooltip. Nothing else — a card at rest, a stat tile, the sidebar — gets a shadow.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat, always. A hairline border and the page's own color do all the work of separating one region from another; there is no second, raised surface color left to step up to. A shadow is reserved entirely for content that floats above the page's own stacking order — it never decorates a card at rest, and nothing ever lifts, scales, or moves on interaction.

## Shapes

Tightened from the system's original 6/10/16px scale to read sharper and more consistent: a core three-step scale — 4px / 7px / 10px — covers every control and card, plus two smaller steps that shrink in step with the element: 3px on chip-like marks (blocks, chips, the month-cell add button) and 2px on the smallest marks of all — a 9–10px legend swatch, a tag-bars dot, or the drag-hover time tooltip — where anything larger would read as a circle rather than a softened square. A full 999px pill closes the scale for anything circular or fully rounded (badges, the avatar, filter chips) — pills are a distinct shape choice, not a "roundness" the tightened scale reaches into. The rule underneath all of it: radius shrinks with the element, never stays fixed regardless of size. Every corner is soft and uniform; nothing is cut, asymmetric, or sharp. Borders are hairline (1px, 10% alpha) throughout — the system never reaches for a heavier stroke to add emphasis.

No exception remains outside this scale: the Auth Shell has no rounded corners to speak of at all — hero and form are unboxed, separated by a single square hairline, not a card — see Auth Shell under Components.

## Components

### Buttons
- **Shape:** 4px radius, always.
- **Primary:** Ink Invert — Ink fill, Paper text, 7px/14px padding, 550-weight label. Hover steps the fill to Soft Ink rather than brightening, the same background-step feedback every other control uses.
- **Ghost:** Transparent at rest, Hover Surface on hover, Soft Ink → Ink text. The default for every secondary action.
- **Danger:** Transparent, Critical-Text colored, a faint Critical-tinted wash on hover. Reserved for destructive actions (delete task, delete series).
- **Icon:** 30×30px, transparent, Hover Surface on hover, holds a 16px icon (see Icons below) — theme toggle, notification bell, close, date-nav chevrons.

### Chips
- **Toggle chip** (`.filter-chip`, `.weekday-picker__day`): The system's one reusable "selected" idiom. At rest: Panel background, hairline border, Soft Ink text. Selected: Ink Invert — Ink fill, Paper text, no border needed. Used for Dashboard's trends date-range picker, the repeat-frequency picker, and the weekday picker — same visual contract everywhere something is chosen from a small fixed set.
- **Tag chip:** A small colored dot (7px, from the tag's own `--tag` custom property) plus a text label — never the dot alone.
- **Calendar chip** (`.chip`, month view / week all-day row): Hover Surface background, 3px radius, truncates with ellipsis; a done chip drops to 55% opacity with a strikethrough.

### Cards / Containers
- **Corner Style:** 10px radius (`{rounded.lg}`).
- **Background:** None — the same page color as everything around it.
- **Shadow Strategy:** None at rest, ever — see Elevation & Depth.
- **Border:** 1px Hairline. This is the entire separation mechanism: no fill, no shadow, just the line.
- **Internal Padding:** 18px (14px at the 640px breakpoint).
- **Hero card:** the Dashboard's "Planned today" card additionally carries the Glow Neutral radial-gradient wash (positioned top-right, fading by 70%) — the one place a card's background is anything but flat. No other card gets this; it marks the Dashboard's headline figure, not a general card option. It is a **column anchored at both ends**, not a stack: `.hero__head` (label + figure) at the top, and a bottom cluster — the full-width load bar, its reference note, a hairline rule, then the day's breakdown paired with its action — carried down by `margin-top: auto` on `.hero__load`. The auto margin sits on the load bar rather than the footer on purpose: it moves the whole cluster as one, leaving a single deliberate gap under the figure instead of stranding furniture on both sides of a void. The card takes its height from the Mini Calendar beside it, so that gap is exactly the space the old top-piled layout left dangling under its button — the same content, anchored, rather than anything added to fill it. Below 900px there is no calendar to match, the card sizes to its content, and the gap closes to nothing on its own.
- **Stat tile:** a lighter `{rounded.md}` card with the same unfilled, hairline-bordered treatment; its hover feedback is a border-color step (Hairline → Baseline) rather than a fill or shadow, since it has no fill to step from. Carries a small (15px) muted icon top-right of its label — a category mark, sized to never compete with the number below it. `--critical`/`--good` tones recolor the icon along with the value.

### Inputs / Fields
- **Style:** Panel background, 1px Hairline border, 4px radius, 7px/10px padding.
- **Hover:** Border steps to the slightly firmer Baseline tone (`#c3c2b7`) — a hint before focus, not a color change.
- **Focus:** A 2px Ink outline with 2px offset, applied globally via `:focus-visible` — every focusable element in the app gets the identical ring, never a per-component reinvention.
- **Disabled:** 55% opacity, `cursor: not-allowed`.
- **Password field:** `PasswordField` — the standard input with a 26px reveal toggle inset 4px from its right edge (Eye / Eye Off, the icon grammar's own drawing), and 36px of matching right padding so text never runs under it. The toggle takes the same Panel → Hover Surface background step as any icon button, is per-field rather than one switch for a form (register's confirm field toggles on its own), and carries a named `aria-label` — "Show confirm password," not a bare "Show password." The label is wired with `htmlFor` instead of wrapping the input, since a button inside a `<label>` would join the field's accessible name.

### Navigation
- **Style:** A vertical list of full-width, left-aligned rows (14px text, 500 weight, Soft Ink), 4px radius, no visible rest-state chrome.
- **Hover:** Hover Surface background, text steps to Ink.
- **Active:** A Hover Surface background with Ink text and 600 weight — a plain surface-step, the same feedback vocabulary as every other control's hover.
- **Mobile (≤900px):** The four view links become a fixed bottom tab bar — equal `flex: 1 1 0` columns (a fixed grid a thumb can learn, not one that shifts with label length), icon over a 10px label, same active background-step. Labels are *shown* here: a bottom tab bar has the room, and an unlabelled one is the harder thing to learn. The occasional controls (Tags, All items, Log out) take the opposite trade in the top bar — icon-only, label kept in a visually-hidden span, `title` tooltip for a mouse.
- **Sign-out:** Its own labelled `.sidebar__link` row directly above the footer rule, not a glyph inside it. It was previously a hidden second meaning of clicking your own avatar — undiscoverable, and one stray click from ending the session. The avatar stays below as identity only: no cursor, no hover, nothing that reads as a control.

### Icons
A small set of drawn stroke icons (`src/components/icons.jsx`) replaced what used to be bare Unicode characters throughout the app — the brand mark, sidebar nav, tag link, repeat mark, close button, date-nav chevrons, theme toggle, and the warning banner. One grammar for all of them: 24×24 viewBox, `currentColor` stroke at 2px, round caps and joins, no fill except the tag icon's single solid dot. Sizing is left to the call site (18px sidebar nav icons, 16px inside a 30px icon-button, 13px inline marks) rather than baked into the icon itself, so one definition serves every context. `NotificationBell`'s hand-drawn bell — the app's original real icon, and the reason the rest of the set exists — lives in the same file now.

### Load Indicator
A day's planned time, shown as a thin filled bar rather than only a number: Sunken Surface track, Ink fill scaled against a 10-hour reference (the same "heavy day" threshold TodayView already warned on before this pattern existed), stepping to Critical past it. Placements share the identical **scale and colour logic** so a day reads the same way everywhere it appears — the pixel height varies with the surface, the reference never does:

- under each day's date in the Week header (`.week__load-track`, 3px);
- as a strip across the top edge of each Month cell (`.month__load-strip`, 3px) — layered onto the existing cell content rather than replacing it, so Month's chips stay draggable and clickable exactly as before;
- as the Mini Calendar's 1–3 load dots, banded against the same reference;
- full-width at 6px across the foot of the Dashboard hero (`.hero__load-track`), where it answers what the hero's figure alone cannot: not how many hours are planned, but how full the day holding them is.

The 10-hour reference is `HEAVY_DAY_MIN` in `lib/stats.js`, imported by all four. It was a copied literal in each component until the fourth needed it; one shared constant is what stops them disagreeing about what a full day is.

### Background Pattern
A quiet dot-grid (22px pitch, Dot Color, 1px dots) fixed behind the authenticated app shell, masked by two corner-anchored radial gradients — top-right and bottom-left — that fade to nothing by 70% of the way to center, unioned via `mask-composite: add`. It renders only in the negative space between cards; it never gets its own visible field. Fixed to the viewport, `z-index: 0`, `pointer-events: none` — this app lives on drag-and-drop (task blocks, month chips), and a decorative layer must never be reachable by a pointer event. Scoped to `.app-shell` only: the Auth Shell carries its own corner-tick motif instead and doesn't get a second, competing background effect.

### Item Index
`ItemManager` — one modal listing every task and event in the account, reached from **All items** beside Tags in the sidebar. The calendar views answer "what is happening on this day"; this answers "what did I put in here", which is the question you ask when clearing something out. Same modal chrome as Tags: filter chips (All / Tasks / Events, each carrying its count), a title search, then rows of `kind icon · title · meta · Edit · delete`, scrolling inside the panel at `max-height: 46dvh` so a long list never pushes the filters off the top.

Kind is carried by **shape, not colour** — the Day, Span, and Repeat icons the calendar already uses — so a row reads as the thing it will open. Delete uses the same inline confirm as the tag list (Delete / Cancel in place, no second dialog).

It lists **documents, not calendar days**: a repeating task appears once, as its rule, rather than as the occurrences the grids expand it into, and deleting it removes the series. Skipping a single day stays where it belongs — on that occurrence, in the view that draws it. Editing hands off to the existing Task/Event editors and closes the index first: two stacked modals would put two Escape handlers on the window and close both on one press.

### Auth Shell (structural exception)
Sign-in and sign-up (`.auth-shell`) are built entirely from **line, not fill**: a topbar rule, one hairline column divider, and a corner-tick frame — no element on this screen ever carries a background color of its own, so nothing reads as a card, even though the rest of the app still draws its cards with a hairline border. It used to be a fixed, always-dark surface with its own literal violet-to-black gradient; it now follows the same light/dark tokens, and the same zero-accent rule, as everywhere else — the ink-invert button, the ink focus ring, and the underlined link it uses are the app's ordinary components now, not a scoped override.

- **Auth Topbar** (`.auth-topbar`, full width): the brand mark and "Cadence" on the left, a `.icon-button` theme toggle on the right (identical cycle behavior to the app shell's) — this screen precedes the toggle everywhere else and still needs one, always reachable regardless of viewport. A single `1px --border` rule underneath separates it from the content frame; there is no fill behind it, just `--page`.
- **Auth Body** (`.auth-body`, everything under the topbar): the bounded content frame, 28px inset (20px ≤1080px, edge-to-edge ≤860px). A small drawn cross (`.auth-tick`, two 1px hairline strokes in `--baseline`) sits inset 12px at each of its four corners — the one place in the app with a decorative motif beyond the dot-grid, and hidden ≤860px where the frame itself goes edge-to-edge.
- **Auth Hero** (left column inside the body, roughly 60–75% on a desktop viewport, hidden below 860px): plain centered copy — a headline pitch in `--text-primary`, a lead in `--text-secondary` — with no background and no border of its own. A single `border-right: 1px solid var(--border)` is the only thing separating it from the form; that one hairline is the entire "divider," not a gap between two boxes.
- **Auth Panel** (right column inside the body: `clamp(480px, 50%, 700px)`, sized to its 380px content plus a gutter rather than growing with the viewport; falls back to filling the frame's full width below 860px): a centered 380px-max form column with no panel background or border either — a white Google button (real multi-color "G," the one exception to the icon grammar, still literal-colored and bordered in `--border` so it stays legible on a light-mode page), a divider, and the app's own themed `.field`/`.input`/`.auth-form__switch`, `.primary-button`, and `.link-button` — no scoped overrides left, since ink-invert and the ink focus ring are already the app-wide default. Every visible edge here belongs to an individual control (an input's own hairline, the Google button's own hairline), never to a wrapping panel.
- **Why line instead of card:** the previous fixed palette matched a supplied reference's violet-to-black gradient exactly; a later reference pinned a monochrome dev-tool aesthetic built from rules, a corner-tick frame, and un-filled bordered controls rather than filled panels — confirmed as "no cards, just lines and +," which then generalized to the rest of the app's own cards too, minus the topbar/corner-tick/column-divider structure, which stays this screen's own.

### Repeat Picker
`RepeatPicker` — one control, shared by the task and event editors, so a rule is chosen the same way for both and the two can never drift into separate vocabularies. A row of toggle chips (the system's one selected idiom): **Never / Every day / Weekdays / Weekends / Pick days / Monthly**. "Pick days" reveals the seven weekday keys; "Monthly" reveals a second chip row — **First / Second / Third / Fourth / Last** — and a live hint reads the whole rule back in words ("Every second Saturday of the month, from today on").

Monthly offers only *which* occurrence, never which weekday: the weekday comes from the date field above. Letting both be picked makes "the 2nd Saturday" selectable on a Tuesday — a rule that contradicts the day it is attached to, and one its own anchor would never match. For the same reason the preset seeds itself from the date in the form, so choosing Monthly on the 2nd Saturday means exactly that rather than a default to correct.

A stored fifth weekday collapses to **Last**. "The 5th Saturday" silently skips every month that has only four, which is never what someone picking it meant.

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

The in-progress range previews as `.day-column__draft` — a dashed Ink outline over a Hover Surface fill, labelled with its length. It is a proposal, so it uses the same neutral wash a drop target does rather than a color of its own. A press with no travel still creates at the default length, resolved in `pointerup`; there is no separate `onClick`, which would double-fire.

### Free Slots
The inverse of the schedule, and the question a time-blocker actually asks: not "what is on today" but "where can this go". A row of pill buttons under the day's head, each a real gap of 30 minutes or more; clicking one creates a task there. Events count as busy even though they never count as planned work.

### Time-Grid Block (signature component)
The calendar's own vocabulary for a scheduled task, and the one place a colored border appears anywhere in the system. A `.block` gets a 3px left border in the task's own tag color, a matching 15%-tint background (`color-mix(in srgb, var(--tag) 15%, var(--surface-1))`), and 3px corners. This is functional color-coding for the task's category, not a decorative accent — it is the one sanctioned exception to "no colored left borders," confirmed for this component alone and not a pattern to extend to generic cards or list items. A repeating occurrence adds a small repeat icon after its time label; a completed block drops its border and gets a strikethrough title.

## Do's and Don'ts

### Do:
- **Do** keep the interface at zero accent color. Every interactive or selected state signals through Ink Invert (fill Ink, text Paper) or a neutral surface-step — never a hue. Color stays reserved for a user's own tag or a system status.
- **Do** give hover/active feedback with a background-color step (Panel → Hover Surface → Sunken Surface) on any control that has a fill to begin with, or a border-color step (Hairline → Baseline) on an unfilled card — never a shadow, lift, or scale transform.
- **Do** pair any tag color with a visible text label. Never let color alone carry information.
- **Do** reuse the toggle-chip idiom (neutral pill at rest → Ink Invert fill when selected) for any new "pick one or more from a small set" control, rather than inventing a new selected-state treatment.
- **Do** resolve a tag's color through the `--tag` custom property and a themed `var(--tag-*)` token, never an inline hex — the only way a component works correctly in both themes.
- **Do** declare a dark-mode color in both the `prefers-color-scheme` media query and the `[data-theme="dark"]` scope, so the manual toggle always overrides the OS default.
- **Do** draw a new icon in `src/components/icons.jsx`'s existing grammar (24×24, 2px `currentColor` stroke, round caps/joins) rather than reaching for a Unicode character.
- **Do** reuse the load-indicator's 10-hour reference and color logic (Ink → Critical) for any new "how full is this day" treatment, rather than inventing a second capacity number.
- **Do** reuse Glow Neutral and Dot Color for any future decorative echo of the Dashboard hero glow, rather than picking a new tint by eye.
- **Do** treat dark as the default a new visitor sees; test new work there first, then confirm light still holds — not the other way around.
- **Do** distinguish an event from a task by **shape and fill**, never by a new hue: a bar with no checkbox and no tag stripe, against a chip or block that has both. There is still no accent to reach for.
- **Do** name a specific drag MIME type (`DRAG_TASK` or `DRAG_EVENT`) on every drop target. A target opts into what it accepts by which type it checks, which is what makes it *impossible* to drop an event on the inbox — rather than merely wrong.
- **Do** use `packSpans` for any new "things that cover a range of days" surface, rather than writing a second lane packer.
- **Do** use Pointer Events for a new gesture that only manipulates something in place, and leave HTML5 drag-and-drop to gestures that actually transfer an item between containers.

### Don't:
- **Don't** add a saturated accent color anywhere outside the validated 8-slot tag palette.
- **Don't** use a Unicode glyph or emoji standing in for an icon. Every icon in the app is drawn, in the one shared grammar — a text character reads as a placeholder the moment it sits next to a real icon. The Google mark on the Auth Shell's OAuth button is the sole, deliberate exception (a real third-party brand mark, not a UI icon).
- **Don't** let the Auth Shell's zero-card structure — the topbar rule, the single column divider, the corner-tick frame — leak into the rest of the app, or give a regular `.card` a topbar/corner-tick treatment of its own. The rest of the app still draws its cards with a hairline border; only the Auth Shell goes further and drops the border around whole sections too.
- **Don't** add a colored left border, top border, or accent stripe to a generic card, list item, or callout. The Time-Grid Block's left border is functional tag-color coding on the app's signature calendar element — it does not generalize to anything else.
- **Don't** reach for a shadow as hover feedback or as card decoration. Shadow is reserved for content that floats above the page's own layer (modal, dropdown).
- **Don't** borrow a display or serif typeface for emphasis, anywhere — including the Auth Shell. Voice comes from size, weight, and tracking within Space Mono alone, from the Dashboard's hero number down to the sign-in headline. An earlier Instrument Serif exception on `.auth-hero__title` was retired for exactly this reason: two typefaces on one screen read as two voices, not one considered pairing.
- **Don't** add a second decorative background effect. Glow Neutral and the dot-grid are the one motif; a new surface doesn't get its own new pattern.
- **Don't** set tabular numerals on a standalone figure. Tabular spacing is for aligned columns only.
- **Don't** let an event into `dayStats`, `overdueTasks`, `upcomingTasks`, `tagBreakdown`, or any completion rate. Events are commitments, not work: counting a three-day conference as seventy-two planned hours would make the completion rate a ratio against things that cannot be completed. `tasksOn(key)` stays task-only permanently — views compose it with `eventsOn(key)` themselves.
- **Don't** give events a second load bar or capacity meter. A count beside the existing bar is the legal move; a second number answering "how full is this day" would contradict the first.
- **Don't** nest a pointer-driven control inside an element carrying `draggable`. Native `dragstart` fires on press-and-move regardless of pointer capture and will win the race.
- **Don't** slice a multi-day event into per-day pieces to fit an existing per-day renderer. All-day or spanning means a bar; only a single-day timed event belongs in the time grid.
- **Don't** let a multi-day event carry a repeat rule. This is the same objection as the line above, one level up: an occurrence of a spanning event would have to carry its own length, and "which day of which occurrence did you grab" becomes live for the lane packer and every drag path. A single-day occurrence collapses `startDate` and `endDate` onto the day it lands on, which is what keeps expansion trivial. Enforced in the editor *and* in `normalizeEvent`, so a hand-edited document cannot smuggle one past the UI.
- **Don't** add an end date or an interval ("every 2 weeks") to a recurrence rule. A personal planner's repeats are habits: a habit ends by being deleted, not by running out, and the two rule shapes cover every pattern asked for so far. Every extra field is one more thing `occursOn` must answer on every day of every rendered month.
