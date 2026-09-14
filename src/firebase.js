import { initializeApp } from 'firebase/app'
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import {
  deleteDoc,
  doc,
  getDoc,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  runTransaction,
  setDoc,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/* Config arrives from .env.local, which is gitignored and absent on a fresh
   clone. Rather than let initializeApp fail deep inside the SDK with an opaque
   error, detect it here and let App render the setup instructions instead. */
export const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

export const missingConfigKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key)

let app = null
let auth = null
let db = null

if (firebaseReady) {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)

  /* persistentLocalCache keeps the whole working set in IndexedDB: the app
     opens instantly on reload, keeps working offline, and queues writes until
     the connection returns. multipleTabManager stops two open tabs from
     fighting over that single IndexedDB lease. */
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })
}

export { auth, db }

/**
 * Configure Firebase Auth persistence based on user preference.
 * When rememberMe is true, browserLocalPersistence keeps the user signed in
 * across browser restarts until explicit logout.
 * When rememberMe is false, browserSessionPersistence ends the session when
 * the browser tab or window is closed.
 */
export async function setAuthPersistence(rememberMe = true) {
  if (!auth) return
  const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence
  try {
    await setPersistence(auth, persistence)
  } catch (caught) {
    console.warn('Could not set auth persistence:', caught)
  }
}

const provider = new GoogleAuthProvider()

/* The `users/{uid}` doc otherwise stays empty for a Google account until its
   first photo upload, which makes one impossible to pick out of the
   Firestore console — every row is just a bare uid. Writing the Google
   email (and name, for the same reason) here means every sign-in keeps it
   current, and merge:true means it never clobbers photoBase64 or anything
   else already on the doc. */
export async function signInWithGoogle({ rememberMe = true } = {}) {
  if (!auth || !db) throw new Error('Firebase is not configured.')
  await setAuthPersistence(rememberMe)
  const credential = await signInWithPopup(auth, provider)
  await setDoc(
    doc(db, 'users', credential.user.uid),
    { email: credential.user.email, displayName: credential.user.displayName ?? null },
    { merge: true },
  )
}

export async function logout() {
  if (!auth) return
  await signOut(auth)
}

/**
 * Deleting an account is a "sensitive" Auth operation: Firebase refuses it
 * outright (`auth/requires-recent-login`) unless the session was established
 * in roughly the last few minutes. Rather than let a visitor hit that wall
 * mid-deletion — after their data is already gone, since Firestore's rules
 * would reject the write once signed out anyway — the caller always
 * re-authenticates first, deliberately, as part of confirming the delete.
 * Google re-proves itself with a popup; a username/password account needs
 * the password back, since nothing here stores it.
 */
export async function reauthenticate(password) {
  if (!auth?.currentUser) throw new Error('Not signed in.')
  const providerId = auth.currentUser.providerData[0]?.providerId
  if (providerId === 'password') {
    if (!password) {
      throw appError('auth/requires-recent-login', 'Enter your password to continue.')
    }
    const credential = EmailAuthProvider.credential(auth.currentUser.email, password)
    await reauthenticateWithCredential(auth.currentUser, credential)
  } else {
    await reauthenticateWithPopup(auth.currentUser, provider)
  }
}

/** Removes the Auth account itself. The caller is responsible for wiping the
    account's Firestore data FIRST, while still signed in — this call ends
    the session, and the security rules would refuse those writes afterward. */
export async function deleteAccount() {
  if (!auth?.currentUser) throw new Error('Not signed in.')
  await deleteUser(auth.currentUser)
}

function appError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

/* Both auth paths touch Firestore before there is anything useful to show the
   person typing, so both can fail for a reason that has nothing to do with
   their credentials. `permission-denied` here means one thing in practice: the
   rules in firestore.rules were never published, so a production-mode database
   is still denying everything (README step 6). The SDK's own wording —
   "Missing or insufficient permissions" — surfaces on the login form as an
   accusation the visitor can do nothing about, so name the real cause instead. */
function describeInfraFailure(caught, action) {
  if (caught.code === 'permission-denied') {
    return appError(
      'app/rules-not-published',
      `${action} needs this project’s Firestore rules — publish firestore.rules in the Firebase console, then try again.`,
    )
  }
  if (caught.code === 'unavailable') {
    return appError(
      'auth/network-request-failed',
      'Network error — check your connection and try again.',
    )
  }
  return caught
}

const normalizeUsername = (raw) => raw.trim().toLowerCase()

/* No length or character-set restriction on a username — the only rejects
   left are the ones Firestore itself would reject as a document id
   regardless of what this app wants: empty, a bare "." or "..", or containing
   "/" (which would otherwise split into a nested path). Everything else a
   person might type is accepted as-is. */
function assertUsableUsername(normalized) {
  if (!normalized || normalized === '.' || normalized === '..' || normalized.includes('/')) {
    throw appError('app/invalid-username', 'That username isn’t allowed — try something else.')
  }
}

/**
 * Firebase Auth's email/password provider has no concept of a username, so an
 * account still needs a real email under the hood. The username lives in a
 * separate `usernames/{normalized}` doc — `{ uid, email }` only — that a
 * signed-out client can look up by exact id to resolve email-for-sign-in, and
 * that the security rules let anyone GET but never LIST, so the namespace
 * can't be enumerated.
 *
 * The Auth account is created FIRST, then the username is reserved as that
 * now-signed-in user (a `create`-if-not-exists write the rules enforce
 * atomically). If the username turns out to be taken, the just-created Auth
 * account is rolled back — an auth user with no matching profile is dead
 * weight, not a recoverable state worth keeping around.
 */
export async function registerWithUsername({ username, email, password, rememberMe = true }) {
  if (!auth || !db) throw new Error('Firebase is not configured.')

  const trimmedUsername = username.trim()
  const normalized = normalizeUsername(trimmedUsername)
  assertUsableUsername(normalized)

  await setAuthPersistence(rememberMe)

  const credential = await createUserWithEmailAndPassword(auth, email, password)

  try {
    await updateProfile(credential.user, { displayName: trimmedUsername })

    await runTransaction(db, async (tx) => {
      const usernameRef = doc(db, 'usernames', normalized)
      const existing = await tx.get(usernameRef)
      if (existing.exists()) {
        throw appError('app/username-taken', 'That username is already taken.')
      }
      const stamp = Date.now()
      tx.set(usernameRef, { uid: credential.user.uid, email, createdAt: stamp })
      tx.set(doc(db, 'users', credential.user.uid), { username: trimmedUsername, email, createdAt: stamp })
    })
  } catch (caught) {
    await deleteUser(credential.user).catch(() => {})
    throw describeInfraFailure(caught, 'Creating an account')
  }

  return credential.user
}

/**
 * Accepts either a username or an email in the same field, matching the
 * ISUZU-CALAPAN convention: a value containing "@" is tried as an email
 * directly, otherwise it's resolved via the `usernames` lookup first.
 *
 * Every failure path — unknown username, unknown email, wrong password —
 * throws the identical message. A login form that distinguishes "no such
 * user" from "wrong password" hands an attacker a free username-enumeration
 * oracle for nothing in return.
 */
export async function signInWithUsernameOrEmail({ identifier, password, rememberMe = true }) {
  if (!auth || !db) throw new Error('Firebase is not configured.')

  await setAuthPersistence(rememberMe)

  const trimmed = identifier.trim()
  let email = trimmed

  if (!trimmed.includes('@')) {
    let snap
    try {
      snap = await getDoc(doc(db, 'usernames', normalizeUsername(trimmed)))
    } catch (caught) {
      // Signing in by email skips this lookup entirely, so it's worth saying
      // that out loud — it's a working way through while the rules are fixed.
      throw describeInfraFailure(caught, 'Signing in with a username, rather than an email address,')
    }
    if (!snap.exists()) {
      throw appError('app/invalid-credential', 'Incorrect username/email or password.')
    }
    email = snap.data().email
  }

  try {
    return await signInWithEmailAndPassword(auth, email, password)
  } catch (caught) {
    if (
      caught.code === 'auth/user-not-found' ||
      caught.code === 'auth/wrong-password' ||
      caught.code === 'auth/invalid-credential' ||
      caught.code === 'auth/invalid-email'
    ) {
      throw appError('app/invalid-credential', 'Incorrect username/email or password.')
    }
    throw caught
  }
}

/**
 * Same identifier resolution as signInWithUsernameOrEmail, and the same
 * non-enumeration stance carried one step further: where sign-in can't avoid
 * distinguishing "wrong password" from "no such account" forever (the user
 * eventually gets in or doesn't), a reset request never has to reveal that —
 * so an unknown username, an unknown email, and a Google-only account with no
 * password to reset all resolve as a quiet no-op instead of a thrown error.
 * The caller shows the identical "check your email" message either way; only
 * a genuine infrastructure failure (network, unpublished rules) still throws.
 */
export async function requestPasswordReset(identifier) {
  if (!auth || !db) throw new Error('Firebase is not configured.')

  const trimmed = identifier.trim()
  let email = trimmed

  if (!trimmed.includes('@')) {
    let snap
    try {
      snap = await getDoc(doc(db, 'usernames', normalizeUsername(trimmed)))
    } catch (caught) {
      throw describeInfraFailure(caught, 'Resetting a password by username, rather than an email address,')
    }
    if (!snap.exists()) return
    email = snap.data().email
  }

  try {
    await sendPasswordResetEmail(auth, email)
  } catch (caught) {
    if (caught.code === 'auth/user-not-found' || caught.code === 'auth/invalid-email') return
    throw describeInfraFailure(caught, 'Sending a password reset email')
  }
}

/* -------------------------------------------------------- push notifications -- */

/* `firebase/messaging` is imported dynamically, only when someone actually
   turns push on — it's dead weight for every visit that never touches
   Settings' toggle, and getMessaging() itself throws on a browser that doesn't
   support it (older Safari, non-HTTPS), which is one more reason not to run
   it at module load for every visitor. */

function hashToken(token) {
  // Short deterministic id from token; raw token is ~150+ chars and contains
  // characters awkward for doc ids. Not cryptographic strength needed.
  let h = 0
  for (let i = 0; i < token.length; i++) h = (Math.imul(31, h) + token.charCodeAt(i)) | 0
  return `${Math.abs(h).toString(36)}-${token.slice(-8)}`
}

const fcmTokenDoc = (uid, token) => doc(db, 'users', uid, 'fcmTokens', hashToken(token))

/* Diagnostic breadcrumbs for the tablet installed-PWA enable failure.
   Temporary: each step of enablePush logs one line so the exact failing
   operation can be read off the tablet console. Deliberately redacted —
   never the FCM token (only its length), never the VAPID key (only whether
   one is present), never the uid. Safe to delete once diagnosed. */
function pushDiag(step, details) {
  try {
    console.info('[push][enable]', step, details ?? '')
  } catch {
    /* logging must never break enablement */
  }
}

function describePushError(caught) {
  const code =
    caught && typeof caught === 'object' && 'code' in caught ? String(caught.code) : null
  const message = String(caught?.message ?? caught ?? 'unknown error').slice(0, 300)
  return { code, message }
}

/**
 * Asks for notification permission and — if granted — subscribes through
 * THIS app's own service worker (not a second firebase-messaging-sw.js).
 * Two workers can't both control "/" scope; a second would replace sw.js
 * and break offline caching. See public/sw.js.
 * Resolves to token string on success, null if permission denied.
 */
export async function enablePush(uid, { onStep } = {}) {
  // TEMP-DIAG: forwards redacted per-step results to the Settings UI panel.
  // Only statuses, error codes and truncated messages — never token/VAPID/uid.
  const report = (entry) => {
    try {
      onStep?.(entry)
    } catch {
      /* diagnostics must never break enablement */
    }
  }
  pushDiag('start', {
    hasNotification: typeof Notification !== 'undefined',
    hasServiceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    permissionBefore: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
    firebaseReady: Boolean(db && app),
  })
  if (!db || !app) {
    const err = new Error('Firebase is not configured.')
    pushDiag('configFailed', describePushError(err))
    report({ id: 'config', status: 'failed', code: null, message: 'Firebase is not configured.' })
    throw err
  }
  report({ id: 'config', status: 'ok', code: null, message: 'Firebase initialised.' })
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
    const err = new Error('This browser cannot receive push notifications.')
    pushDiag('capabilityFailed', describePushError(err))
    report({ id: 'permission', status: 'failed', code: null, message: err.message })
    throw err
  }

  let permission
  try {
    permission = await Notification.requestPermission()
  } catch (caught) {
    const { code, message } = describePushError(caught)
    pushDiag('requestPermissionFailed', { code, message })
    report({ id: 'permission', status: 'failed', code, message })
    throw caught
  }
  pushDiag('permissionResult', { permission })
  if (permission !== 'granted') {
    report({ id: 'permission', status: 'denied', code: null, message: `Permission: ${permission}.` })
    return null
  }
  report({ id: 'permission', status: 'ok', code: null, message: 'Permission granted.' })

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
  pushDiag('config', { vapidPresent: Boolean(vapidKey) })
  if (!vapidKey) {
    const err = new Error('Push notifications need VITE_FIREBASE_VAPID_KEY — see .env.example.')
    pushDiag('vapidMissing', describePushError(err))
    report({ id: 'vapid', status: 'failed', code: null, message: 'VAPID key missing from this build.' })
    throw err
  }
  report({ id: 'vapid', status: 'ok', code: null, message: 'VAPID key present.' })

  // getRegistration(), not serviceWorker.ready — .ready never resolves if no
  // worker was ever registered (dev build), causing an indefinite hang.
  let registration = null
  try {
    registration = await navigator.serviceWorker.getRegistration()
  } catch (caught) {
    const { code, message } = describePushError(caught)
    pushDiag('getRegistrationFailed', { code, message })
    report({ id: 'sw', status: 'failed', code, message })
    throw caught
  }
  pushDiag('swRegistration', {
    found: Boolean(registration),
    scope: registration?.scope ?? null,
    activeScriptURL: registration?.active?.scriptURL ?? null,
    controlled: typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker.controller),
    hasPushManager: Boolean(registration?.pushManager),
  })
  if (!registration) {
    const err = new Error(
      'No service worker is registered yet. Push notifications only work in a production build — run `npm run build && npm run preview`, not `npm run dev`.',
    )
    pushDiag('swMissing', describePushError(err))
    report({ id: 'sw', status: 'failed', code: null, message: 'No service worker registration found.' })
    throw err
  }
  // UI keeps scope/URL out — console already carries them; OK/FAILED is enough on screen.
  report({ id: 'sw', status: 'ok', code: null, message: 'Service worker registered.' })

  let messagingApi
  try {
    messagingApi = await import('firebase/messaging')
  } catch (caught) {
    const { code, message } = describePushError(caught)
    pushDiag('messagingImportFailed', { code, message })
    report({ id: 'support', status: 'failed', code, message })
    throw caught
  }
  let supported = null
  try {
    supported = await messagingApi.isSupported()
  } catch (caught) {
    const { code, message } = describePushError(caught)
    pushDiag('isSupportedFailed', { code, message })
    report({ id: 'support', status: 'failed', code, message })
    supported = false
  }
  pushDiag('messagingSupport', { supported })
  if (supported === false) {
    report({ id: 'support', status: 'failed', code: null, message: 'Firebase Messaging reports this browser unsupported.' })
  }
  // getMessaging() itself throws messaging/unsupported-browser when the
  // browser is unsupported — still call it so the canonical SDK error (not
  // a custom one) is what surfaces in the next breadcrumb.
  let messaging
  try {
    messaging = messagingApi.getMessaging(app)
  } catch (caught) {
    const { code, message } = describePushError(caught)
    pushDiag('getMessagingFailed', { code, message })
    report({ id: 'support', status: 'failed', code, message })
    throw caught
  }
  if (supported !== false) {
    report({ id: 'support', status: 'ok', code: null, message: 'Messaging supported.' })
  }

  let token = null
  try {
    // The SAME registration object logged above is passed here — if the
    // tablet log shows one scope/scriptURL, that is what getToken used.
    token = await messagingApi.getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    })
  } catch (caught) {
    const { code, message } = describePushError(caught)
    pushDiag('getTokenFailed', { code, message })
    report({ id: 'getToken', status: 'failed', code, message })
    throw caught
  }
  // Length only — the token itself is a credential and is never logged.
  pushDiag('getTokenResult', { gotToken: Boolean(token), tokenLength: token ? token.length : 0 })
  if (!token) {
    report({ id: 'getToken', status: 'failed', code: null, message: 'No token returned.' })
    return null
  }
  report({ id: 'getToken', status: 'ok', code: null, message: 'Token issued.' })

  try {
    await setDoc(fcmTokenDoc(uid, token), {
      token,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  } catch (caught) {
    const { code, message } = describePushError(caught)
    pushDiag('tokenWriteFailed', { code, message })
    report({ id: 'write', status: 'failed', code, message })
    throw caught
  }
  pushDiag('tokenWriteOk', {})
  report({ id: 'write', status: 'ok', code: null, message: 'Token stored.' })
  return token
}

/** Remove this device's token from Firestore and FCM. Best-effort. */
export async function disablePush(uid) {
  if (!db || !app) return
  if (!('serviceWorker' in navigator)) return

  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
  if (!vapidKey) return

  try {
    const { getMessaging, getToken, deleteToken } = await import('firebase/messaging')
    const messaging = getMessaging(app)
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration }).catch(() => null)
    if (!token) return
    await deleteToken(messaging).catch(() => {})
    await deleteDoc(fcmTokenDoc(uid, token)).catch(() => {})
  } catch {
    /* best-effort */
  }
}

/** Returns true iff this device's current FCM token is present in Firestore.
 *  Authoritative via Firestore, not localStorage — a granted Notification
 *  permission alone does not mean a token doc exists (e.g. prior Write
 *  blocked, or different device). Used to initialise `subscribed`. */
export async function isFcmSubscribed(uid) {
  if (!db || !app) return false
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false
  if (!('serviceWorker' in navigator)) return false
  const registration = await navigator.serviceWorker.getRegistration().catch(() => null)
  if (!registration) return false
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
  if (!vapidKey) return false
  try {
    const { getMessaging, getToken } = await import('firebase/messaging')
    const messaging = getMessaging(app)
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration }).catch(() => null)
    if (!token) return false
    const snap = await getDoc(fcmTokenDoc(uid, token)).catch(() => null)
    return snap?.exists() ?? false
  } catch {
    return false
  }
}

/** Called on sign-out to avoid leaving a stale token owned by a logged-out profile. */
export async function cleanupPushToken() {
  const uid = auth?.currentUser?.uid
  if (!uid) return
  await disablePush(uid)
}
