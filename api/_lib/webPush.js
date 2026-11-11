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

/**
 * Checks and applies the VAPID settings, throwing an ApiError that says exactly
 * what is wrong. Safe to call repeatedly (it does the work once).
 *
 * tick.js calls this BEFORE it takes anything off the queue: a missing or
 * malformed setting must fail the run loudly while the reminders are still
 * queued, not after they have been consumed.
 */
export function ensureConfigured() {
  if (configured) return
  const settings = {
    VAPID_SUBJECT: process.env.VAPID_SUBJECT?.trim(),
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY?.trim(),
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY?.trim(),
  }
  const missing = Object.entries(settings)
    .filter(([, value]) => !value)
    .map(([name]) => name)
  if (missing.length > 0) {
    throw new ApiError(500, `Server is missing ${missing.join(', ')}.`)
  }
  try {
    webpush.setVapidDetails(settings.VAPID_SUBJECT, settings.VAPID_PUBLIC_KEY, settings.VAPID_PRIVATE_KEY)
  } catch (caught) {
    // web-push's own message names the offending value (a subject that is not
    // an https: or mailto: URL, a key that is not URL-safe base64, …) — useful
    // in the server log, but not something to hand to any signed-in caller of
    // /api/push/diagnose.
    console.error('VAPID configuration is invalid:', caught?.message ?? caught)
    throw new ApiError(500, 'VAPID configuration is invalid — see the server logs.')
  }
  configured = true
}

/** The public half of our VAPID key pair — safe to show. The app compares it
    with the one built into the client to spot a mismatch. */
export function getPublicKey() {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null
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
  ensureConfigured()
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
