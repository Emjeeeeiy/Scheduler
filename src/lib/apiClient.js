/* The one `fetch` wrapper for this app's own /api/* routes — the AI helpers
 * (aiClient.js) and the push routes (pushSubscription.js, useReminderSync.js)
 * all go through it, so they share one contract:
 *
 *   authenticate -> ask -> on ANYTHING short of a clean JSON answer (signed
 *   out, offline, a timeout, a non-2xx status, a body that isn't JSON) resolve
 *   to `null` rather than throw.
 *
 * Callers branch on "got an answer or not", never on a thrown error: for the
 * AI routes a failure just means the heuristic that already answered stands,
 * and for push it means "try again on the next sync".
 */

import { auth as firebaseAuth } from '../firebase.js'

const DEFAULT_TIMEOUT_MS = 8000

/**
 * @param path       e.g. '/api/parse-task'
 * @param body       JSON-serialisable
 * @param timeoutMs  abort after this long
 * @param auth       send the signed-in user's Firebase ID token (the default).
 *                   Pass `false` for the few routes that are deliberately
 *                   session-less — turning reminders off from the sign-in
 *                   screen has to work while signed out — in which case no
 *                   session is required either.
 */
export async function callApi(path, body, { timeoutMs = DEFAULT_TIMEOUT_MS, auth = true } = {}) {
  if (auth && !firebaseAuth?.currentUser) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers = { 'Content-Type': 'application/json' }
    if (auth) headers.Authorization = `Bearer ${await firebaseAuth.currentUser.getIdToken()}`
    const response = await fetch(path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) return null
    return await response.json()
  } catch (caught) {
    // Covers a rejected getIdToken(), AbortError from the timeout, a
    // network failure, and a response body that wasn't valid JSON — all
    // the same outcome from every caller's point of view.
    console.warn(`Request to ${path} did not complete.`, caught)
    return null
  } finally {
    clearTimeout(timer)
  }
}
