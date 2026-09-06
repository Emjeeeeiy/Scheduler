/* The actual work behind the sendPushNotifications schedule, pulled out of
 * index.js and written to take `db`/`messaging` as arguments rather than
 * importing the Admin SDK singletons directly.
 *
 * That's what makes this testable at all: functions/test/runPushNotifications.test.js
 * runs it against a small in-memory Firestore/FCM stand-in (not the real
 * SDKs, no emulator, no live project) and checks the actual orchestration —
 * the query shapes, the per-user error isolation, the dead-token cleanup —
 * which the pure functions/lib modules alone don't exercise. index.js itself
 * stays a thin `onSchedule(...)` wrapper around this.
 */

import { buildNotifications, SOON_WINDOW_MIN } from '../shared/lib/notifications.js'
import { tasksForNotifications } from './dayModel.js'
import { selectPushable } from './pushSelection.js'

/** Every uid that has at least one push token registered, and the tokens
    themselves — a collectionGroup read rather than scanning every user
    document, so someone who has never opted in costs nothing to skip. */
async function tokensByUid(db) {
  const snap = await db.collectionGroup('pushTokens').get()
  const byUid = new Map()
  for (const doc of snap.docs) {
    const uid = doc.ref.parent.parent.id
    const list = byUid.get(uid) ?? []
    list.push({ ref: doc.ref, token: doc.data().token })
    byUid.set(uid, list)
  }
  return byUid
}

/**
 * @param db        a Firestore-shaped client (real Admin SDK, or a test double)
 * @param messaging an FCM-shaped client — needs `sendEachForMulticast`
 * @param todayKey  this run's "today", as a day key
 * @param nowMin    this run's clock, as minutes since midnight
 * @param logger    `{ warn, error }` — defaults to console so a caller that
 *                  doesn't care can ignore it
 */
export async function runPushNotifications({ db, messaging, todayKey, nowMin, logger = console }) {
  const byUid = await tokensByUid(db)
  if (byUid.size === 0) return { usersProcessed: 0, pushesSent: 0 }

  let pushesSent = 0

  for (const [uid, devices] of byUid) {
    try {
      const tasksSnap = await db.collection('users').doc(uid).collection('tasks').get()
      const rawTasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

      const items = buildNotifications(tasksForNotifications(rawTasks, todayKey), todayKey, nowMin, SOON_WINDOW_MIN)

      const pushStateRef = db.collection('users').doc(uid).collection('meta').doc('pushState')
      const pushStateSnap = await pushStateRef.get()
      const alreadySentIds = pushStateSnap.exists ? (pushStateSnap.data().sentIds ?? []) : []

      const { toSend, nextSentIds } = selectPushable(items, alreadySentIds)

      // One push per item rather than one bundled push for all of them —
      // each has its own title/body, and the OS notification tray is a
      // better place to triage several distinct things than one message
      // trying to summarize them.
      for (const item of toSend) {
        const title = item.kind === 'overdue' ? 'Overdue' : item.kind === 'now' ? 'Happening now' : 'Starting soon'
        const response = await messaging.sendEachForMulticast({
          tokens: devices.map((d) => d.token),
          notification: { title, body: item.task.title },
          webpush: { fcmOptions: { link: '/' } },
        })
        pushesSent += response.successCount ?? 0

        const deadCodes = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']
        response.responses.forEach((result, i) => {
          if (!result.success && deadCodes.includes(result.error?.code)) {
            devices[i].ref.delete().catch((err) => logger.warn('Could not remove a dead push token.', err))
          }
        })
      }

      /* Written every run, even one with nothing to send — selectPushable
         also PRUNES ids that stopped being current (a task that resolved),
         and skipping this write whenever toSend was empty would leave that
         pruning stuck in memory instead of on the document. Without it, a
         task that resolves and later comes back (rescheduled off overdue,
         then overdue again) would find its old id still sitting in the
         stored sent list and never notify a second time — exactly the bug
         this line exists to prevent, caught by
         functions/test/runPushNotifications.test.js before this ever ran
         against anything real. One small write every few minutes for an
         active user costs nothing worth optimizing away. */
      await pushStateRef.set({ sentIds: nextSentIds, updatedAt: Date.now() })
    } catch (caught) {
      // One user's bad data (a corrupt doc, a transient read failure)
      // should never take the whole run down with it — everyone else's
      // notifications still need to go out on schedule.
      logger.error(`Could not process push notifications for ${uid}.`, caught)
    }
  }

  return { usersProcessed: byUid.size, pushesSent }
}
