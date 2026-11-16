/* The one place firebase-admin is touched. Everything else in mcp/ takes a
 * store, so it can be tested without this file or a live project.
 *
 * Auth: a service-account key, because the Admin SDK has no end user to act as
 * and — unlike the browser SDK — is not subject to firestore.rules. That is
 * exactly why store.js pins every path to one configured uid. The key is a
 * full-project credential: keep it in Vercel's env vars, never in the repo.
 *
 * FIREBASE_SERVICE_ACCOUNT may be the key file's JSON as-is, or that JSON
 * base64-encoded. Base64 is the safer choice for .env files and dashboards,
 * which mangle the key's multi-line private_key.
 */

import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore'
import { createScheduleStore } from './store.js'

// Named, so this never collides with an app a future module initialises.
const APP_NAME = 'cadence-mcp'

/** @throws a plain Error whose message never includes the credential itself. */
export function parseServiceAccount(raw) {
  const text = String(raw ?? '').trim()
  if (!text) throw new Error('FIREBASE_SERVICE_ACCOUNT is empty.')

  let json = text
  if (!text.startsWith('{')) {
    try {
      json = Buffer.from(text, 'base64').toString('utf8')
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is neither JSON nor base64.')
    }
  }

  let account
  try {
    account = JSON.parse(json)
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON (or base64 of JSON).')
  }
  for (const field of ['project_id', 'client_email', 'private_key']) {
    if (typeof account?.[field] !== 'string' || !account[field]) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT is missing "${field}".`)
    }
  }
  // Pasted into a dashboard, the key's newlines often arrive as the two
  // characters "\n". The PEM parser needs real ones.
  return { ...account, private_key: account.private_key.replace(/\\n/g, '\n') }
}

let cachedDb = null

/** One Firestore client per function instance, reused across warm invocations. */
export function getAdminDb(raw = process.env.FIREBASE_SERVICE_ACCOUNT) {
  if (cachedDb) return cachedDb
  const existing = getApps().find((app) => app.name === APP_NAME)
  const app =
    existing ?? initializeApp({ credential: cert(parseServiceAccount(raw)) }, APP_NAME)
  cachedDb = getFirestore(app)
  return cachedDb
}

/** The real store, for api/mcp.js. */
export function createAdminStore(config) {
  return createScheduleStore({
    db: getAdminDb(),
    uid: config.uid,
    deleteField: () => FieldValue.delete(),
    fieldPath: (...segments) => new FieldPath(...segments),
  })
}
