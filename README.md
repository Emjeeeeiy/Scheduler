# Cadence

A time-blocking planner. Tasks can sit in an inbox with no time at all, and
"planning" means giving one a real slot on a real day — then seeing, afterwards,
where the hours actually went.

Four views: **Dashboard** (today's snapshot, plus a Trends section — planned
versus completed over the last 7 or 30 days), **Day** (agenda + inbox),
**Week** (7-column time grid), and **Month** (calendar grid).

Built with React 19 + Vite, data in Firebase Firestore. Sign in with Google, or
with a username and password.

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
| `npm run test:dom` | vitest + jsdom — the one hook (`useModalA11y`) whose behaviour (focus trap, focus restore) needs a real DOM to prove |
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
users/{uid}                    profile — username  email  createdAt
users/{uid}/tasks/{taskId}
  title  notes  date  startMin  durationMin  tagId  done
  completedAt  createdAt  updatedAt
  recurrence  overrides

users/{uid}/tags/{tagId}
  name  slot  order

usernames/{usernameLower}      top-level — uid  email  createdAt
```

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

**The tag palette is validated, not eyeballed.** The eight colours are the
validated categorical order — every check passes against both surfaces (worst
adjacent CVD ΔE 9.1 light / 8.4 dark). The *order* is the colourblind-safety
mechanism, so new tags take the next unused slot. Three light-mode slots sit
under 3:1 contrast, so anything wearing a tag colour also carries a visible text
label — never colour alone.

**Username login needs a real email under the hood, because Firebase Auth's
email/password provider has no concept of a username.** Registration collects
one anyway (`usernames/{usernameLower} → { uid, email }`, a top-level
collection separate from the owner-only `/users` tree) so the account can be
recovered and so `signInWithEmailAndPassword` has something to call. The Auth
account is created *first*; the username is then reserved as that
now-signed-in user, and if it's taken, the Auth account is rolled back
(`deleteUser`) rather than left as an orphan with no profile. Security rules
allow a `get` on any single known username (needed to resolve it before
sign-in) but never a `list`, so the namespace can't be enumerated — and every
login failure, whether the username doesn't exist or the password is wrong,
shows the identical "Incorrect username/email or password," so a login form
never doubles as a username-enumeration oracle.

## Keyboard

| Key | Does |
| --- | --- |
| `n` | new task |
| `t` | jump to today |
| `←` `→` | move the date cursor (day / week / month, by view) |
| `Esc` | close a dialog |

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
  state/
    AuthContext.jsx      session, Google + username/password
    ScheduleContext.jsx  the single data seam
    ToastContext.jsx      transient "that write failed" surface
  components/
    icons.jsx            the one drawn icon set — shared by every group below
    auth/                SignIn, LoginForm, RegisterForm, PasswordField
    views/               the four screens: Dashboard, TodayView, WeekGrid, MonthCalendar
    calendar/            the pieces those views compose — DayColumn, MiniCalendar,
                         DayPeek, TaskRow, TaskInbox
    editors/             every dialog that creates, edits, or deletes, plus the
                         controls only they use (RepeatPicker, EditorKindToggle)
    stats/               Dashboard's data display — StatTile, BarChart, TagBars
    shell/               chrome that belongs to no one view — NotificationBell,
                         SetupNotice, ToastStack, ErrorBoundary
  styles/
    tokens.css           design tokens, both themes
    shell.css             app shell, notifications, controls, profile, date nav,
                         frames & common bits, toasts
    auth.css              setup notice + the sign-in screen
    dashboard.css          Dashboard + its charts
    focus.css              Focus mode (the pomodoro timer view)
    calendar.css           Day/Week time grids, Month grid, inbox & task rows
    modals.css              every dialog, its fields, tags, item index, repeat picker
    toggles-responsive.css  filter chips/toggles + every ≤900px override
    calendar-dnd.css        drag-to-create/move/resize on the time grid
                         (split from one file, in original cascade order — see
                         the import comment in App.jsx)
tests/                   pure-logic tests (date, layout, stats, normalize, …) —
                         plus a11y.test.jsx (vitest + jsdom, see Scripts) and
                         smoke/ (SSR render check + manual qa.mjs)
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

## Not built yet

Browser reminders and JSON export were deliberately left out.
