/* Server-side push orchestration — the work behind sendPushNotifications.
 *
 * Pulls db/messaging out as arguments so functions/test/runPushNotifications.test.js
 * can run it against an in-memory Firestore/FCM double. index.js supplies the
 * real Admin SDK singletons.
 *
 * Each device registers one doc at users/{uid}/fcmTokens/{tokenId}. This
 * scans only those owners (collectionGroup) and for each uid:
 *  1) derives that uid's local {key,min} from its stored timeZone,
 *  2) builds the same notifications the bell shows,
 *  3) dedupes via users/{uid}/meta/pushState,
 *  4) sends one multicast per pushable item to that uid's tokens only.
 */

import { buildNotifications, SOON_WINDOW_MIN } from '../shared/lib/notifications.js'
import { tasksForNotifications } from './dayModel.js'
import { selectPushable } from './pushSelection.js'
import { localNowInZone } from './timeZone.js'

/** Every uid that has at least one FCM token, plus its docs. */
async function tokensByUid(db) {
  const snap = await db.collectionGroup('fcmTokens').get()
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
 * @param {object} opts.db        — Firestore (Admin SDK or FakeFirestore)
 * @param {object} opts.messaging — FCM (Admin SDK getMessaging() or fake with sendEachForMulticast)
 * @param {Date}   [opts.now]     — UTC instant to evaluate push at; defaults to new Date()
 * @param {object} [opts.logger]  — {warn,error}
 * @return {{usersProcessed:number, pushesSent:number}}
 */
export async function runPushNotifications({ db, messaging, now = new Date(), logger = console }) {
  const byUid = await tokensByUid(db)
  if (byUid.size === 0) return { usersProcessed: 0, pushesSent: 0 }

  let pushesSent = 0

  for (const [uid, devices] of byUid) {
    try {
      // Per-user local clock — critical: tasks store wall-clock in that zone.
      const profileSnap = await db.collection('users').doc(uid).get()
      const timeZone = profileSnap.exists ? profileSnap.data()?.timeZone : null
      const { key: todayKey, min: nowMin } = localNowInZone(timeZone, now)

      const tasksSnap = await db.collection('users').doc(uid).collection('tasks').get()
      const rawTasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

      const items = buildNotifications(
        tasksForNotifications(rawTasks, todayKey),
        todayKey,
        nowMin,
        SOON_WINDOW_MIN,
      )

      const pushStateRef = db.collection('users').doc(uid).collection('meta').doc('pushState')
      const pushStateSnap = await pushStateRef.get()
      const alreadySentIds = pushStateSnap.exists ? (pushStateSnap.data().sentIds ?? []) : []

      const { toSend, nextSentIds } = selectPushable(items, alreadySentIds)

      for (const item of toSend) {
        const title =
          item.kind === 'overdue' ? 'Overdue' : item.kind === 'now' ? 'Happening now' : 'Starting soon'
        const body = item.task.title
        const response = await messaging.sendEachForMulticast({
          tokens: devices.map((d) => d.token),
          notification: { title, body },
          webpush: { fcmOptions: { link: '/' } },
        })
        pushesSent += response.successCount ?? 0

        const deadCodes = [
          'messaging/registration-token-not-registered',
          'messaging/invalid-registration-token',
          'messaging/invalid-argument',
        ]
        response.responses.forEach((result, i) => {
          if (!result.success && deadCodes.includes(result.error?.code)) {
            devices[i].ref.delete().catch((err) => logger.warn('Could not remove a dead push token.', err))
          }
        })
      }

      // Persist every run, even when toSend is empty — selectPushable also
      // prunes ids that stopped being current; skipping this would leave a
      // resolved task's id stuck forever and block its next legitimate push.
      await pushStateRef.set({ sentIds: nextSentIds, updatedAt: Date.now() })
    } catch (caught) {
      logger.error(`Could not process push notifications for ${uid}.`, caught)
    }
  }

  return { usersProcessed: byUid.size, pushesSent }
}
