/* Verifies a Firebase ID token sent by the client, so /api/* is never an
 * open proxy against the shared Gemini free-tier quota — anyone who found
 * the URL could otherwise burn it.
 *
 * Deliberately `jose` against Google's public JWKS rather than
 * `firebase-admin`: the admin SDK pulls in a service-account credential
 * flow and a much heavier dependency tree, which matters here because this
 * runs on every cold start of a serverless function. `jose`'s
 * createRemoteJWKSet caches the keys itself (respecting the endpoint's own
 * Cache-Control) and needs no credentials at all — verifying a token only
 * needs Google's PUBLIC keys, never a private one.
 *
 * The JWKS URL below is Firebase's own JWK-format key set for ID tokens
 * (confirmed live: RS256 keys, `{keys:[...]}` shape) — distinct from the
 * X.509-certificate endpoint Firebase's own docs lead with, which `jose`
 * cannot consume directly.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose'
import { AppCheckError, appCheckEnforced, verifyAppCheck } from './appCheck.js'

const JWKS_URL = new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
)

// One remote key set per function instance, reused across invocations on a
// warm start — createRemoteJWKSet does its own caching against the
// endpoint's Cache-Control, so there is nothing to gain from re-creating
// this per request, only extra fetches.
const JWKS = createRemoteJWKSet(JWKS_URL)

/** Every Firebase ID token's issuer names the specific project it belongs
    to, and every claim this function checks is exactly what Firebase's own
    documented verification contract requires: RS256 (enforced by JWKS
    lookup itself, since only RS256 keys live at that endpoint — and pinned
    explicitly below as well), `iss` and `aud` matching the project, `exp` in
    the future (jwtVerify's own default), and a non-empty `sub` of at most 128
    characters, as Firebase's own contract requires.

    Every route that costs us something — a Gemini call, a push send, a slot
    in the reminder queue — also needs a VERIFIED email address
    (`email_verified`). Registration is open, so without that an account made
    for an address nobody controls could use all of it. The one caller that
    opts out is account deletion's push purge: an unverified account must
    still be able to delete itself completely.

    @return the Firebase uid */
export async function verifyRequest(req, { requireVerifiedEmail = true } = {}) {
  /* Deliberately its OWN env var, not a re-read of the client's
     VITE_FIREBASE_PROJECT_ID — same value, but VITE_ is a client-build-time
     convention, and a serverless function reading it is exactly the kind of
     shortcut that looks fine locally and then isn't: under `vercel dev`,
     VITE_-prefixed vars reach the frontend's own dev server but not this
     function's process.env the same way a plain server var does. Costs one
     duplicate value in .env.local; buys not depending on however a given
     platform happens to route a client-prefixed convention into a
     server runtime. */
  const projectId = process.env.FIREBASE_PROJECT_ID
  if (!projectId) {
    throw new AuthError(500, 'Server is missing FIREBASE_PROJECT_ID.')
  }

  const header = req.headers.authorization ?? req.headers.Authorization
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
  if (!token) throw new AuthError(401, 'Missing bearer token.')

  let payload
  try {
    const verified = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ['RS256'],
    })
    payload = verified.payload
  } catch (caught) {
    throw new AuthError(401, 'Invalid or expired token.', caught)
  }

  const uid = payload.sub
  if (typeof uid !== 'string' || uid.length === 0 || uid.length > 128) {
    throw new AuthError(401, 'Invalid or expired token.')
  }
  if (requireVerifiedEmail && payload.email_verified !== true) {
    throw new AuthError(403, 'Verify your email address to use this feature.')
  }

  // Off until APPCHECK_ENFORCE=true — see appCheck.js for the rollout order.
  if (appCheckEnforced()) {
    try {
      await verifyAppCheck(req)
    } catch (caught) {
      if (caught instanceof AppCheckError) throw new AuthError(caught.status, caught.message, caught.cause)
      throw caught
    }
  }
  return uid
}

export class AuthError extends Error {
  constructor(status, message, cause) {
    super(message)
    this.status = status
    this.cause = cause
  }
}
