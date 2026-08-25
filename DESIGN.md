---
name: Cadence
description: A quiet, restrained personal time-blocking planner — one accent color, flat neutral surfaces, no decoration
colors:
  signal-blue: "#2a78d6"
  signal-blue-soft: "#cde2fb"
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
typography:
  display:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "52px"
    fontWeight: 650
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  display-sm:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "42px"
    fontWeight: 650
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  stat:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "28px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  signin-mark:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "34px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
  headline:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  unit:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
  mark:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
  subtitle:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "normal"
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  icon:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  ui:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  meta:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 450
    lineHeight: 1.3
    letterSpacing: "normal"
  caption:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 450
    lineHeight: 1.3
    letterSpacing: "normal"
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.04em"
  micro:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "normal"
rounded:
  micro: "2px"
  xs: "3px"
  tight: "4px"
  sm: "6px"
  md: "10px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.signal-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "7px 14px"
  button-primary-hover:
    backgroundColor: "{colors.signal-blue}"
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
    backgroundColor: "{colors.signal-blue}"
    textColor: "#ffffff"
---

# Design System: Cadence

## Overview

**Creative North Star: "The Quiet Instrument"**

Cadence is a precise, unshowy tool that does one job well: turn a list of tasks into real blocks of a real day, and show you afterward what actually happened. Nothing in the interface performs for attention — there is one accent color, used sparingly, and everything else is neutral. Restraint is the point, not a placeholder for a bolder pass that never came.

The system is quiet, precise, and unshowy by deliberate choice. Its confirmed anti-reference is the gamified productivity app: no streaks, no confetti, no badges, no cheerful mascot nudging you back in. The interface stays out of the way of the work it's tracking — feedback is a background-color step, not a celebration.

**Key Characteristics:**
- One accent (Signal Blue), everything else neutral — a Restrained color strategy, not a themed one
- Flat by default: depth comes from stacked neutral surfaces and hairline borders, almost never from shadow
- The OS system font throughout, at every scale including the largest number on screen — no display face is ever borrowed for drama
- A validated, colorblind-safe 8-color palette for user data (tags), kept strictly separate from the one UI accent
- A single reusable "selected" idiom (neutral pill → filled Signal Blue pill) used everywhere something toggles

## Colors

The palette is almost entirely neutral. Signal Blue is the one color that means "this is interactive, active, or now" — everywhere else, color belongs to the user's own tags or to a status.

### Primary
- **Signal Blue** (`#2a78d6`): The only accent in the system. Marks the one thing that matters on a screen — primary buttons, the active sidebar link, today's date, the drag/drop-target highlight, the focus ring, and the "done" series in every chart. It appears on well under 10% of any given screen.
- **Signal Blue Soft** (`#cde2fb`): The planned-but-not-done half of a chart bar, and the today-drop tint. A pale wash of the same hue, never a second color.

### Neutral
- **Paper** (`#f9f9f7`): The page background — the surface everything else sits on top of.
- **Panel** (`#fcfcfb`): Card and control surface, one step lighter than Paper so a card reads as "raised" through color alone, with no shadow doing the work.
- **Hover Surface** (`#f2f1ed`): The one hover/active feedback color for buttons, list rows, and nav links. Every interactive rest-state uses Panel; every interactive hover-state uses Hover Surface. That swap is the entire feedback vocabulary.
- **Sunken Surface** (`#edece7`): Recessed content — inline `code`, the count pill, a progress track, an out-of-month calendar cell.
- **Ink** (`#0b0b0b`): Primary text.
- **Soft Ink** (`#52514e`): Secondary text — labels, metadata, supporting copy.
- **Faint Ink** (`#898781`): Muted text — hints, placeholders, timestamps, empty-state copy.
- **Hairline** (`rgba(11, 11, 11, 0.10)`): The only border color in the system, at one low alpha. Structure comes from this line plus a surface-color step, never from a heavier stroke.
- **Gridline** (`#e1e0d9`): A second, slightly firmer hairline reserved for the time grid and month grid — dense repeating structure that needs to read at a glance without competing with content borders.

### Tertiary
The categorical and status colors — data the user assigns or the app reports, never chrome.

- **The eight tag colors** (`tag-blue` `#2a78d6`, `tag-orange` `#eb6834`, `tag-aqua` `#1baf7a`, `tag-yellow` `#eda100`, `tag-magenta` `#e87ba4`, `tag-green` `#008300`, `tag-violet` `#4a3aa7`, `tag-red` `#e34948`): A validated, colorblind-safe categorical palette (worst adjacent ΔE 9.1 light / 8.4 dark). Handed out to new tags in this fixed order, never chosen freely — the order is the safety mechanism. Stored as a slot name, never a hex, so light and dark themes each get their own correctly-stepped value.
- **Good** (`#0ca30c`) / **Warning** (`#fab219`) / **Serious** (`#ec835a`) / **Critical** (`#d03b3b`): System-reported state, not user choice. Always shipped with an icon or label — never the only signal.

### Named Rules
**The One Accent Rule.** Signal Blue is the only saturated color used for UI meaning. A new interactive state does not get a new color; it gets a Signal Blue treatment or a neutral one.

**The Label-Not-Just-Color Rule.** A tag color is never the only signal. Three tag slots fall under 3:1 contrast on the light surface, so anything wearing a tag color also carries a visible text label.

**The No-Auto-Flip Rule.** Dark mode is a hand-chosen set of values, not a computed inversion. Every dark-mode color is declared twice — once under `@media (prefers-color-scheme: dark)` for the OS setting, once under `[data-theme="dark"]` for the in-app toggle — so the explicit choice always wins over the system default. No color's only definition ever lives inside a media query.

## Typography

**Body Font:** system-ui, -apple-system, "Segoe UI", sans-serif
**Display Font:** the same stack, distinguished only by size, weight, and tracking

**Character:** One typeface for the whole product, including the largest number on screen. Voice comes from scale and weight, never from switching families — the system deliberately refuses a "display font moment."

### Hierarchy

The scale is dense rather than a handful of marketing-style jumps — sixteen steps, each earned by one specific, named use, from a 10px numeral to a 52px hero. Nothing here is decorative; every step is a real component doing real work at that size.

- **Display** (650, 52px, 1.05 line-height, −0.03em tracking): The Dashboard's hero number (hours planned today) — the one place the type gets loud.
- **Display Sm** (650, 42px): The same hero number, stepped down at the 640px breakpoint.
- **Stat** (650, 28px, −0.02em tracking): A stat tile's headline figure (Open today, Overdue, Done this week).
- **Signin Mark** (400, 34px): The large glyph on the sign-in screen.
- **Headline** (650, 22px, −0.02em tracking): Screen-level titles on the sign-in and setup screens.
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

A fixed 232px sidebar (sticky, its own scroll) plus a centered content column capped at 1320px, padded 20px/24px/64px (top/sides/bottom). The base unit is the `.card`: a Panel-colored, 16px-radius, 18px-padded container — nearly every screen is a stack or grid of cards.

Two responsive breakpoints, both collapsing structure rather than just shrinking it:
- **900px** — the sidebar becomes a wrapping top bar (brand + new-task on one row, icon-only nav on the next, in the same markup — no duplicated JSX, just a flex-direction flip); the Day view's two-column layout (grid + inbox) collapses to one column.
- **640px** — tighter page padding, the hero number steps down to 42px, paired form fields stack to one column, cards lose 4px of padding.

Grids follow content, not a fixed column count: the stat-tile row and chart row both use `repeat(auto-fit, minmax(…, 1fr))` so they reflow rather than break. The time grid is the one true fixed grid — a 60px gutter plus 7 equal day columns (1 on the Day view), scaled by a single `--hour-height` variable.

## Elevation & Depth

Flat by default. Depth is conveyed almost entirely by stacking neutral surfaces — Paper → Panel → Hover Surface → Sunken Surface — plus a single hairline border, not by shadow. Hover and active feedback is a background-color step; nothing lifts, scales, or gains a shadow on interaction.

### Shadow Vocabulary
- **Ambient** (`0 1px 2px rgba(11,11,11,0.06)`): The one shadow every `.card` carries at rest — barely perceptible, present only to separate a panel from the page underneath it.
- **Floating** (`0 6px 24px rgba(11,11,11,0.08)`): Reserved for content that genuinely floats above the page: the modal panel, the notification dropdown, an active auth tab.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. A shadow appears only on content that floats above the page's own stacking order (a modal, a dropdown) — never as decoration on a card, and never as hover feedback.

## Shapes

A core three-step radius scale — 6px / 10px / 16px — that covers every control and card, plus a set of smaller steps that shrink in step with the element: 4px on chip-like marks (blocks, chips, the month-cell add button), 3px on tight inline pills under 20px tall (the drag-hover time tooltip), and 2px on the smallest marks of all — a 9–10px legend swatch or tag-bars dot, where anything larger would read as a circle rather than a softened square. A full 999px pill closes the scale for anything circular or fully rounded (badges, the avatar, filter chips). The rule underneath all of it: radius shrinks with the element, never stays fixed regardless of size. Every corner is soft and uniform; nothing is cut, asymmetric, or sharp. Borders are hairline (1px, 10% alpha) throughout — the system never reaches for a heavier stroke to add emphasis.

## Components

### Buttons
- **Shape:** 6px radius, always.
- **Primary:** Signal Blue fill, white text, 7px/14px padding, 550-weight label. `filter: brightness(1.07)` on hover — the one button that brightens rather than swaps surface.
- **Ghost:** Transparent at rest, Hover Surface on hover, Soft Ink → Ink text. The default for every secondary action.
- **Danger:** Transparent, Critical-Text colored, a faint Critical-tinted wash on hover. Reserved for destructive actions (delete task, delete series).
- **Icon:** 30×30px, transparent, Hover Surface on hover — theme toggle, notification bell, close (✕).

### Chips
- **Toggle chip** (`.filter-chip`, `.weekday-picker__day`): The system's one reusable "selected" idiom. At rest: Panel background, hairline border, Soft Ink text. Selected: Signal Blue fill, white text, no border needed. Used for the Review date-range picker, the repeat-frequency picker, and the weekday picker — same visual contract everywhere something is chosen from a small fixed set.
- **Tag chip:** A small colored dot (7px, from the tag's own `--tag` custom property) plus a text label — never the dot alone.
- **Calendar chip** (`.chip`, month view / week all-day row): Hover Surface background, 4px radius, truncates with ellipsis; a done chip drops to 55% opacity with a strikethrough.

### Cards / Containers
- **Corner Style:** 16px radius (`{rounded.lg}`).
- **Background:** Panel.
- **Shadow Strategy:** Ambient only — see Elevation & Depth.
- **Border:** 1px Hairline.
- **Internal Padding:** 18px (14px at the 640px breakpoint).

### Inputs / Fields
- **Style:** Panel background, 1px Hairline border, 6px radius, 7px/10px padding.
- **Hover:** Border steps to the slightly firmer Baseline tone (`#c3c2b7`) — a hint before focus, not a color change.
- **Focus:** A 2px Signal Blue outline with 2px offset, applied globally via `:focus-visible` — every focusable element in the app gets the identical ring, never a per-component reinvention.
- **Disabled:** 55% opacity, `cursor: not-allowed`.

### Navigation
- **Style:** A vertical list of full-width, left-aligned rows (14px text, 500 weight, Soft Ink), 6px radius, no visible rest-state chrome.
- **Hover:** Hover Surface background, text steps to Ink.
- **Active:** A 12%-opacity Signal Blue tint background with Signal Blue text and 600 weight — the only nav state that uses the accent.
- **Mobile (≤900px):** Collapses to an icon-only horizontal row; labels move to a visually-hidden span plus a `title` tooltip, so the same markup serves both breakpoints.

### Time-Grid Block (signature component)
The calendar's own vocabulary for a scheduled task, and the one place a colored border appears anywhere in the system. A `.block` gets a 3px Signal-Blue-position left border in the task's own tag color, a matching 15%-tint background (`color-mix(in srgb, var(--tag) 15%, var(--surface-1))`), and 4px corners. This is functional color-coding for the task's category, not a decorative accent — it is the one sanctioned exception to "no colored left borders," confirmed for this component alone and not a pattern to extend to generic cards or list items. A repeating occurrence adds a small ↻ mark after its time label; a completed block drops its border and gets a strikethrough title.

## Do's and Don'ts

### Do:
- **Do** keep the interface to one accent color, Signal Blue (`#2a78d6`). Every other color is neutral, a user's own tag, or a system status.
- **Do** give hover/active feedback with a background-color step (Panel → Hover Surface → Sunken Surface), never a shadow, lift, or scale transform.
- **Do** pair any tag color with a visible text label. Never let color alone carry information.
- **Do** reuse the toggle-chip idiom (neutral pill at rest → Signal Blue fill when selected) for any new "pick one or more from a small set" control, rather than inventing a new selected-state treatment.
- **Do** resolve a tag's color through the `--tag` custom property and a themed `var(--tag-*)` token, never an inline hex — the only way a component works correctly in both themes.
- **Do** declare a dark-mode color in both the `prefers-color-scheme` media query and the `[data-theme="dark"]` scope, so the manual toggle always overrides the OS default.

### Don't:
- **Don't** add a second saturated accent color outside the validated 8-slot tag palette.
- **Don't** add a colored left border, top border, or accent stripe to a generic card, list item, or callout. The Time-Grid Block's left border is functional tag-color coding on the app's signature calendar element — it does not generalize to anything else.
- **Don't** reach for a shadow as hover feedback or as card decoration. Shadow is reserved for content that floats above the page's own layer (modal, dropdown).
- **Don't** borrow a display or serif typeface for emphasis. Voice comes from size, weight, and tracking within the one system-font stack — including the Dashboard's hero number.
- **Don't** set tabular numerals on a standalone figure. Tabular spacing is for aligned columns only.
