/* "Is push actually working for me, and if not, which link is broken?"
 *
 * Asks /api/push/diagnose (api/push/diagnose.js) what the server knows about
 * this account — registered devices, queued reminders, its VAPID setup — and
 * turns the answer into a plain sentence. Before this existed a failed push
 * looked identical from the outside whichever of five things had gone wrong.
 *
 * The wording lives here, away from the Settings markup, so each cause can be
 * tested on its own (tests/pushDiagnostics.test.jsx).
 */

import { callApi } from './apiClient.js'

/** @return the server's diagnosis, or null if it couldn't be reached. */
export function fetchPushDiagnostics() {
  return callApi('/api/push/diagnose', {})
}

/** Same, and also sends a test notification to every registered device. */
export function sendTestPush() {
  return callApi('/api/push/diagnose', { test: true })
}

/** The VAPID public key this build of the app was made with. */
export const clientVapidKey = () => import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''

/** A key the client and the server both have, but that differ: every send is
    then refused (403) because the subscription was made for the other key. */
const keysDiffer = (serverKey, clientKey) => Boolean(serverKey) && Boolean(clientKey) && serverKey !== clientKey

const KEYS_DIFFER =
  "This app and the server use different push keys, so the push service refuses every reminder. " +
  "Make VITE_VAPID_PUBLIC_KEY equal VAPID_PUBLIC_KEY in Vercel, redeploy, then turn push off and on."

/** "9:05 AM" today, "Sat 9:05 AM" on another day. */
function whenLabel(ms, now) {
  const at = new Date(ms)
  const sameDay = new Date(now).toDateString() === at.toDateString()
  return sameDay
    ? at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : at.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

/** The first thing wrong, in the order it would have to be fixed, or null. */
function findProblem(diagnosis, clientKey) {
  if (diagnosis.configured === false) {
    return `The server's push setup is broken: ${diagnosis.configError ?? 'unknown problem'}`
  }
  if (keysDiffer(diagnosis.vapidPublicKey, clientKey)) return KEYS_DIFFER
  if ((diagnosis.devices?.length ?? 0) === 0) {
    return 'The server has no device registered for your account. Turn push off and on.'
  }
  return null
}

/**
 * @return `{ text, problem }` — `text` is the status line ("1 device · 5
 *         reminders scheduled · next: Standup at 9:05 AM"), `problem` is what
 *         is wrong, or null when everything checks out.
 */
export function summarizeDiagnostics(diagnosis, clientKey = clientVapidKey(), now = Date.now()) {
  if (!diagnosis) return { text: null, problem: 'Could not reach the server to check push status.' }

  const devices = diagnosis.devices?.length ?? 0
  const count = diagnosis.reminders?.count ?? 0
  const next = diagnosis.reminders?.next
  const parts = [
    `${devices} ${devices === 1 ? 'device' : 'devices'}`,
    `${count} ${count === 1 ? 'reminder' : 'reminders'} scheduled`,
  ]
  if (next) parts.push(`next: ${next.title} at ${whenLabel(next.fireAt, now)}`)

  return { text: parts.join(' · '), problem: findProblem(diagnosis, clientKey) }
}

/**
 * What to tell someone after "Send test notification".
 * @return `{ ok, message }`
 */
export function explainTest(diagnosis, clientKey = clientVapidKey()) {
  if (!diagnosis) return { ok: false, message: 'Could not reach the server. Try again.' }

  const results = diagnosis.test ?? []
  const delivered = results.filter((result) => result.ok).length

  if (delivered > 0) {
    const message =
      delivered === results.length
        ? `Test sent to ${delivered === 1 ? 'your device' : `${delivered} devices`}. It should appear in a few seconds.`
        : `Test sent to ${delivered} of ${results.length} devices; the others were refused or unreachable.`
    return { ok: true, message }
  }

  // Nothing was sent at all: no device, or the server isn't set up.
  if (results.length === 0) {
    return { ok: false, message: findProblem(diagnosis, clientKey) ?? 'Nothing was sent.' }
  }

  // It was sent and refused. Say why, most specific first.
  if (results.some((result) => result.gone)) {
    return { ok: false, message: "This device's push subscription has expired. Turn push off and on." }
  }
  if (keysDiffer(diagnosis.vapidPublicKey, clientKey)) return { ok: false, message: KEYS_DIFFER }
  const refused = results.find((result) => result.status === 401 || result.status === 403)
  if (refused) {
    return {
      ok: false,
      message: `The push service refused it (${refused.status}). That usually means the app's and the server's push keys differ — see README-push.md.`,
    }
  }
  const status = results.find((result) => result.status)?.status
  return {
    ok: false,
    message: `The push service could not deliver it${status ? ` (status ${status})` : ''}. Try again in a minute.`,
  }
}
