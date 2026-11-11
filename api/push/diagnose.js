/* POST /api/push/diagnose   { test?: boolean }
 *
 * "Is push actually set up for me, and if not, which link is broken?" — the
 * thing that was impossible to answer when reminders simply didn't arrive.
 * Needs the signed-in account (Firebase ID token). Returns:
 *
 *   configured / configError   are the server's VAPID settings valid
 *   vapidPublicKey             the public half of the server's key (safe to
 *                              show); the app compares it with the key built
 *                              into the client, since a mismatch makes every
 *                              send fail with 403
 *   devices                    each registered device: the push service's host
 *                              (never the endpoint or keys — the endpoint can
 *                              wake the device), its user agent, when it
 *                              registered
 *   reminders                  how many are queued, and which comes next
 *   test                       only when `test: true`: a notification is sent
 *                              to every device right now, and this is the
 *                              result per device — { host, ok, gone, status }
 *
 * A test goes straight from here to the push service, so it proves the
 * server -> push service -> browser -> OS notification path without waiting
 * for the cron job or a reminder to come due.
 */

import { AuthError, verifyRequest } from '../_lib/auth.js'
import { hostOf } from '../_lib/pushInput.js'
import { ApiError, readJsonBody, route } from '../_lib/pushRoute.js'
import { createPushStore } from '../_lib/pushStore.js'
import { enforceLimit } from '../_lib/rateLimit.js'
import { getRedis } from '../_lib/redis.js'
import { ensureConfigured, getPublicKey, sendPush } from '../_lib/webPush.js'

const TEST_PAYLOAD = {
  title: 'Cadence',
  body: 'Test notification — push is working.',
  tag: 'cadence-test',
  url: '/',
  kind: 'test',
}

export default route('push/diagnose', ['POST'], async (req, res) => {
  const uid = await verifyRequest(req)
  await enforceLimit('pushDiagnose', uid)
  const body = readJsonBody(req)
  // A test sends a real notification to every device, so it has its own,
  // smaller budget — spent before anything is sent.
  if (body.test === true) await enforceLimit('pushTest', uid)
  const store = createPushStore(getRedis())
  const now = Date.now()

  let configError = null
  try {
    ensureConfigured()
  } catch (caught) {
    if (!(caught instanceof ApiError || caught instanceof AuthError)) throw caught
    configError = caught.message
  }

  const subs = await store.subsForUser(uid)
  const reminders = await store.scheduleSummary(uid, now)

  const out = {
    ok: true,
    serverTime: now,
    configured: configError === null,
    ...(configError ? { configError } : {}),
    vapidPublicKey: getPublicKey(),
    devices: subs.map((sub) => ({
      host: hostOf(sub.endpoint),
      ua: sub.ua,
      registeredAt: sub.registeredAt,
    })),
    reminders,
  }

  if (body.test === true && configError === null) {
    const results = await Promise.all(subs.map((sub) => sendPush(sub, TEST_PAYLOAD, { ttl: 60, urgency: 'high' })))
    out.test = await Promise.all(
      results.map(async (result, i) => {
        // A device the push service says is gone is of no further use to anyone.
        if (result.gone) await store.removeSubscription(subs[i].endpoint)
        return { host: hostOf(subs[i].endpoint), ok: result.ok, gone: result.gone, status: result.status }
      }),
    )
  }

  res.setHeader?.('Cache-Control', 'no-store')
  return res.status(200).json(out)
})
