/* POST /api/push/unsubscribe
 *
 *   { endpoint }
 *       Forget one device. Needs NO session, on purpose: sign-out leaves the
 *       subscription in place so reminders keep arriving while logged out, so
 *       the way to turn them off from the sign-in screen has to work while
 *       logged out too. The endpoint is an unguessable capability URL — to
 *       send this, you already hold the thing being revoked.
 *
 *   { all: true }  + Authorization: Bearer <Firebase ID token>
 *       Forget every device and every queued reminder for the signed-in
 *       account. Called as part of deleting the account.
 */

import { verifyRequest } from '../_lib/auth.js'
import { ApiError, readJsonBody, route } from '../_lib/pushRoute.js'
import { createPushStore } from '../_lib/pushStore.js'
import { clientIp, enforceLimit } from '../_lib/rateLimit.js'
import { getRedis } from '../_lib/redis.js'

export default route('push/unsubscribe', ['POST'], async (req, res) => {
  const body = readJsonBody(req)

  if (body.all === true) {
    // Part of deleting the account, which an unverified account can do too.
    const uid = await verifyRequest(req, { requireVerifiedEmail: false })
    const purged = await createPushStore(getRedis()).purgeUser(uid)
    return res.status(200).json({ ok: true, ...purged })
  }

  const { endpoint } = body
  if (typeof endpoint !== 'string' || !endpoint || endpoint.length > 2048) {
    throw new ApiError(400, 'endpoint is required.')
  }
  await enforceLimit('pushAnonymous', `ip:${clientIp(req)}`)
  const { removed } = await createPushStore(getRedis()).removeSubscription(endpoint)
  return res.status(200).json({ ok: true, removed })
})
