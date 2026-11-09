# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single person managing their own day: the owner-operator, signed in via Google or a username/password account. There is no team, org, or shared-workspace concept — the data model is a private per-account Firestore tree, and every view assumes one person's own tasks. Confirmed: personal use only, not built for multiple people to see or coordinate each other's schedules.

## Product Purpose

A personal time-blocking planner. A task can sit in an inbox with no time at all; "planning" means giving it a real slot on a real day. Afterward, Dashboard's Trends section shows planned versus completed, so the user can see where the hours actually went. Alongside the planner, a **Journal** holds the freeform side of a day — plain notes, written the way one writes in a word processor.

## Positioning

Unlike a due-date to-do list, every actionable task in Cadence eventually gets a real block of calendar time (a day plus a start minute), not just a deadline. The loop is closed by Dashboard's Trends section, which compares what was planned against what was actually completed — most planners stop at scheduling and never show the gap.

## Operating Context

Used solo, in-browser, as part of a personal daily/weekly planning ritual — not in a shared or meeting context. Offline-capable: `persistentLocalCache` keeps the working set in IndexedDB, so the app opens instantly on reload, keeps working with no connection, and queues writes until it returns.

## Capabilities and Constraints

- The planning views: **Dashboard** (today's summary/stats, a mini calendar showing per-day load density, plus a Trends section — planned vs. completed over a 7/30-day range), **Day** (a time grid or a chronological agenda, whichever you pick, plus a free-slot finder and the inbox), **Week** (7-column time grid with a spanning all-day row; drag down a column to block out time, drag a block's edges to resize it), **Month** (calendar grid with multi-day event bars and a day-peek popover).
- **Editing blocks on a touch screen is deliberate.** With a mouse a block is dragged to move and its edges dragged to resize. On a touch screen neither happens by touching: a scroll or a long look must never change a time, so a block is *held* for about half a second to arm it, and only then dragged (the body to move it, a grip to resize it). Every move or resize offers Undo. On a phone the Week tab is a seven-day overview (a tap on a block says what it is) and the Month is a map of dots; the Day tab and a tap on a day are where the detail is. The Day and Week grids show the whole day, 12 AM to 11 PM, and open at the current time (or the first task of another day).
- Sign-in: Google, or username/password (username resolves to a real email under the hood; Firebase Auth has no native username concept). That resolution requires an unauthenticated, public `get` on `usernames/{username}` (see `firestore.rules`), which means the associated email is readable by anyone who knows or guesses a username — `list` is denied, so the namespace itself can't be enumerated, but a known username's email is not private. This is an accepted trade-off, not an oversight: removing it would need a server-side resolver (a Cloud Function), which this client-only architecture doesn't have.
- Tags are color-coded categories from a validated, colorblind-safe palette (eight validator-checked hues, plus four appended hues for accounts that outgrow eight), stored as a color *slot name* (not a hex) so light and dark themes each get a correctly-stepped color. Three light-mode slots fall under 3:1 contrast, so color is never the only signal — a text label always accompanies a tag color.
- Data lives in Firebase Firestore behind one `onSnapshot` listener sliced in memory — sized for a personal scheduler (hundreds of documents), not built to scale to a shared or high-volume dataset.
- `date` is stored as a `'YYYY-MM-DD'` string and `startMin` as an integer count of minutes from local midnight — deliberately not a Timestamp, so a block's wall-clock time survives timezone/DST changes instead of silently drifting.
- **Events** are a second, distinct kind of item alongside tasks: they happen rather than get done. An event has a start and end *date* (so it can run across several days), is either all-day or timed, carries a tag and notes — and has **no** done checkbox. A single-day event can repeat; a multi-day one cannot (see below). They live in their own `users/{uid}/events` collection, which is what keeps them structurally out of every task-shaped code path. **Events never count toward planned hours or any completion rate**: a three-day conference is a commitment, not seventy-two hours of work you failed to complete. They do count as busy time when the Day view looks for free slots.
- Keyboard shortcuts: `n` new task, `e` new event, `t` jump to today, `←`/`→` move the date cursor, `Esc` close a dialog. Inside a Journal note, `Ctrl/⌘ + /` lists the formatting shortcuts.
- The date cursor is restored from the last session and snapped forward if the day it points at has already passed — but only on load. A tab left open past midnight keeps the day you were looking at rather than jumping; `t` and the Today button are the way back.
- **Recurring events** are built, on the same contract as recurring tasks: one rule document, occurrences synthesised on read, a single day detached on edit. The earlier note here said this was deliberately not built because the contract "does not generalise to a span" — that objection was correct and is what draws the remaining line: **only a single-day event may repeat.** A repeating span would need each occurrence to carry its own length, and "which day of which occurrence did you grab" becomes a live question for the lane packer and every drag path. Stretching a repeating event across days drops its rule, enforced in the editor and again on read.
- Recurrence rules come in two shapes, shared by tasks and events: **weekly** on chosen weekdays (with Every day / Weekdays / Weekends / Pick days presets) and **monthly** on an nth weekday — "every second Saturday of the month", where the fifth collapses to *last* so a month with only four is never skipped. Neither has an end date; a repeat runs until deleted.
- Recurring tasks: a task can repeat daily, on weekdays, on weekends, on chosen weekdays, or on an nth weekday of the month, expanded from one document on read rather than stored per occurrence. Editing, completing, or deleting a single day detaches just that day; nothing else changes shape. No end date — a repeat runs until deleted.
- **Journal** (the nav entry directly under Focus): a list of notes (search, pin, Trash with Undo) and a **Today** button that opens or creates the note titled with today's date. A note is edited like a word-processor page — bold/italic/underline/strike, text colour and highlight, font and size, headings, bullets/numbers/checklists, alignment, line spacing, indent, links, quotes, code, tables and images — with a per-note **paper**: lined, dots, grid, graph, isometric, hexagons, music staff, handwriting, Cornell and more, each with editable paper, pattern and margin colours and optional snap-to-lines. A note can also hold **drawing boxes** (pen, highlighter, eraser; mouse, touch or stylus), print or save as PDF, and download as a web page or text. Notes are private to the account like everything else, work offline, autosave, and are included in Settings → Export / Import. Limits: a note's body is capped at about 950 KB (a warning from 750 KB) — images count toward it; a note is edited by one person at a time (last save wins, with a warning if another device saved first).
- **Settings** is a page, not a dialog (the sidebar's Settings link, the account menu on a phone, or the palette's "Open Settings"), with a side navigation of seven categories and one open at a time. **General**: landing view, week start, working hours, saved templates, installing the app. **Appearance**: theme. **Account**: photo, email, how you sign in, and deleting the account. **Tags**: add, rename, recolour, give an icon, nest under another tag, set a weekly goal, delete (its tasks are kept, untagged, with Undo). **Notifications**: how far ahead "starting soon" looks, push on this device, the daily digest email. **Keyboard**: rebindable single-key shortcuts. **Your data**: a JSON backup and restore (tasks, events, tags and Journal notes), plus one-way CSV and calendar (.ics) exports. Appearance, week start, landing view, working hours, shortcuts and which category was last open are remembered per device; the digest, photo and tags are per account. On a phone it is two screens: a list of the seven categories, then the chosen category with a Back button. Account and Tags used to be dialogs of their own.
- Deliberately not built in the Journal: comments or tracked changes, headers/footers and page breaks, find-and-replace, `.docx` export, shared editing, drawing freely over text, and anything in the mobile app.

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
6. **A note is the writer's.** In the Journal, paper, ink and typeface are the writer's choices; the toolbar and list around a note stay as neutral as the rest of the app. And a note is never overwritten by a copy that failed to load — an unreadable note opens read-only, not empty.

## Accessibility & Inclusion

The tag palette is validated for color-vision deficiency: worst adjacent ΔE is 9.1 (light) / 8.4 (dark). Because some light-mode tag slots sit under 3:1 contrast, anything wearing a tag color also carries a visible text label.

The Journal's toolbar is a single tab stop with arrow-key movement between its controls, every toggle reports `aria-pressed`, every control shows its shortcut, and `Esc` leaves the editor so `Tab` is never a trap. The default paper and ink are the app's own validated pair; on a paper the writer colours, the text ink is chosen by WCAG luminance so it stays readable. Colours a writer picks for individual words (text colour, highlight) are their own choice and are not contrast-checked — the highlight keeps the text's own colour so marked text stays readable on any paper.
