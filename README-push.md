# Push notifications — setup, verification, limits

Reminders that arrive when every Cadence tab is closed, when the installed PWA
is closed, and after signing out. Standard **Web Push** sent by our own
`api/push/*` functions on Vercel, signed with our own VAPID key pair. There is
no Firebase Cloud Messaging and no Cloud Functions in this path; Firebase is
only still used for sign-in and for the app's data.

## How it works

```text
 app (signed in)                    Vercel api/push/*              Upstash Redis
 ──────────────                     ─────────────────              ─────────────
 Turn on ─ subscribe() ───────────▶ subscribe   ─────────────────▶ device ↔ account
 tasks/events change ─ schedule ──▶ schedule    ─────────────────▶ reminder queue
                                    tick  ◀── cron-job.org, every minute
                                      │  claim what's due ◀───────  queue
                                      └─ web-push ─▶ Google/Mozilla/Apple ─▶ device
 service worker wakes ─ shows notification (no tab, no login needed)
```

- **The app works out the schedule**, not the server. It already holds every
  task, event and repeat rule, and tasks are stored as local wall-clock times.
  Every change (and every hour, and every launch) it sends the next 14 days of
  reminders as exact instants. The server never reads your schedule and never
  needs your time zone. (`packages/shared/src/reminders.js`,
  `src/lib/useReminderSync.js`)
- **The server only delivers.** `/api/push/tick` takes whatever is due, sends it
  to every device on the account, and forgets devices the push service says are
  gone. (`api/push/tick.js`, `api/_lib/pushStore.js`)
- **Signing out changes nothing.** The device's subscription and the queued
  reminders stay, which is exactly what keeps notifications arriving while
  logged out. They stop when someone turns push off — in Settings, or on the
  sign-in screen ("Reminders are still on for this device · Turn off") — or
  deletes the account.
- **One device belongs to one account.** If someone else signs in on the same
  browser, the device moves to them and the previous account stops receiving
  there.

Reminders sent: *starting soon* (your Settings → "Notify ahead of time"), *at
start time*, and one *morning nudge* per day (Working hours start, else 8 AM)
when anything is overdue. Tasks and events both.

## One-time setup

You need: a Vercel project (this one), and ~10 minutes. Nothing here costs
money on the free tiers.

1. **Add Upstash Redis.** Vercel dashboard → *Storage* → *Create* → *Upstash for
   Redis* (Marketplace) → connect it to this project. Vercel adds
   `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_*`) to the
   project; both spellings work.

2. **Set the push variables** in Vercel → Project Settings → Environment
   Variables (Production, and Preview/Development if you want them there):

   | Variable | Value |
   | --- | --- |
   | `VAPID_PUBLIC_KEY` | public half of the key pair |
   | `VAPID_PRIVATE_KEY` | private half — server only, never `VITE_`-prefixed |
   | `VITE_VAPID_PUBLIC_KEY` | **the same** public key (it is built into the client) |
   | `VAPID_SUBJECT` | `mailto:` or `https:` contact the push services can see |
   | `CRON_SECRET` | any long random string |

   `.env.local` already has a generated set for local development. Copy those
   values into Vercel rather than generating a second pair — a mismatch
   between the client's key and the server's makes every send fail with 403.
   If you mark the private key and `CRON_SECRET` as secret/sensitive (sensible),
   Vercel can never show them again and `vercel env pull` writes placeholders in
   their place — so keep a copy of `.env.local`'s push block somewhere safe
   first. Replace the placeholder `VAPID_SUBJECT`. To make a fresh pair instead:
   `npx web-push generate-vapid-keys`, and know that this invalidates every
   existing subscription (people turn push off and on again).

3. **Redeploy.** `VITE_VAPID_PUBLIC_KEY` is baked in at build time, so a change
   needs a new build, not just a restart.

4. **Create the once-a-minute trigger.** Vercel's free plan can't run a cron
   every minute (its docs say once a day; a newer page says every 15 minutes at
   best — either way, too slow), so use [cron-job.org](https://cron-job.org) (free):
   - URL: `https://<your-production-domain>/api/push/tick`
   - Schedule: every 1 minute · Method: `GET`
   - Header: `Authorization` = `Bearer <your CRON_SECRET>`
   - Use the **production** domain; preview URLs sit behind Vercel's
     deployment protection and will answer 401/403 to the cron.
   - On the Pro plan you can skip all this: add
     `"crons": [{ "path": "/api/push/tick", "schedule": "* * * * *" }]` to
     `vercel.json` — Vercel sends the same `Bearer $CRON_SECRET` header itself.

## Verify it (nothing here has been run against real devices yet)

The unit tests prove the logic, ownership rules and failure handling against
an in-memory Redis, and the encryption was checked by decrypting a payload with
a browser-style key. What they cannot prove is that Google, Mozilla and Apple
accept our requests and deliver — only a real device can.

1. `curl -H "Authorization: Bearer $CRON_SECRET" https://<prod>/api/push/tick`
   → `{"claimed":0,"sent":0,"dropped":0,"retried":0,"removedSubs":0}`. A `401`
   means the secret differs; a `500` names the missing setting.
2. **Desktop Chrome**: Settings → *Push notifications* → *Turn on*. Set *Notify
   ahead of time* to 15m (the shortest option) and create a task starting in
   ~18 minutes, then wait ~5 seconds so the schedule syncs. **Close every
   Cadence tab.** Expect "starting soon" about 3 minutes later, then "starting
   now" at the start time. Clicking opens the app. (DevTools → Application →
   Service Workers → *Push* tests the handler alone.)
3. **Logged out**: repeat, but sign out first. It should still arrive.
4. **Android**: install the PWA, turn push on, swipe the app away.
5. **iPhone/iPad (iOS 16.4+)**: *Add to Home Screen*, open the **installed** app,
   turn push on there, then close it. (Safari in a tab cannot do push.)
6. **Two accounts, one browser**: sign in as B. A's reminders stop on that
   device; B's arrive.
7. **Turn off from the sign-in screen**, then confirm nothing arrives. A dead
   device shows up as `removedSubs: 1` on the next tick.

## When something doesn't arrive

| Symptom | Likely cause |
| --- | --- |
| Toast: "not available in this build" | `VITE_VAPID_PUBLIC_KEY` wasn't set at build time, or you're on `npm run dev` (no service worker there — use `npm run build && npm run preview`). |
| Subscribes, nothing ever sends | The cron job isn't running or is hitting a preview URL. Check cron-job.org's history; run the `curl` above. |
| `tick` returns `sent: 0, dropped: N` | Reminders arrived too late to be useful (the cron stalled), or the account has no device. |
| Sends fail with 403 in the logs | Client and server VAPID public keys differ. Redeploy, then turn push off and on. |
| Works, then stops on a computer | The browser was fully quit. Desktop push needs the browser *process* running (background mode is fine). |
| Nothing on iPhone | Not the installed Home Screen app, or iOS < 16.4. |

Vercel → project → *Logs* shows `push send failed { status, host }` for
delivery errors.

## Limits, by design

- **Desktop browser must be running** (it can have no windows open). A fully
  quit browser can't receive; the message's TTL expires rather than buzzing
  hours late.
- **About a minute of precision** (the cron interval) plus the push service's
  latency. A reminder more than 10 minutes late is dropped (3 hours for the
  morning nudge) because a stale "starts in 30m" is worse than none.
- **14-day horizon.** The schedule refreshes whenever the app is opened; if no
  signed-in device opens it for two weeks, reminders run out. Recurring
  reminders included.
- **Lead time is per device** (it lives in that browser's settings): the device
  that synced last decides.
- **Privacy.** Reminder text (task titles) is stored in Redis in plain text so
  it can be sent, and shows on the lock screen after you log out. The push
  message itself is end-to-end encrypted to the device. Account deletion
  removes all of it.
- **Free tier.** An idle minute costs one Redis command (~43k a month); each
  schedule sync is a handful more. Upstash's free plan allows 500,000 commands a
  month, so expect to use roughly a tenth of it.

## What lives in Redis

| Key | Holds |
| --- | --- |
| `push:sub:{sha256(endpoint)}` | `{ uid, endpoint, keys, ua, … }` for one device |
| `push:subs:{uid}` | set of that account's device ids |
| `push:rem:{uid}` | hash: reminder id → what to show (expires 16 days after last sync) |
| `push:queue` | sorted set `uid\|reminderId`, scored by due time |

Push services only ever see the endpoint, your VAPID subject and encrypted
bytes. The routes accept only real push-service hosts (Google, Mozilla,
Apple, Windows) as endpoints, so the server can't be pointed at arbitrary
addresses.
