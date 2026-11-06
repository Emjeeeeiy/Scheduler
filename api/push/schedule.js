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
 */

import { verifyRequest } from '../_lib/auth.js'
import { readReminders } from '../_lib/pushInput.js'
import { readJsonBody, route } from '../_lib/pushRoute.js'
import { createPushStore } from '../_lib/pushStore.js'
import { getRedis } from '../_lib/redis.js'

export default route('push/schedule', ['POST'], async (req, res) => {
  const uid = await verifyRequest(req)
  const body = readJsonBody(req)
  const { reminders, skipped } = readReminders(body.reminders, Date.now())
  const count = await createPushStore(getRedis()).replaceSchedule(uid, reminders)
  return res.status(200).json({ ok: true, count, skipped })
})
