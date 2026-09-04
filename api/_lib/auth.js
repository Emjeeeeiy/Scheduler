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
    lookup itself, since only RS256 keys live at that endpoint), `iss` and
    `aud` matching the project, and `exp` in the future (jwtVerify's own
    default). `sub`/`auth_time` are Firebase Admin SDK's own additional
    checks beyond what a bare JWT library does; skipped here as more rigor
    than this endpoint needs — a stolen, still-valid ID token is a Firebase
    Auth session-security question, not something this proxy can add much
    to by re-deriving Admin SDK's exact checklist. */
export async function verifyRequest(req) {
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

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    })
    return payload.sub // the Firebase uid — not currently used beyond proving a real signed-in caller, but kept for future per-user logging/rate-limiting
  } catch (caught) {
    throw new AuthError(401, 'Invalid or expired token.', caught)
  }
}

export class AuthError extends Error {
  constructor(status, message, cause) {
    super(message)
    this.status = status
    this.cause = cause
  }
}
