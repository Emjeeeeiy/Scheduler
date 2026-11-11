/* The one place the app's own /api/* calls learn about Firebase App Check.
 *
 * App Check proves a request comes from THIS app, served from our domain, and
 * not from a script that merely holds a valid account's token. firebase.js
 * registers a token provider here once App Check is initialised (it only is
 * when VITE_APPCHECK_SITE_KEY is set); apiClient.js asks for the header.
 *
 * Deliberately free of any Firebase import: the many tests that mock
 * firebase.js stay unaffected, and with nothing registered this does nothing —
 * the same "an enhancement that is simply off" stance as the AI layer.
 */

let provider = null

/** @param fn `() => Promise<string>` — a current App Check token, or null to unregister */
export function setAppCheckTokenProvider(fn) {
  provider = fn
}

/** `{ 'X-Firebase-AppCheck': token }`, or `{}` when App Check is off or a token
    could not be had. Never throws: a failed attestation must not take the
    feature down with it — the server decides whether a missing header is fatal
    (APPCHECK_ENFORCE). */
export async function appCheckHeaders() {
  if (!provider) return {}
  try {
    const token = await provider()
    return token ? { 'X-Firebase-AppCheck': token } : {}
  } catch (caught) {
    console.warn('Could not get an App Check token.', caught)
    return {}
  }
}
