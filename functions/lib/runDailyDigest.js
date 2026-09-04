/* The actual work behind the sendDailyDigest schedule — same reasoning as
 * runPushNotifications.js: pulled out of index.js and written against
 * injected `db`/`sendEmail` rather than the Admin SDK/fetch directly, so
 * functions/test/runDailyDigest.test.js can exercise the real orchestration
 * (who gets skipped, what happens when a send fails, per-user isolation)
 * without a live project.
 */

import { tasksOnDay, expandHorizon, normalizeAll } from './dayModel.js'
import { buildDigestSummary, renderDigestEmail } from './digest.js'

/**
 * @param db        a Firestore-shaped client
 * @param sendEmail `({ to, subject, text, html }) => Promise<{ ok, status?, body? }>`
 *                  — the one thing this doesn't own is HOW an email actually
 *                  gets sent; index.js supplies the real SendGrid call, tests
 *                  supply a fake that just records what it was asked to send
 * @param todayKey  this run's "today"
 * @param nowMin    this run's clock, in minutes since midnight
 */
export async function runDailyDigest({ db, sendEmail, todayKey, nowMin, logger = console }) {
  const usersSnap = await db.collection('users').where('dailyDigestEnabled', '==', true).get()
  if (usersSnap.empty) return { usersProcessed: 0, emailsSent: 0 }

  let emailsSent = 0

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id
    try {
      const email = userDoc.data().email
      if (!email) continue // a Google account with no email on the profile doc yet

      const tasksSnap = await db.collection('users').doc(uid).collection('tasks').get()
      const rawTasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

      const summary = buildDigestSummary({
        todayItems: tasksOnDay(rawTasks, todayKey),
        allTasks: normalizeAll(rawTasks),
        upcomingPool: [...normalizeAll(rawTasks), ...expandHorizon(rawTasks, todayKey, 7)],
        todayKey,
        fromMin: nowMin,
      })
      const { subject, text, html } = renderDigestEmail(summary)

      const result = await sendEmail({ to: email, subject, text, html })
      if (!result.ok) {
        logger.error(`Email provider rejected the digest for ${uid}: ${result.status} ${result.body ?? ''}`)
        continue
      }
      emailsSent += 1
    } catch (caught) {
      logger.error(`Could not send the daily digest to ${uid}.`, caught)
    }
  }

  return { usersProcessed: usersSnap.docs.length, emailsSent }
}
