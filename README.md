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
button that opens (or creates) the note titled with today's date. The toolbar and
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
writer's content, like a tag's colour; the toolbar around them stays neutral.
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
| `t` | jump to today |
| `←` `→` | move the date cursor (day / week / month, by view) |
| `Esc` | close a dialog |
| `Ctrl/⌘ + /` | in a Journal note: the formatting shortcuts |

## Layout

```text
src/
  firebase.js            init, auth, Firestore + offline cache
  lib/
    date.js              day keys & minutes — every date primitive
    layout.js            overlap packing for the time grid
    normalize.js          Firestore doc -> trusted shape (normalizeTask/Event/Tag)
    recurrence.js        repeat rules — expansion, labels, occurrence ids
    stats.js             dashboard & trends aggregations
    useNow.js            live clock for the now-line
    useTheme.js          system / light / dark
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
    useJournal.js        the Journal's list, open note and actions
    journalData.js       where notes live in Firestore; purge, backup export/import
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
                         SetupNotice, ToastStack, ErrorBoundary
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
    toggles-responsive.css  filter chips/toggles + every ≤900px override
    calendar-dnd.css        drag-to-create/move/resize on the time grid
                         (split from one file, in original cascade order — see
                         the import comment in App.jsx)
packages/shared/         @cadence/shared — pure logic the web app, functions and
                         mobile app share (dates, normalizers, journal.js)
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
