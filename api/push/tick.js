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
 *   claim   — atomically take what is due; overlapping runs never share a
 *             reminder (see claimDue)
 *   filter  — drop a reminder that was cancelled since it was queued, or that
 *             is now too late to be useful (STALE_AFTER_MS)
 *   send    — to every device the account has, in parallel, with a TTL that
 *             expires exactly when the reminder stops being worth showing, so
 *             a phone that was off all morning does not buzz at lunch with
 *             "starting in 30 minutes"
 *   settle  — a device the push service calls gone is forgotten; a transient
 *             failure puts the reminder back for the next minute, a few times
 */

import { timingSafeEqual } from 'node:crypto'
import { STALE_AFTER_MS } from '../_lib/pushInput.js'
import { ApiError, route } from '../_lib/pushRoute.js'
import { createPushStore } from '../_lib/pushStore.js'
import { getRedis } from '../_lib/redis.js'
import { sendPush } from '../_lib/webPush.js'

const CLAIM_LIMIT = 200
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

const hostOf = (endpoint) => {
  try {
    return new URL(endpoint).hostname
  } catch {
    return 'unknown'
  }
}

export default route('push/tick', ['GET', 'POST'], async (req, res) => {
  assertCron(req)

  const store = createPushStore(getRedis())
  const now = Date.now()
  const claimed = await store.claimDue(now, CLAIM_LIMIT)
  const stats = { claimed: claimed.length, sent: 0, dropped: 0, retried: 0, removedSubs: 0 }

  // One lookup per account per run, however many of its reminders are due.
  const devices = new Map()
  const devicesFor = (uid) => {
    if (!devices.has(uid)) devices.set(uid, store.subsForUser(uid))
    return devices.get(uid)
  }

  await mapLimit(claimed, CONCURRENCY, async ({ uid, reminder }) => {
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
    await Promise.all(
      results.map(async (result, i) => {
        if (result.ok) {
          delivered = true
        } else if (result.gone) {
          const { removed } = await store.removeSubscription(subs[i].endpoint)
          if (removed) stats.removedSubs += 1
        } else {
          if (result.retryable) worthRetrying = true
          console.warn('push send failed', { status: result.status, host: hostOf(subs[i].endpoint) })
        }
      }),
    )

    const attempts = (reminder.attempts ?? 0) + 1
    if (delivered) {
      stats.sent += 1
    } else if (worthRetrying && attempts < MAX_ATTEMPTS) {
      await store.requeue(uid, { ...reminder, attempts }, now + RETRY_DELAY_MS)
      stats.retried += 1
    } else {
      stats.dropped += 1
    }
  })

  return res.status(200).json(stats)
})
