/* POST /api/push/subscribe
 *
 * Registers this device's browser push subscription against the signed-in
 * account. Two ways in:
 *
 *   1. A normal call from the app: `Authorization: Bearer <Firebase ID token>`
 *      and `{ subscription }`. The device now belongs to that account — and if
 *      it belonged to someone else (a shared computer), it moves.
 *
 *   2. A call from the SERVICE WORKER after the browser rotated the
 *      subscription (`pushsubscriptionchange`): `{ oldEndpoint, subscription }`
 *      with no token, because a worker has no session to borrow one from. The
 *      proof of ownership is knowing the OLD endpoint, which is an unguessable
 *      capability URL only that browser ever held. The new subscription is
 *      attached to whoever owned the old one, and the old one is dropped.
 */

import { AuthError, verifyRequest } from '../_lib/auth.js'
import { clip, readSubscription } from '../_lib/pushInput.js'
import { ApiError, hasAuthorization, readJsonBody, route } from '../_lib/pushRoute.js'
import { createPushStore } from '../_lib/pushStore.js'
import { clientIp, enforceLimit } from '../_lib/rateLimit.js'
import { getRedis } from '../_lib/redis.js'

export default route('push/subscribe', ['POST'], async (req, res) => {
  const body = readJsonBody(req)
  const subscription = readSubscription(body.subscription)
  const ua = clip(String(req.headers?.['user-agent'] ?? ''), 200)

  if (hasAuthorization(req)) {
    const uid = await verifyRequest(req)
    await enforceLimit('pushSubscribe', uid)
    const store = createPushStore(getRedis())
    await store.upsertSubscription(uid, subscription, { ua })
    return res.status(200).json({ ok: true })
  }

  const { oldEndpoint } = body
  if (typeof oldEndpoint !== 'string' || !oldEndpoint || oldEndpoint.length > 2048) {
    throw new AuthError(401, 'Missing bearer token.')
  }
  await enforceLimit('pushAnonymous', `ip:${clientIp(req)}`)
  const store = createPushStore(getRedis())
  const previous = await store.getSubscription(oldEndpoint)
  if (!previous) throw new ApiError(404, 'Unknown subscription.')

  // Add the new one BEFORE dropping the old one: removing a person's last
  // device clears their schedule, and a rotation is not that.
  await store.upsertSubscription(previous.uid, subscription, { ua })
  if (oldEndpoint !== subscription.endpoint) await store.removeSubscription(oldEndpoint)
  return res.status(200).json({ ok: true })
})
