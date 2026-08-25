# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single person managing their own day: the owner-operator, signed in via Google or a username/password account. There is no team, org, or shared-workspace concept — the data model is a private per-account Firestore tree, and every view assumes one person's own tasks. Confirmed: personal use only, not built for multiple people to see or coordinate each other's schedules.

## Product Purpose

A personal time-blocking planner. A task can sit in an inbox with no time at all; "planning" means giving it a real slot on a real day. Afterward, Dashboard's Trends section shows planned versus completed, so the user can see where the hours actually went.

## Positioning

Unlike a due-date to-do list, every actionable task in Cadence eventually gets a real block of calendar time (a day plus a start minute), not just a deadline. The loop is closed by Dashboard's Trends section, which compares what was planned against what was actually completed — most planners stop at scheduling and never show the gap.

## Operating Context

Used solo, in-browser, as part of a personal daily/weekly planning ritual — not in a shared or meeting context. Offline-capable: `persistentLocalCache` keeps the working set in IndexedDB, so the app opens instantly on reload, keeps working with no connection, and queues writes until it returns.

## Capabilities and Constraints

- Four views: **Dashboard** (today's summary/stats, plus a Trends section — planned vs. completed over a 7/30-day range), **Day** (agenda + inbox), **Week** (7-column time grid), **Month** (calendar grid).
- Sign-in: Google, or username/password (username resolves to a real email under the hood; Firebase Auth has no native username concept).
- Tags are color-coded categories from a validated, colorblind-safe 8-color palette, stored as a color *slot name* (not a hex) so light and dark themes each get a correctly-stepped color. Three light-mode slots fall under 3:1 contrast, so color is never the only signal — a text label always accompanies a tag color.
- Data lives in Firebase Firestore behind one `onSnapshot` listener sliced in memory — sized for a personal scheduler (hundreds of documents), not built to scale to a shared or high-volume dataset.
- `date` is stored as a `'YYYY-MM-DD'` string and `startMin` as an integer count of minutes from local midnight — deliberately not a Timestamp, so a block's wall-clock time survives timezone/DST changes instead of silently drifting.
- Keyboard shortcuts: `n` new task, `t` jump to today, `←`/`→` move the date cursor, `Esc` close a dialog.
- Recurring tasks: a task can repeat daily, every weekday, or on chosen weekdays, expanded from one document on read rather than stored per occurrence. Editing, completing, or deleting a single day detaches just that day; nothing else changes shape. No end date — a repeat runs until deleted.
- Deliberately not yet built: browser reminders, JSON export.

## Brand Commitments

Name: **Cadence** (renamed from a generic "Scheduler" working title). Mark: a drawn clock icon (`ClockIcon`, part of the app's own small stroke-icon set), used in the sidebar brand lockup and on the sign-in screen.

## Evidence on Hand

None — personal project, no testimonials, case studies, or third-party proof to draw on.

## Product Principles

1. **Time-blocking over due-dates.** A task isn't "planned" until it has a real slot on a real day — a deadline alone doesn't count.
2. **The inbox is a legitimate resting state.** Tasks aren't forced onto the calendar before they're ready to be scheduled.
3. **Closing the loop matters.** Dashboard's Trends section exists so planning has a visible consequence: what you actually did versus what you meant to do.
4. **Personal-scale simplicity.** One listener, no sharing/team model, optimized for one person's hundreds of documents — not enterprise scale.
5. **Color-code responsibly.** Tag color is validated for accessibility and never carries meaning alone; a label is always present too.

## Accessibility & Inclusion

The tag palette is validated for color-vision deficiency: worst adjacent ΔE is 9.1 (light) / 8.4 (dark). Because some light-mode tag slots sit under 3:1 contrast, anything wearing a tag color also carries a visible text label.
