/* Cloud Functions for Cadence — the Phase 6 pieces that need a server at
 * all: push notifications and the daily digest email. Everything else the
 * app does stays exactly what it was, client + Firestore.
 *
 * Deliberately thin: each export below is just onSchedule(...) wrapped
 * around a runXxx function from functions/lib/, which takes the Admin
 * SDK/fetch as arguments instead of importing them directly. That split is
 * what makes the actual orchestration testable at all — see
 * functions/test/runPushNotifications.test.js and
 * functions/test/runDailyDigest.test.js, which run the real logic against a
 * small in-memory Firestore/FCM/email stand-in. Nothing in THIS file is
 * covered by those tests, or by anything else — it is three lines of wiring
 * per function, and the one part of this whole phase that genuinely needs a
 * live project to confirm. See README-functions.md before deploying.
 *
 * KNOWN LIMITATION: both schedules run in one fixed timezone (UTC by
 * default) — there is no per-user timezone stored anywhere yet, so
 * "starting soon" and the digest's send time are both UTC-relative. Fine
 * for one person who knows that going in; would need a real per-user
 * timezone field before this could serve more than one.
 */

import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions'

import { toKey } from './shared/lib/date.js'
import { runPushNotifications } from './lib/runPushNotifications.js'
import { runDailyDigest } from './lib/runDailyDigest.js'

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

export const sendPushNotifications = onSchedule('every 5 minutes', async () => {
  const { key: todayKey, min: nowMin } = nowUtc()
  const result = await runPushNotifications({ db, messaging, todayKey, nowMin, logger })
  logger.info('sendPushNotifications', result)
})

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
