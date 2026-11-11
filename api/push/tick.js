/* GET|POST /api/push/tick
 *
 * Sends every reminder that has come due. Something outside this app has to
 * call it about once a minute — Vercel's free plan can't run a cron that often,
 * so the schedule lives in cron-job.org (or Vercel Cron on a paid plan, which
 * sends the same `Authorization: Bearer $CRON_SECRET` header). See
 * README-push.md.
 *
 * Guarded by that shared secret and nothing else: this route sends
 * notifications to real devices, so it must never be callable by the public.
 *
 * The flow per run:
 *   check   — the VAPID settings are valid, BEFORE anything is taken off the
 *             queue. A missing or malformed setting fails the run loudly while
 *             the reminders are still queued, instead of consuming them first
 *   claim   — atomically take what is due, 200 at a time, and keep going
 *             while a full batch keeps coming back (up to ~20 s, inside the
 *             function's 30 s limit) — so a burst can't leave real reminders
 *             waiting behind it until they go stale. Overlapping runs never
 *             share a reminder (see claimDue)
 *   filter  — drop a reminder that was cancelled since it was queued, or that
 *             is now too late to be useful (STALE_AFTER_MS)
 *   send    — to every device the account has, in parallel, with a TTL that
 *             expires exactly when the reminder stops being worth showing, so
 *             a phone that was off all morning does not buzz at lunch with
 *             "starting in 30 minutes"
 *   settle  — a device the push service calls gone is forgotten; a transient
 *             failure (or anything unexpected) puts the reminder back for the
 *             next minute, a few times — a claimed reminder is never just lost
 *
 * The JSON it returns is what cron-job.org's history shows, so it says WHY
 * things went wrong, not only that they did:
 *   claimed/sent/dropped/retried/removedSubs   the outcome per reminder
 *   rejected   reminders the push service refused for good (a 403 almost always
 *              means the client and server VAPID keys differ)
 *   failed     reminders that hit an unexpected error and could not be requeued
 *   statuses   how many device sends got each HTTP status, e.g. {"201":2,"403":1}
 */

import { timingSafeEqual } from 'node:crypto'
import { STALE_AFTER_MS, hostOf } from '../_lib/pushInput.js'
import { ApiError, route } from '../_lib/pushRoute.js'
import { createPushStore } from '../_lib/pushStore.js'
import { getRedis } from '../_lib/redis.js'
import { ensureConfigured, sendPush } from '../_lib/webPush.js'

const CLAIM_LIMIT = 200
// How long one run keeps claiming batches. vercel.json gives this function
// 30 s; the rest is headroom for the last batch's sends.
const TIME_BUDGET_MS = 20_000
const CONCURRENCY = 20
const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 60_000

function assertCron(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) throw new ApiError(500, 'Server is missing CRON_SECRET.')
  const header = req.headers?.authorization ?? req.headers?.Authorization ?? ''
  const given = Buffer.from(header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '')
  const expected = Buffer.from(secret)
  // timingSafeEqual throws on unequal lengths, and a length check leaks
  // nothing the request didn't already reveal.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw new ApiError(401, 'Unauthorized.')
  }
}

/** Runs `worker` over `items`, at most `limit` at a time. */
async function mapLimit(items, limit, worker) {
  let next = 0
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await worker(items[next++])
  })
  await Promise.all(lanes)
}

export default route('push/tick', ['GET', 'POST'], async (req, res) => {
  assertCron(req)
  // Before claimDue, deliberately — see the header.
  ensureConfigured()

  const store = createPushStore(getRedis())
  const now = Date.now()
  const started = Date.now()
  const stats = {
    claimed: 0,
    sent: 0,
    dropped: 0,
    retried: 0,
    removedSubs: 0,
    rejected: 0,
    failed: 0,
    statuses: {},
  }
  const countStatus = (status) => {
    const key = String(status ?? 'none')
    stats.statuses[key] = (stats.statuses[key] ?? 0) + 1
  }

  // One lookup per account per run, however many of its reminders are due.
  const devices = new Map()
  const devicesFor = (uid) => {
    if (!devices.has(uid)) devices.set(uid, store.subsForUser(uid))
    return devices.get(uid)
  }

  /** Puts a reminder back for the next minute, or gives up after MAX_ATTEMPTS. */
  async function retryOrDrop(uid, reminder) {
    const attempts = (reminder.attempts ?? 0) + 1
    if (attempts < MAX_ATTEMPTS) {
      await store.requeue(uid, { ...reminder, attempts }, now + RETRY_DELAY_MS)
      stats.retried += 1
    } else {
      stats.dropped += 1
    }
  }

  async function deliver({ uid, reminder }) {
    if (!reminder) {
      stats.dropped += 1
      return
    }
    const staleAfter = STALE_AFTER_MS[reminder.kind] ?? 0
    if (now - reminder.fireAt > staleAfter) {
      stats.dropped += 1
      return
    }
    const subs = await devicesFor(uid)
    if (subs.length === 0) {
      stats.dropped += 1
      return
    }

    const ttl = Math.max(1, Math.ceil((reminder.fireAt + staleAfter - now) / 1000))
    const payload = {
      title: reminder.title,
      body: reminder.body,
      tag: reminder.tag,
      url: reminder.url ?? '/',
      kind: reminder.kind,
    }
    const results = await Promise.all(subs.map((sub) => sendPush(sub, payload, { ttl, urgency: 'high' })))

    let delivered = false
    let worthRetrying = false
    let refusedForGood = false
    await Promise.all(
      results.map(async (result, i) => {
        countStatus(result.status)
        if (result.ok) {
          delivered = true
        } else if (result.gone) {
          const { removed } = await store.removeSubscription(subs[i].endpoint)
          if (removed) stats.removedSubs += 1
        } else {
          if (result.retryable) worthRetrying = true
          else refusedForGood = true
          console.warn('push send failed', { status: result.status, host: hostOf(subs[i].endpoint) })
        }
      }),
    )

    if (delivered) {
      stats.sent += 1
    } else if (worthRetrying) {
      await retryOrDrop(uid, reminder)
    } else {
      stats.dropped += 1
      if (refusedForGood) {
        stats.rejected += 1
        console.error('push refused for good', { id: reminder.id, kind: reminder.kind })
      }
    }
  }

  async function deliverSafely(job) {
    try {
      await deliver(job)
    } catch (caught) {
      // Something we didn't anticipate. The reminder is already off the queue,
      // so the one thing that must not happen is losing it quietly.
      console.error('push reminder hit an unexpected error', { id: job.id, kind: job.reminder?.kind }, caught)
      try {
        if (job.reminder) await retryOrDrop(job.uid, job.reminder)
        else stats.dropped += 1
      } catch (again) {
        stats.failed += 1
        console.error('push reminder could not be requeued', { id: job.id }, again)
      }
    }
  }

  // A full batch means there may be more due. A retried reminder is requeued
  // for a minute from now, so it is never claimed twice in one run.
  let claimed
  do {
    claimed = await store.claimDue(now, CLAIM_LIMIT)
    stats.claimed += claimed.length
    await mapLimit(claimed, CONCURRENCY, deliverSafely)
  } while (claimed.length === CLAIM_LIMIT && Date.now() - started < TIME_BUDGET_MS)

  res.setHeader?.('Cache-Control', 'no-store')
  return res.status(200).json(stats)
})
