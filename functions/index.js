/* Cloud Functions for Cadence.
 *
 * - sendDailyDigest: Phase 6 email digest.
 * - sendPushNotifications: Web Push via FCM (every 5 min), timeZone-aware.
 *
 * Both are thin onSchedule wrappers around testable lib modules
 * (runDailyDigest / runPushNotifications) that take Admin SDK deps as
 * arguments. See README-functions.md before deploying.
 */

import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions'

import { toKey } from './shared/lib/date.js'
import { runDailyDigest } from './lib/runDailyDigest.js'
import { runPushNotifications } from './lib/runPushNotifications.js'

initializeApp()
const db = getFirestore()
const messaging = getMessaging()

const sendgridApiKey = defineSecret('SENDGRID_API_KEY')
/* The address digest emails claim to come FROM. SendGrid (like every
   transactional-email provider) refuses to send as a domain it hasn't
   verified, so this has to be an address on a domain you've set up sender
   verification for — see README-functions.md. Not a secret, just
   configuration, so it's a plain param rather than defineSecret. */
const digestFromEmail = defineSecret('DIGEST_FROM_EMAIL')

/** UTC "now" as this app's own {key, min} shape — see date.js's header on
    why the rest of the codebase never crosses a Date object at a boundary
    like this one has to, right here, to ask the platform clock a question. */
function nowUtc() {
  const now = new Date()
  return {
    key: toKey(now),
    min: now.getUTCHours() * 60 + now.getUTCMinutes(),
  }
}

async function sendViaSendGrid({ to, subject, text, html }) {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sendgridApiKey.value()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: digestFromEmail.value(), name: 'Cadence' },
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html },
      ],
    }),
  })
  return { ok: response.ok, status: response.status, body: response.ok ? null : await response.text() }
}

export const sendDailyDigest = onSchedule(
  { schedule: '0 7 * * *', timeZone: 'Etc/UTC', secrets: [sendgridApiKey, digestFromEmail] },
  async () => {
    const { key: todayKey, min: nowMin } = nowUtc()
    const result = await runDailyDigest({ db, sendEmail: sendViaSendGrid, todayKey, nowMin, logger })
    logger.info('sendDailyDigest', result)
  },
)

/** Web Push: ~every 5 min, per-user local clock (see functions/lib/timeZone.js).
 *  May arrive up to ~5 min after the target "soon/now" window opens — this is
 *  Cloud Scheduler granularity, not per-task Cloud Tasks. No queue needed at this scale.
 */
export const sendPushNotifications = onSchedule(
  { schedule: 'every 5 minutes', timeZone: 'Etc/UTC' },
  async () => {
    const result = await runPushNotifications({ db, messaging, now: new Date(), logger })
    logger.info('sendPushNotifications', result)
  },
)
