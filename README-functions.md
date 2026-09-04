# Phase 6: daily digest email — deploy & verify

This is the one part of Cadence that was **written but never run**. Every
other feature in this app was built, then driven in a real browser before
being called done. This one can't be — it needs Firebase's paid (Blaze) plan
and a live project, neither of which exist in the environment this was built
in. Treat everything below as a careful first draft, not a proven feature.

(Push notifications were also built at one point, and pulled back out — the
Web Push/FCM setup turned out to be more account-configuration friction than
it was worth. See git history if that's ever worth revisiting; nothing here
depends on it.)

What's covered by real tests, and what isn't:

- `functions/lib/*.js` — pure logic (what a digest email says) — unit
  tested, `npm test` in `functions/`.
- `functions/lib/runDailyDigest.js` — the Firestore/email orchestration —
  tested against an in-memory Firestore/email stand-in
  (`functions/test/fakeFirestore.js`), not the real SDKs. This is where a
  real bug was actually found and fixed while push was still part of this
  phase (see git history) — the fake catches wiring mistakes, but it isn't
  Firestore.
- `functions/index.js` — a few lines wiring the above to `onSchedule` and
  the real Admin SDK. Confirmed to at least **import** cleanly against the
  real `firebase-admin`/`firebase-functions` packages. Never invoked against
  a real project.

## 1. Decide whether you still want this

Recap of the cost conversation: Blaze requires a credit card on the Google
account, but for one person's use, actual charges should be $0/month — Cloud
Functions' free tier (2M invocations/month) covers a once-a-day schedule
many, many times over. SendGrid's free tier (100 emails/day) covers it too.
Set a budget alert in Google Cloud Console once you're on Blaze, just so a
bug can't run up a real bill silently.

## 2. One-time setup

```bash
npm install -g firebase-tools     # if you don't already have it
firebase login
firebase use --add                # pick your Firebase project, name it "default"
```

Upgrade to Blaze in the Firebase console (Project settings → Usage and
billing) if you haven't already — Cloud Functions simply doesn't exist on
the free Spark plan.

### An email provider

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
automatically before this — it copies the pure task/date logic from
`src/lib/` into `functions/shared/lib/` (gitignored, regenerated every
deploy) so the deployed function is self-contained. You shouldn't need to
run it by hand, but `npm run sync` inside `functions/` does it manually if
you ever want to check what got copied.

Watch the deploy output for `sendDailyDigest` (scheduled once daily, 07:00
UTC — see the timezone note below).

## 4. Turn it on, per account

Opt-in, from Cadence's own Settings panel — nothing sends until someone
checks the box there. It writes `dailyDigestEnabled: true` on the account's
own `users/{uid}` document.

## 5. Verify it actually works

This is the step nothing here has done for you.

1. Check the box in Settings.
2. Rather than waiting a day, temporarily change the schedule in
   `functions/index.js` (`'0 7 * * *'`) to a few minutes from now, redeploy,
   and check `firebase functions:log` (or the Firebase console) for
   `sendDailyDigest`'s result — it logs `{ usersProcessed, emailsSent }`.
   Revert the schedule afterward.
3. If `emailsSent` is 0 but `usersProcessed` is 1: check the logged error —
   almost always an unverified SendGrid sender.

## Known limitations (by design, for a v1 — not oversights)

- **UTC only.** The schedule runs on a fixed clock — the digest's 07:00 send
  time is UTC-relative. There's no per-user timezone field anywhere yet.
  Fine for one person who knows that going in.
- **One send time for everyone**, hardcoded in `functions/index.js`.
- **No unsubscribe link in the email itself** — the only way off the digest
  is the Settings checkbox. Fine for a personal tool one person opted
  themselves into; would need one before this could serve a stranger.

## Turning it back off

Unchecking the Settings box stops any account from receiving it. To remove
the function entirely: `firebase deploy --only functions` after deleting
the export from `functions/index.js`, or `firebase functions:delete
sendDailyDigest` directly. Neither touches the rest of the app — Cadence
works exactly as it did before Phase 6 with this function gone.
