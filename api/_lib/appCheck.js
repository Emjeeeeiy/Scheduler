/* Verifies a Firebase App Check token (the `X-Firebase-AppCheck` header), the
 * same way auth.js verifies an ID token: `jose` against Google's public key set,
 * no Admin SDK.
 *
 * What it adds on top of a valid account: the request came from this app, served
 * from our registered domain (attested by reCAPTCHA Enterprise in the browser) —
 * not from a script that obtained an account's token some other way. It is the
 * answer to "anyone can read our public web config and call the APIs directly".
 *
 * OFF until APPCHECK_ENFORCE=true. Roll it out in this order, or real users get
 * locked out: (1) register the app and set VITE_APPCHECK_SITE_KEY, deploy;
 * (2) watch Firebase's App Check metrics until nearly every request is verified;
 * (3) only then set APPCHECK_ENFORCE=true. A client from before step 1 (a cached
 * PWA) has no token and is refused once enforcement is on, until it reloads.
 *
 * Only routes behind verifyRequest enforce it. The session-less push calls
 * (a service worker's subscription rotation, turning reminders off from the
 * sign-in screen) cannot attach a token — a service worker has no Firebase — and
 * are protected by their capability-URL proof and per-IP limits instead.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose'

/** Its own error type, not auth.js's AuthError: auth.js is what calls this, and
    importing it back would make the two files import each other. verifyRequest
    turns this into the AuthError the routes already know how to answer. */
export class AppCheckError extends Error {
  constructor(status, message, cause) {
    super(message)
    this.status = status
    this.cause = cause
  }
}

const JWKS = createRemoteJWKSet(new URL('https://firebaseappcheck.googleapis.com/v1/jwks'))

export const appCheckEnforced = () => process.env.APPCHECK_ENFORCE === 'true'

export async function verifyAppCheck(req) {
  // The number, not the id: App Check's issuer and audience are built from the
  // project NUMBER (Firebase console → Project settings → General).
  const projectNumber = process.env.FIREBASE_PROJECT_NUMBER?.trim()
  if (!projectNumber) throw new AppCheckError(500, 'Server is missing FIREBASE_PROJECT_NUMBER.')

  const header = req.headers?.['x-firebase-appcheck']
  const token = typeof header === 'string' ? header.trim() : ''
  if (!token) throw new AppCheckError(403, 'App Check verification failed.')

  try {
    await jwtVerify(token, JWKS, {
      issuer: `https://firebaseappcheck.googleapis.com/${projectNumber}`,
      audience: `projects/${projectNumber}`,
      algorithms: ['RS256'],
    })
  } catch (caught) {
    throw new AppCheckError(403, 'App Check verification failed.', caught)
  }
}
