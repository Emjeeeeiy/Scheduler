/* POST /api/push/schedule
 *
 * The app tells the server what should be pushed over the next two weeks:
 * `{ reminders: [{ id, kind, fireAt, title, body, tag?, url? }] }`. The client
 * works this out (packages/shared/src/reminders.js) because it already holds
 * every task, event and repeat rule and knows its own time zone — so the
 * server never reads the schedule and never needs either.
 *
 * It REPLACES the signed-in account's whole schedule rather than patching it.
 * A reminder that was edited, completed or deleted is simply absent from the
 * next list, with no "remove this one" bookkeeping to get wrong.
 *
 * An account with no registered device gets nothing queued — `noDevice: true`
 * says why. Nothing could receive those reminders, and without this rule any
 * account could fill the shared queue with work that delays everyone else's.
 */

import { verifyRequest } from '../_lib/auth.js'
import { readReminders } from '../_lib/pushInput.js'
import { readJsonBody, route } from '../_lib/pushRoute.js'
import { createPushStore } from '../_lib/pushStore.js'
import { enforceLimit } from '../_lib/rateLimit.js'
import { getRedis } from '../_lib/redis.js'

export default route('push/schedule', ['POST'], async (req, res) => {
  const uid = await verifyRequest(req)
  await enforceLimit('pushSchedule', uid)
  const body = readJsonBody(req)
  const { reminders, skipped } = readReminders(body.reminders, Date.now())
  const store = createPushStore(getRedis())

  if ((await store.deviceCount(uid)) === 0) {
    await store.clearSchedule(uid)
    return res.status(200).json({ ok: true, count: 0, skipped, noDevice: true })
  }

  const count = await store.replaceSchedule(uid, reminders)
  return res.status(200).json({ ok: true, count, skipped })
})
