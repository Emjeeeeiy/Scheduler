# Push routes (`api/push/*`)

Reminders that arrive with the app closed. Our own server sends Web Push signed with our own VAPID key pair; there is no Firebase Cloud Messaging. Setup, the device checklist and troubleshooting are in `README-push.md`; this is what to keep true when changing the code. They share `route()` and `readJsonBody` with the AI routes.

## Routes and who may call them

| Route | Auth | Budget |
| --- | --- | --- |
| `schedule`, `diagnose` | `verifyRequest` (verified email) | `pushSchedule` 300/h, `pushDiagnose` 30/h per account |
| `subscribe` | **either** a session (`hasAuthorization(req)` → `verifyRequest`, `pushSubscribe` 30/h) **or**, session-less, proof of owning the old endpoint (`oldEndpoint`) for a service-worker key rotation | `pushAnonymous` 60/h **per IP** (`ip:${clientIp(req)}`) |
| `unsubscribe` | `{ endpoint }` session-less (per-IP budget), or `{ all: true }` with `verifyRequest(req, { requireVerifiedEmail: false })` so an unverified account can purge itself | `pushAnonymous` for the endpoint form |
| `tick` | no user: guarded by `CRON_SECRET`, compared with `timingSafeEqual` after a length check; accepts GET or POST (a cron call) | none; bounded by its own limits below |

A rotation inserts the **new** subscription before removing the old one, because removing a person's last device clears their schedule and a rotation is not that.

## Input (`api/_lib/pushInput.js`)

- **Endpoints are an allowlist of real push services** (an SSRF guard): https only, no userinfo, port 443, at most 2048 characters. Never accept an arbitrary URL to send to.
- **Keys** must decode to exactly 65 bytes (`p256dh`) and 16 bytes (`auth`).
- **A reminder:** id matches `^[A-Za-z0-9_~.:-]{1,200}$`; `kind` must be a key of `STALE_AFTER_MS` (soon/start 10 min, nudge 3 h; the client's list must match: `tests/pushHandlers.test.jsx` pins it); `fireAt` within about −60 s … +15 days; title ≤ 200, body ≤ 300, tag ≤ 120; `url` must be **same-origin**. A bad entry is skipped, not fatal; more than `MAX_REMINDERS` (1000) in a request is a 400.

## The store (`api/_lib/pushStore.js`)

`createPushStore(redis)` is a factory over an injected client, so tests pass `tests/fakeRedis.js`. Invariants to preserve:

- one owner per endpoint; a **queue entry is never created for an account with no device**;
- `MAX_DEVICES = 10` per account, evicting the least recently refreshed;
- a schedule lives `SCHEDULE_TTL_SECONDS` (16 days); variadic Redis commands go in slices of `CHUNK = 200`;
- `replaceSchedule` swaps the whole schedule in one transaction;
- **`claimDue` claims atomically**: a `ZREM` that returns 1 wins the reminder, so two overlapping ticks never send twice.

## Sending and the tick

- `sendPush` (`api/_lib/webPush.js`) **never throws on a delivery failure**; it returns `{ ok, gone, retryable, status }` (`gone` for 404/410, `retryable` for network, 429 and 5xx). It does throw on missing VAPID configuration, and `ensureConfigured` runs **before** anything is claimed, so a misconfigured deploy cannot claim reminders it cannot send and lose them.
- `tick` is bounded: `CLAIM_LIMIT` 200 per run, a 20 s `TIME_BUDGET_MS` inside the `maxDuration: 30` in `vercel.json`, `CONCURRENCY` 20, `MAX_ATTEMPTS` 3 with a 60 s retry delay. A failed delivery is requeued; a `gone` endpoint is removed. Logs record only the host (`hostOf`), never the endpoint, which is a credential.
- Draining in batches is what stops a burst from starving real reminders.

## Changing push

- A new reminder `kind` goes in `STALE_AFTER_MS` (`api/_lib/pushInput.js`) **and** in `REMINDER_KINDS` (`packages/shared/src/reminders.js`, currently `soon`, `start`, `nudge`); `tests/pushHandlers.test.jsx` ("knows exactly the reminder kinds the client schedules") fails if they differ.
- A new budget goes in `LIMITS`. A new session-less route is a new abuse surface: give it a per-IP budget and a proof of ownership.
- Tests: `tests/pushHandlers.test.jsx`, `webPushSend.test.jsx`, `webPushConfig.test.jsx` (all already in `apiTests`), with `FakeRedis`.
- Nothing about push has been verified against real devices (README-push.md says so). Say plainly what you did and did not exercise.
