# Cadence

A time-blocking planner. Tasks can sit in an inbox with no time at all, and
"planning" means giving one a real slot on a real day — then seeing, afterwards,
where the hours actually went.

The views: **Dashboard** (today's snapshot, plus a Trends section — planned
versus completed over the last 7 or 30 days), **Schedule** — **Day** (agenda +
inbox), **Week** (7-column time grid), **Month** (calendar grid) and **Review** —
**Focus** (a pomodoro timer), **Journal**: simple notes with Word/Docs-style
editing, editable paper, tables, images and drawing boxes (see
[The Journal](#the-journal)) — and **Settings**, a page of its own with a side navigation of categories —
General, Appearance, Account, Tags, Notifications, Keyboard and Your data —
reached from the sidebar, the account menu on a phone, or the command palette.

Built with React 19 + Vite, data in Firebase Firestore. Sign in with Google, or
with an email address and password.

## Setup

The app needs a Firebase project before it will do anything — until then it
renders setup instructions instead of a blank page.

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. **Authentication** → Sign-in method → enable **Google** *and* **Email/Password**
   — both, not just one, or the matching sign-in path throws
   `auth/operation-not-allowed`
3. **Firestore Database** → Create database → **production mode**
4. **Project settings** → Your apps → add a **Web app**, copy the config
5. `cp .env.example .env.local` and paste the values in
6. Paste [`firestore.rules`](firestore.rules) into Firestore → **Rules** → Publish

If sign-in ever fails with **"Missing or insufficient permissions"**, it's
almost always step 6 — the rules were never published, so Firestore is still on
its production-mode default of denying everything.

```bash
npm install
npm run dev        # http://localhost:5173
```

The Firebase web config is **not a secret** — it ships in the client bundle by
design. `firestore.rules` is the actual security boundary, which is why step 6
is not optional. `.env.local` is gitignored regardless.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm run preview` | serve the built output |
| `npm run lint` | oxlint |
| `npm test` | pure-logic tests, on Node's built-in runner — no extra dependencies |
| `npm run test:dom` | vitest + jsdom — components and hooks that need a real DOM: dialogs' focus handling, and the Journal's editor, toolbar, autosave and drawing |
| `npm run test:functions` | the Cloud Functions' own tests (`functions/`) |
| `npm run test:rules` | `firestore.rules` against the Firestore emulator (`tests/rules/`) — needs JDK 21+; CI runs it |
| `npm run test:render` | smoke-renders every view against mock data |
| `npm run mcp:dev` | the MCP endpoint (`/mcp`) on `http://localhost:8787`, for the MCP Inspector — see [README-mcp.md](README-mcp.md) |
| `node tests/smoke/qa.mjs` | manual visual QA — screenshots a running `npm run dev` with a real browser; not part of `npm test`, not run in CI, needs `playwright` installed separately (see the comment at the top of the file) |

`test:render` exists because the app cannot start without a Firebase project, so
a plain build proves only that the modules parse. It server-renders all eleven
views against fixtures — overlapping blocks, an all-day item, a 5am block
outside the default window, an overdue task, an empty inbox — and asserts on the
markup. Effects do not run, so it is a render check; behaviour lives in
`tests/*.test.js`. The mocks are aliased in by `tests/smoke/vite.config.js`, so
no production module knows it is being tested.

## How the data is shaped

```text
users/{uid}                    profile — username (display name)  email  createdAt
                                 displayName  photoBase64  dailyDigestEnabled
users/{uid}/tasks/{taskId}
  title  notes  date  startMin  durationMin  tagId  done
  completedAt  createdAt  updatedAt
  recurrence  overrides

users/{uid}/tags/{tagId}
  name  slot  order

users/{uid}/journal/{noteId}   a note's metadata — title  excerpt  dayKey  pinned
  hasDrawing  bytes  paper  createdAt  updatedAt  deletedAt
users/{uid}/journal/{noteId}/content/body
  json  schemaVersion  updatedAt        the note's text, as one JSON string
```

Nothing lives outside `users/{uid}`. (A top-level `usernames` collection once
mapped usernames to emails for username sign-in; it is retired, unreadable by
the rules, and can be deleted from the console.)

Three task states fall out of two fields, with no extra flag to keep in sync:

| `date` | `startMin` | Means |
| --- | --- | --- |
| `null` | `null` | Unscheduled — lives in the inbox |
| set | `null` | All-day on that date |
| set | set | A real time block |

**`date` is a `'YYYY-MM-DD'` string and `startMin` an integer count of minutes
from local midnight — deliberately not a Timestamp.** A Timestamp is an absolute
instant, so a 9:00 block silently becomes 8:00 the moment a timezone or DST
boundary moves under it. "This day, this wall-clock time" is what a planner
actually means. It also makes day bucketing pure integer math and sorts
correctly as a string. `tests/date.test.js` pins this down.

**A repeating task is one document, expanded on read.** `recurrence` is
`{ days: [0..6], anchor }` — a set of weekdays plus the date it started from,
nothing else: no interval, no end date. `ScheduleContext` computes which days
a rule lands on for whatever range a view asks about; nothing is generated or
stored per occurrence. `overrides` is a sparse map from day key to either
`{ done, completedAt }` (that day ticked off) or `{ detached: true }` (that
day removed from the rule because it was edited or deleted individually).
Editing one day writes it out as an ordinary task of its own and marks the
day taken — "just this occurrence" falls out of that split for free, and the
rule document never has to change shape because one morning did.
`tests/recurrence.test.js` covers the expansion.

**`tags` store a colour *slot name*, not a hex.** Light and dark need different
steps of the same hue, and one stored hex could only ever satisfy one of them.
The slot maps to a `--tag-*` token in `src/styles/tokens.css`.

## Notable decisions

**One listener, not many.** `ScheduleContext` opens a single `onSnapshot` over
the whole `tasks` collection and slices it in memory. A personal scheduler is
hundreds of documents, so this buys instant view switching with no composite
indexes and no refetch on navigation. If a collection ever passes a few thousand
tasks, swap in a date-range query — that is the point to revisit, not before.

**Optimistic updates are free.** Firestore's `onSnapshot` fires immediately from
the local cache including pending writes, so there is no local reducer mirroring
server state — which is where this kind of app usually rots.

**The phone layout is CSS over one DOM, plus three small pieces.** Below 900px the
app is laid out for a thumb (see DESIGN.md), and the rule that keeps it
maintainable is the one the rest of the app follows: **the tree does not branch on
the viewport**. A control that only exists on a phone (the bottom bar's +, a page's
tab row) is in the document at every width and `display: none` above its
breakpoint; a pane that is hidden on a phone is still rendered. What has to be
script is in three places. `PaneTabs` is the one tab row (a real tablist with arrow
keys) used by the Dashboard, the Day page, Focus and sign-in; the page's own
stylesheet shows one pane from a `data-pane` on its container, and the row goes in
a band of its own *above* a `.stack` or `.divided-row` layout, never inside it,
because those rules treat a first child as the first column. `useModalA11y` — which
every dialog already uses — gives every dialog the two things only a script can: it
writes the keyboard's height (from `visualViewport`) to `--keyboard-inset` so a
bottom sheet stands clear of it, and it adds swipe-down-to-close on the head,
refused whenever Escape is. And `DockedLayer` draws a docked menu on `<body>`:
`position: fixed` leaves a parent's box but not its stacking context, and the page's
content sits below the fixed tab bar's, so a sheet opened from inside content
(the Journal's ⋯ menu) was painted under it. Anything fixed to the bottom or pinned
under the top bar uses `--tabbar-h` / `--topbar-h` (62px each, set on `.app-shell`
at 900px and under) rather than a copied number. What a screenshot cannot be
replaced by is a test of *which pane is showing* — that is the stylesheet — so the
tests pin the rows, the state, the wiring and the behaviour, and the look is
checked in a phone-sized browser, dark first.

**Back is a stack of layers, not a route.** There is no router (the page you are
on is remembered state), so nothing gave the Back button anything to step
through and it left the app from under an open dialog. `src/lib/backStack.js`
fixes that without introducing URLs: each open dialog, popover, Journal note,
Settings screen or drill-down is a *layer* that owns one same-URL `pushState`
entry, and Back closes the topmost. Three choices are worth knowing before
touching it. Layers stack by **rank** (`BACK_RANK`), not by when they registered,
because React runs a child's effects before its parent's. The depth is read from
`history.state`, never counted, and changes are applied once per microtask, so
React StrictMode's mount/unmount/mount and one dialog handing over to another
cost no history at all. And closing a layer from the UI removes its entry with
`history.go()`, whose `popstate` the stack recognises as its own rather than as a
Back press. One known limit: `history.state` survives a reload, so reloading with
something open leaves one stale entry behind the page; the stack resets the
entry it is standing on, but cannot remove the one below, so a single Back
reloads the app before the next leaves it. A new dialog gets all of this by using
`useModalA11y`; anything else that should close on Back calls `useBackLayer`.

**Ask AI keeps the time you state, and the model never does the arithmetic.**
`api/ai-schedule.js` used to keep a time only if the whole block fit inside one
of the free windows sent with the request, so any overlap with something already
booked — or a time in a day's third gap, which was never sent — quietly became a
task with no time. Now the model copies the time as `"HH:MM"` (`startTime`) and
`parseClock` converts it; every time in the prompt is printed the same way,
because turning "7:30pm" into `1170` and comparing it with ranges printed as
`540-600`, deep in a long prompt, is where a small model slipped. A stated time is
kept as given, a missing length becomes the default, a missing day becomes today
(or tomorrow, once the time has passed), and a value that could not be used is
listed in the item's `issues` and said out loud by the chat instead of vanishing;
`skipped` counts what was dropped. The free windows are only a guide for a vague
phrase ("tomorrow afternoon"), and the chat warns about a clash rather than
refusing one. The server cannot be exercised from a test (it needs a verified
account and a Gemini key), so what it asks of the model is pinned in
`tests/apiHandlers.test.jsx` and the numbers it does itself — parsing, defaults,
dates — are tested directly.

**Offline works.** `persistentLocalCache` keeps the working set in IndexedDB, so
the app opens instantly on reload, keeps working with no connection, and queues
writes until it returns.

**Timestamps are plain millisecond numbers.** `serverTimestamp()` resolves to
`null` in the local snapshot until the server acknowledges it, which makes
freshly-created tasks sort unpredictably and breaks ordering entirely while
offline. Every write comes from one person's own devices, so the client clock is
the right trade.

**Firestore documents are treated as untrusted.** `normalizeTask` /
`normalizeEvent` / `normalizeTag` (`src/lib/normalize.js`) coerce every field
on read, so one half-written document can never blank out a calendar.
Pulled out of `ScheduleContext.jsx` specifically so this layer is unit
tested on its own — `tests/normalize.test.js`.

**The tag palette is validated, not eyeballed.** The first eight colours are the
validated categorical order — every check passes against both surfaces (worst
adjacent CVD ΔE 9.1 light / 8.4 dark). The *order* is the colourblind-safety
mechanism, so new tags take the next unused slot. Four further hues
(cyan/lime/purple/slate) extend the menu past eight tags; they are picked for
separation, not validator-checked. Three light-mode slots sit
under 3:1 contrast, so anything wearing a tag colour also carries a visible text
label — never colour alone.

**Sign-in is by email, and the name typed at registration is only a display
name.** Username sign-in used to resolve a username to its email through a
publicly readable `usernames` collection, which meant anyone who guessed a
username could read that account's email address. It was removed rather than
patched. Every credential failure shows the identical "Incorrect email or
password," and the sign-up form doesn't confirm which addresses already have an
account.

**A new password account gets a verification email, and the server-side
features wait for it** — AI suggestions, push reminders and the daily digest
(`api/_lib/auth.js` checks `email_verified`; `functions/index.js` only mails a
verified Auth address). Everything that runs on the device works unverified,
with a banner offering to resend the link. Registration is open, so without this
an account made for someone else's address could use all of it. See
[Security](#security).

## The Journal

A page of notes — a list on one side, the open note on the other, and a **Today**
button that opens (or creates) today's note. The toolbar and
its keyboard shortcuts follow Docs: `Ctrl/⌘ + B / I / U`, `Ctrl/⌘ + Shift + 7 / 8 / 9`
for lists, `Ctrl/⌘ + K` for a link, `Ctrl/⌘ + \` to clear formatting; **`Ctrl/⌘ + /`**
inside a note lists them all, and `Esc` leaves the editor so `Tab` is never a trap. A note can
be printed or saved as PDF, and downloaded as a web page or as text. The
decisions underneath:

**A note is two documents, and its text is one string.** The list listens to
small metadata documents (title, excerpt, paper, flags); the body is a separate
document, read only for the note that is open. The body is the editor's document
serialized as **one JSON string**, not a nested map: Firestore rejects arrays
directly inside arrays and caps nesting at twenty levels, and a rich-text tree
(lists in lists, tables) hits both. A string also has an exact byte size to check
before a write — a warning at 750 KB, a refusal at 950 KB that keeps the text on
screen. It never truncates. `packages/shared/src/journal.js` normalizes
everything that crosses the boundary, the way `normalize.js` does for tasks.

**A note can belong to a day, and that is how it meets the planner.** The link is
the note's `dayKey` — the same `'YYYY-MM-DD'` a task's `date` is — and never an id,
because a backup import gives every note, task and event a new one; a renamed day
note is still found. `src/state/DayNotesContext.jsx` listens to the Journal's small
metadata documents for the whole shell (the very query the Journal page uses, so
no second read, and nothing from the editor leaves its chunk) and answers one
question: which days have a live note (`notesByDay` in `packages/shared`, which
agrees with `findNoteForDay` about which note a day means). From it, Day, a month
day's peek, the palette's agendas and the Dashboard get an **Open journal** /
**Write in journal** button (the Dashboard's is hidden on a phone, where the Journal is a tab in the bottom bar), and Week, Month and the mini calendar mark the day.
The button leaves an intent (`{ kind: 'day', dayKey }`) that `JournalView` runs
once its list has loaded — so a day is never given a second note because the list
was still arriving (Today used to do that if pressed in that moment). A day note
shows its day back: a band under the header with that day's tasks and events, where
ticking a task completes the real one. The `j` key and the palette's *Open the day's
journal note* open the note of the day on screen.

**A note can plan.** The toolbar's **Plan it** reads the note — or only the
selection — and proposes where its to-dos would go on the calendar, in the Day
view's *Plan my day* idiom: shown whole, nothing written until **Add N to
schedule**, one **Undo** for the batch. Two passes. The note's unchecked
checklist lines are shown at once and need no network (`uncheckedTaskLines`,
read with `parseQuickAdd`). Then, if the account may use AI, `/api/note-tasks`
reads the rest of the writing for what the writer means to do, and its list
replaces the first. The model only *finds* things: every field it returns is
rebuilt and range-checked on the server (a date must be a real day within a year),
and `placeNoteTasks` in `packages/shared` does the placing — a stated time is
kept, the rest is fitted around what is already there and around the other stated
times with the same `planDay` that backs *Plan my day*, never into the past, and a
task the day already has is shown but not ticked — so the model is never asked to
do arithmetic. An answer that arrives after Dismiss, or after a second press, is
discarded. Plan it is outside the toolbar's *More tools* so a phone has it too.
The same tools, in `NoteScheduleTools.jsx` (the one Journal file that knows about
the schedule): **Send to schedule** (only while the caret is in a checklist line),
and, in the day band, a quick-add line (`parseQuickAdd`, with "tomorrow" read from
the note's own day), **Move N unfinished to today / tomorrow** (not one day of a
repeating task), and **Copy the day into the note** — a copy, so ticking it in the
note does not change the schedule.

**A note that did not load cleanly is never saved over.** A body that cannot be
read, or was written by a newer build, opens read-only with the raw data
downloadable — the editor would otherwise open empty, and an autosave would
replace the real note with nothing. The same holds for a note whose text is not
in the offline cache yet. If another device saves while there is unsaved typing,
a banner asks *Load latest* or *Keep mine*; otherwise last write wins.

**"Saved" means the write was queued, not acknowledged.** The status line reads
Firestore's pending-writes flag — *Saved on this device — syncs when online* —
because awaiting the server would hang forever offline. Autosave waits for
0.8 s of quiet (never more than 4 s while typing) and also flushes on blur,
switching notes, closing, and the tab being hidden.

**Paper is CSS, not images.** Each pattern (lines, dots, grid, graph, isometric,
hexagons, music staff, handwriting, Cornell…) is a small SVG tile used as a CSS
`mask-image` painted with `--pattern-color`, so one mechanism covers every shape
and every colour change is live. Paper, dot, line and margin colours are the
writer's content, like a tag's colour; the toolbar around them keeps the app's
own colours (neutral, with the coral accent only for a pressed button).
Text can optionally snap to the lines (`line-height: round(up, …)`).

**A drawing is strokes, not a bitmap.** It is a block inside the note (so it
moves with the text, shares `Ctrl+Z`, and scales to any screen), in a logical
1000-unit-wide box. Strokes are simplified, delta-encoded and base64url'd — never
nested arrays — and drawn with `perfect-freehand`; pen pressure is honoured, a
resting palm is not.

**Images live inside the note.** Resized in the browser (at most 1400 px, a JPEG
under 450 000 characters) and stored in the body as data URIs, so the note stays
one atomic, offline-safe document. An image pasted in from a web page is dropped
at parse time — opening a note never fetches anything from another server.

**The editor is a lazy chunk.** `JournalView` loads on first open (and is
prefetched when the browser is idle and online), so the TipTap editor stays out
of the main bundle.

**Backups include it.** Settings → Export writes notes (bodies read on demand)
into the JSON file; Import adds them as new notes and skips, and counts, any it
cannot read. An export that could not read some notes says so instead of passing
for a full backup.

## Keyboard

| Key | Does |
| --- | --- |
| `n` | new task |
| `j` | open the Journal note of the day on screen (today, outside Day / Week / Month) |
| `t` | jump to today |
| `←` `→` | move the date cursor (day / week / month, by view) |
| `Esc` | close a dialog |
| `Ctrl/⌘ + /` | in a Journal note: the formatting shortcuts |

## Layout

```text
src/
  firebase.js            init, auth, Firestore + offline cache
  lib/                   browser adapters and hooks; the pure date, layout,
                         normalize, recurrence and stats logic lives in
                         packages/shared (below)
    useNow.js            live clock for the now-line
    backStack.js         the phone's Back button — layers that each own one history entry
    useBackLayer.js      how a dialog, popover, note or screen joins that stack
    appPath.js           which addresses are the app (`/`); anything else is the 404 page
    dotField.js          the 404 page's dot grid and ribbon — pure geometry, no canvas
    usePersistentState.js
    useModalA11y.js       shared focus-trap/restore/Escape contract for every dialog
    journalPaper.js      paper patterns, presets and the CSS they become
    ink.js               drawing strokes — encoding, smoothing, hit-testing, SVG
    journalExport.js     a note as a web page or plain text
    image.js             avatar and in-note image shrinking
  state/
    AuthContext.jsx      session, Google + username/password
    ScheduleContext.jsx  the single data seam
    ToastContext.jsx      transient "that write failed" surface
    ThemeContext.jsx     system / light / dark
    useJournal.js        the Journal's list, open note and actions
    journalData.js       where notes live in Firestore; purge, backup export/import
    DayNotesContext.jsx  which days have a Journal note — the calendars' marks and buttons
  components/
    icons.jsx            the one drawn icon set — shared by every group below
    auth/                SignIn, LoginForm, RegisterForm, PasswordField
    views/               the screens: Dashboard, TodayView, WeekGrid, MonthCalendar,
                         ReviewView, FocusMode, JournalView, SettingsView
    settings/            what Settings is made of: one component per category
                         (General, Account, Tags, …), sections.js, SettingsParts
    calendar/            the pieces those views compose — DayColumn, MiniCalendar,
                         DayPeek, TaskRow, TaskInbox
    editors/             every dialog that creates, edits, or deletes, plus the
                         controls only they use (RepeatPicker, EditorKindToggle)
    stats/               Dashboard's data display — StatTile, BarChart, TagBars
    shell/               chrome that belongs to no one view — NotificationBell,
                         SetupNotice, ToastStack, ErrorBoundary, NotFound (the 404
                         page) and its DotField canvas backdrop, CreateSheet (the
                         phone's centre +), PaneTabs (a phone's tab row over a
                         page's panes) and DockedLayer (a bottom sheet on <body>)
    journal/             the Journal: NoteList, NoteSurface (the open note),
                         EditorToolbar, PaperPicker, DrawingBlock, and extensions/
                         (the editor's own nodes and shortcuts)
  styles/
    tokens.css           design tokens, both themes
    shell.css             app shell, notifications, controls, profile, date nav,
                         frames & common bits, toasts
    auth.css              setup notice + the sign-in screen
    dashboard.css          Dashboard + its charts
    focus.css              Focus mode (the pomodoro timer view)
    journal.css            the Journal — loaded with its chunk, not the main bundle
    settings.css           the Settings page's navigation, panel and rows
    calendar.css           Day/Week time grids, Month grid, inbox & task rows
    modals.css              every dialog, its fields, tags, item index, repeat picker
    not-found.css           the 404 page (loaded last: it builds on auth.css and shell.css)
    toggles-responsive.css  filter chips/toggles + every ≤900px override
    calendar-dnd.css        drag-to-create/move/resize on the time grid
                         (split from one file, in original cascade order — see
                         the import comment in App.jsx)
packages/shared/         @cadence/shared — pure logic the web app, functions and
                         mobile app share (date, layout, normalize, recurrence,
                         stats, journal.js, …)
tests/                   pure-logic tests (date, layout, stats, normalize, …) —
                         plus the *.test.jsx component tests (vitest + jsdom, see
                         Scripts) and smoke/ (SSR render check + manual qa.mjs)
```

## Deploying to Vercel

[`vercel.json`](vercel.json) sets the build (`npm run build` → `dist`), a
catch-all rewrite to `index.html`, and cache headers: hashed `/assets/*` are
immutable for a year, `index.html` is `no-cache` so a deploy is picked up on the
next load. The rewrite is safe alongside those headers because Vercel matches
static files before rewrites — an existing asset is served, not rewritten.

The catch-all rewrite is also why there is a **404 page inside the app**: every
path without a dot is served `index.html`, so `App.jsx` checks the pathname
(`src/lib/appPath.js` — only `/` and `/index.html` are the app) and shows the
`NotFound` page for anything else, before Firebase or the sign-in gate. It is a
*soft* 404 — the response is still HTTP 200, since the rewrite is what served
it — and a path containing a dot (`/x.php`) never reaches the app at all and
gets Vercel's own plain 404. A true 404 status would need a second Vite entry
and a narrower rewrite; not done, because nothing here is indexed by search.

Two steps are **not** in the config, and sign-in fails without either:

1. **Set the env vars in the Vercel project** (Settings → Environment Variables)
   — all six `VITE_FIREBASE_*` keys from `.env.example`. `.env.local` is
   gitignored, so nothing carries them across on its own. They are baked into
   the bundle at build time, so a change needs a redeploy, not just a reload.
2. **Add the deployment domain to Firebase** → Authentication → Settings →
   Authorized domains. Google sign-in refuses to run on a domain that is not
   listed, and that includes every `*.vercel.app` preview URL you intend to sign
   in on.

Firestore rules are not deployed from here either — see step 6 of Setup.

**Push notifications** (reminders with the app closed or signed out) are an
optional extra with their own setup — an Upstash Redis database, a VAPID key
pair, and a once-a-minute cron call. See [README-push.md](README-push.md).
Nothing else needs it, and the app behaves exactly as before until it's set up.

**MCP server** (lets Claude, ChatGPT, Cursor or Gemini CLI read and update your
schedule by URL) is likewise optional: one account, a bearer key, a Firebase
service account. It stays off until configured. See [README-mcp.md](README-mcp.md).

## Security

What the app relies on, and where it's enforced:

- **`firestore.rules` is the data boundary.** Each account reaches only
  `users/{uid}/**`; everything else is denied. The profile doc accepts only its
  known fields (an `email`, if written, must be the account's own). Tested
  against the emulator in `tests/rules/` (`npm run test:rules`).
- **Every `/api/*` route that costs something needs a verified account and has
  a budget.** Firebase ID tokens are checked (RS256, project issuer/audience,
  `sub`, `email_verified`), then per-account rate limits in
  `api/_lib/rateLimit.js` (Upstash; per-IP for the two session-less push calls),
  then input size caps (`api/_lib/aiInput.js`) before anything reaches Gemini.
  What Gemini says about its own errors is logged, never shown.
- **The MCP endpoint is a second boundary, and it does not use `firestore.rules`.**
  `/mcp` (optional; see [README-mcp.md](README-mcp.md)) reads and writes through the
  Admin SDK, which bypasses the rules entirely. It is held shut instead by a
  constant-time check of a static secret, one configured uid that no request can
  change, a check of every id against `^[A-Za-z0-9_-]{1,128}$`, and an access level
  (`MCP_ACCESS`: read / write / full) that decides which tools are even offered.
  Deletes are the app's soft deletes. Whoever holds the key reaches that one
  account's tasks, events and Journal, so it is off until configured.
- **What reaches Gemini.** Task titles, and the messages typed into Ask AI. The one
  place the text someone *wrote* leaves the device on the app's own initiative is
  the Journal's **Plan it** (`/api/note-tasks`; the MCP connector above is the
  owner's separate, opt-in route) — and only when it is pressed, never in the
  background: the
  note (or the selection) as plain lines, capped at 8,000 characters, with no
  image, no drawing and no ticked item. It is said where the button is (its
  tooltip, and a line in the proposal) and in `src/lib/aiDisclosure.js`. A
  verified email and a connection are required; without them Plan it still
  proposes the note's checklist lines, and sends nothing. Ask AI (`/api/ai-schedule`)
  sends the conversation, the first word of the account's display name (so it can
  greet you; never the whole name, and never an email address), tag names, the
  next week's free windows, a sample of recent task titles and the open tasks.
  Events are not sent. What the assistant did in earlier turns
  goes back as plain words — `Created "Gym" on 2026-08-25 at 07:00 for 60 min.` —
  so "make that 8pm instead" has something to point at; those are task titles,
  days and times already covered above, not a new kind of data.
- **Push** accepts only real push-service endpoints, caps an account at ten
  devices, queues nothing for an account with no device, and drains the queue in
  batches so a burst can't starve real reminders.
- **The digest** is only ever sent to a verified Firebase Auth address, never to
  the client-written profile field, and carries SendGrid's unsubscribe link.
- **Headers** (`vercel.json`): `nosniff`, `Referrer-Policy`, `X-Frame-Options:
  DENY`, `Permissions-Policy`, and a Content Security Policy — shipped as
  `Content-Security-Policy-Report-Only` first. Once a Preview deployment shows no
  CSP reports in the browser console across sign-in (email and Google), the
  Journal (fonts, images, drawing), push and AI, rename the header to
  `Content-Security-Policy` to enforce it.
- **Signing out wipes this browser's offline copy** of the account (Firestore's
  IndexedDB cache), and with "Remember me" unticked also stops push on that
  device.
- **Notes never load remote images**, whether pasted, stored or imported from a
  backup.

**Known and accepted:** `npm audit` reports a high-severity advisory in the
`firebase` web SDK through `@grpc/grpc-js`. That code path is the Node.js gRPC
transport; in the browser Firestore uses WebChannel, so the advisory does not
apply to the shipped bundle. Revisit when `firebase` ships a release that clears
it (Dependabot will open it).

**Console settings the code can't enforce:**

1. Google Cloud → Credentials → the browser API key: restrict it by HTTP
   referrer (production, Vercel previews, localhost) and to the Firebase APIs it
   needs (Identity Toolkit, Token Service, Cloud Firestore, Firebase
   Installations, App Check). Make sure the Generative Language (Gemini) API is
   not allowed on it.
2. Firebase Authentication → Settings: turn on email enumeration protection,
   set a password policy (minimum 8) if your plan offers it, and keep Authorized
   domains to the ones you use.
3. Budget alerts on Google Cloud, SendGrid, Upstash and Vercel.
4. App Check (optional, recommended): register the web app with reCAPTCHA
   Enterprise, set `VITE_APPCHECK_SITE_KEY` (see `.env.example`), watch the App
   Check metrics for a week, then enforce it for Firestore and Authentication
   and set `APPCHECK_ENFORCE=true` for the `/api` routes.

## Not built yet

In the Journal: comments and tracked changes, headers/footers and page breaks,
find-and-replace (the browser's `Ctrl+F` finds text), a `.docx` export, shared or
simultaneous editing, and drawing freely over text (drawings are boxes between
paragraphs). Notes are not in the mobile app.
