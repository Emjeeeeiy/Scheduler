/* Sending one Web Push message: VAPID-signed and encrypted by the `web-push`
 * library, delivered by the browser vendor's own push service (FCM for
 * Chrome, Mozilla's autopush, Apple's, Windows') to whichever device holds the
 * subscription. No Firebase project is involved — the VAPID key pair is ours.
 *
 * Never throws for a delivery problem: the caller (api/push/tick.js) has to
 * tell "this device is gone, forget it" apart from "the push service had a
 * bad moment, try again", and that distinction is the return value here.
 * It DOES throw for a missing server setting, because no amount of retrying
 * fixes that and it should fail loudly.
 */

import webpush from 'web-push'
import { ApiError } from './pushRoute.js'

let configured = false

function configure() {
  if (configured) return
  const subject = process.env.VAPID_SUBJECT
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!subject || !publicKey || !privateKey) {
    throw new ApiError(500, 'Server is missing VAPID_SUBJECT, VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY.')
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
}

/**
 * @param subscription `{ endpoint, keys: { p256dh, auth } }`
 * @param payload      JSON-serialisable; encrypted end to end
 * @param ttl          seconds the push service may hold it for an offline device
 * @return `{ ok, gone, retryable, status }`
 *         gone      — the push service says this subscription no longer exists
 *                     (404/410): the user uninstalled, revoked permission, or
 *                     the browser rotated it
 *         retryable — a failure that may well succeed shortly (429, 5xx, no
 *                     response at all) rather than a permanent refusal
 */
export async function sendPush(subscription, payload, { ttl = 60, urgency = 'high' } = {}) {
  configure()
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: ttl,
      urgency,
      timeout: 8000,
    })
    return { ok: true, gone: false, retryable: false, status: 201 }
  } catch (caught) {
    const status = Number.isInteger(caught?.statusCode) ? caught.statusCode : null
    return {
      ok: false,
      gone: status === 404 || status === 410,
      retryable: status === null || status === 429 || status >= 500,
      status,
    }
  }
}
