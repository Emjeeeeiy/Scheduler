# Phase 6: push notifications + daily digest — deploy & verify

This is the one part of Cadence that was **written but never run**. Every
other feature in this app was built, then driven in a real browser before
being called done. This one can't be — it needs Firebase's paid (Blaze) plan
and a live project, neither of which exist in the environment this was built
in. Treat everything below as a careful first draft, not a proven feature.

What's covered by real tests, and what isn't:

- `functions/lib/*.js` — pure logic (what counts as a new notification, what
  a digest email says) — unit tested, `npm test` in `functions/`.
- `functions/lib/runPushNotifications.js` / `runDailyDigest.js` — the
  Firestore/FCM/email orchestration — tested against an in-memory
  Firestore/FCM/email stand-in (`functions/test/fakeFirestore.js`), not the
  real SDKs. This is where a real bug was actually found and fixed (see git
  history) — the fake catches wiring mistakes, but it isn't Firestore.
- `functions/index.js` — three lines per function wiring the above to
  `onSchedule` and the real Admin SDK. Confirmed to at least **import**
  cleanly against the real `firebase-admin`/`firebase-functions` packages.
  Never invoked against a real project.
- The client side (`src/firebase.js`'s `enablePush`/`disablePush`,
  `usePushNotifications.js`, `sw.js`'s `push` listener) — the hook's state
  machine is DOM-tested; the actual FCM subscribe/token/service-worker
  handoff is not, and is the single most likely thing to need a fix.

## 1. Decide whether you still want this

Recap of the cost conversation: Blaze requires a credit card on the Google
account, but for one person's use, actual charges should be $0/month — Cloud
Functions' free tier (2M invocations/month) covers this many times over.
SendGrid's free tier (100 emails/day) covers the daily digest alone. Set a
budget alert in Google Cloud Console once you're on Blaze, just so a bug
can't run up a real bill silently.

## 2. One-time setup

```bash
npm install -g firebase-tools     # if you don't already have it
firebase login
firebase use --add                # pick your Firebase project, name it "default"
```

Upgrade to Blaze in the Firebase console (Project settings → Usage and
billing) if you haven't already — Cloud Functions simply doesn't exist on
the free Spark plan.

### Push notifications: a VAPID key

Firebase console → Project settings → Cloud Messaging → **Web Push
certificates** → generate a key pair. Put the key in `.env.local`:

```
VITE_FIREBASE_VAPID_KEY=<the key pair value>
```

Not a secret — like the rest of `.env.local`'s contents, it's meant to ship
in the client bundle.

### Daily digest: an email provider

Sign up for [SendGrid](https://sendgrid.com) (free tier: 100 emails/day —
plenty for one person). You'll need:

1. An API key (Settings → API Keys → Create API Key → **Restrict to Mail
   Send**, not full access).
2. A verified sender — either a full **domain** (Settings → Sender
   Authentication → Domain Authentication, if you own a domain) or, for a
   quick start, a single verified **sender identity** email address
   (Settings → Sender Authentication → Single Sender Verification). SendGrid
   will refuse to send from an unverified address.

`functions/index.js` calls SendGrid's REST API directly (no `@sendgrid/mail`
dependency) — swapping to Resend or another provider later means editing
`sendViaSendGrid` in `functions/index.js`, not a redesign.

### Set the two secrets

```bash
firebase functions:secrets:set SENDGRID_API_KEY
firebase functions:secrets:set DIGEST_FROM_EMAIL   # the verified sender address, e.g. cadence@yourdomain.com
```

Each prompts for a value and stores it in Google Secret Manager — never in
your repo, never in an env file.

## 3. Deploy

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

`firebase.json`'s `predeploy` hook runs `scripts/syncSharedLib.mjs`
automatically before this — it copies the pure task/date/notification logic
from `src/lib/` into `functions/shared/lib/` (gitignored, regenerated every
deploy) so the deployed functions are self-contained. You shouldn't need to
run it by hand, but `npm run sync` inside `functions/` does it manually if
you ever want to check what got copied.

Watch the deploy output for two function names:
`sendPushNotifications` (every 5 minutes) and `sendDailyDigest` (once daily,
07:00 UTC — see the timezone note below).

## 4. Turn it on, per account

Both are opt-in, from Cadence's own Settings panel — nothing sends until
someone asks for it there:

- **Push notifications** — a "Turn on" button. Browser will ask for
  notification permission; declining is a normal, handled outcome, not an
  error.
- **Daily digest email** — a checkbox, writes `dailyDigestEnabled: true` on
  the account's own `users/{uid}` document.

## 5. Verify it actually works

This is the step nothing here has done for you.

**Push:**
1. Turn it on from Settings, in a real browser, over HTTPS (or `localhost`
   for local testing — Web Push requires a secure context).
2. Check Firestore: a new doc should appear at
   `users/{your-uid}/pushTokens/{token}`.
3. Create a task dated today with a start time a few minutes from now (or
   yesterday, to trigger "overdue" immediately rather than waiting).
4. Watch the Cloud Functions logs (`firebase functions:log` or the Firebase
   console) for `sendPushNotifications` — it runs every 5 minutes.
5. If a notification doesn't appear: check `chrome://serviceworker-internals`
   (or your browser's equivalent) that `sw.js` is active, and check its
   console for the `push` event firing. **If the payload doesn't match**
   what `sw.js` expects (`payload.notification.title`/`.body`) — this is the
   one specific thing flagged in `sw.js`'s own comment as unverified — add a
   `console.log(payload)` inside the `push` listener there and look at what
   FCM is actually sending.

**Daily digest:**
1. Check the box in Settings.
2. Rather than waiting a day, temporarily change the schedule in
   `functions/index.js` (`'0 7 * * *'`) to a few minutes from now, redeploy,
   and check `firebase functions:log` for `sendDailyDigest`'s result — it
   logs `{ usersProcessed, emailsSent }`. Revert the schedule afterward.
3. If `emailsSent` is 0 but `usersProcessed` is 1: check the logged error —
   almost always an unverified SendGrid sender.

## Known limitations (by design, for a v1 — not oversights)

- **UTC only.** Both schedules run on a fixed clock — "starting soon" and
  the digest's 07:00 send time are UTC-relative. There's no per-user
  timezone field anywhere yet. Fine for one person who knows that going in.
- **One digest send time for everyone**, hardcoded in `functions/index.js`.
- **No unsubscribe link in the email itself** — the only way off the digest
  is the Settings checkbox. Fine for a personal tool one person opted
  themselves into; would need one before this could serve a stranger.
- **A dead push token is only cleaned up reactively** — when FCM reports it
  invalid on a real send attempt, not proactively.

## Turning it back off

Toggling both Settings switches off stops any account from receiving
either. To remove the functions entirely: `firebase deploy --only
functions` after deleting the exports from `functions/index.js`, or
`firebase functions:delete sendPushNotifications sendDailyDigest` directly.
Neither touches the rest of the app — Cadence works exactly as it did before
Phase 6 with these functions gone.
