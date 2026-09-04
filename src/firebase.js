import { initializeApp } from 'firebase/app'
import {
  EmailAuthProvider,
  GoogleAuthProvider,
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

  /* Session-only: the sign-in lives in sessionStorage, not localStorage, so
     closing the tab ends it — the next visit lands back on the sign-in
     screen. An ordinary reload in the same tab is unaffected, since
     sessionStorage survives that. */
  setPersistence(auth, browserSessionPersistence).catch(() => {})

  /* persistentLocalCache keeps the whole working set in IndexedDB: the app
     opens instantly on reload, keeps working offline, and queues writes until
     the connection returns. multipleTabManager stops two open tabs from
     fighting over that single IndexedDB lease. */
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  })
}

export { auth, db }

const provider = new GoogleAuthProvider()

/* The `users/{uid}` doc otherwise stays empty for a Google account until its
   first photo upload, which makes one impossible to pick out of the
   Firestore console — every row is just a bare uid. Writing the Google
   email (and name, for the same reason) here means every sign-in keeps it
   current, and merge:true means it never clobbers photoBase64 or anything
   else already on the doc. */
export async function signInWithGoogle() {
  if (!auth || !db) throw new Error('Firebase is not configured.')
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
export async function registerWithUsername({ username, email, password }) {
  if (!auth || !db) throw new Error('Firebase is not configured.')

  const trimmedUsername = username.trim()
  const normalized = normalizeUsername(trimmedUsername)
  assertUsableUsername(normalized)

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
export async function signInWithUsernameOrEmail({ identifier, password }) {
  if (!auth || !db) throw new Error('Firebase is not configured.')

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
   Settings' notification toggle, and getMessaging() itself throws on a
   browser that doesn't support it (older Safari, a non-HTTPS origin), which
   is one more reason not to run it at module load for every visitor. */

/** One doc per device that has ever registered for push, under the owner's
    own uid — covered by the same `users/{uid}/{document=**}` rule as every
    other subcollection. The FCM token itself is the doc id: it's already
    unique per device/browser, so there's nothing to gain from a second,
    generated id standing in for it. */
const pushTokenDoc = (uid, token) => doc(db, 'users', uid, 'pushTokens', token)

/**
 * Asks for notification permission, and — if granted — subscribes for push
 * THROUGH THIS APP'S OWN service worker (see the `serviceWorkerRegistration`
 * option below) rather than letting the SDK register a separate one. Two
 * service workers can't both control the "/" scope; registering a second
 * one would silently replace sw.js and take Phase 5's offline shell out
 * with it. sw.js's own `push` listener is what actually shows the
 * notification once one arrives — nothing here does that part.
 *
 * Resolves to the token on success, or `null` if permission was denied —
 * the caller decides what that means for its own UI rather than this
 * throwing over a perfectly ordinary "no thanks."
 */
export async function enablePush(uid) {
  if (!db || !app) throw new Error('Firebase is not configured.')
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
    throw new Error('This browser cannot receive push notifications.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
  if (!vapidKey) {
    throw new Error('Push notifications need VITE_FIREBASE_VAPID_KEY — see README-functions.md.')
  }

  /* getRegistration(), not `serviceWorker.ready` — `.ready` resolves once a
     worker becomes active for this scope, and simply never resolves at all
     if one was never registered in the first place (main.jsx only
     registers sw.js in a production build — never under `npm run dev`).
     That silent hang is indistinguishable from "the button did nothing,"
     which is exactly the failure this app's own owner hit and reported as
     push "randomly turning off": requestPermission() above had already
     succeeded, so the browser's own permission stayed granted, but this
     line never returned, busy stayed true, and reloading the page looked
     like the whole thing had reset. getRegistration() resolves immediately
     either way, so a missing worker becomes a clear, thrown error instead
     of an indefinite hang. */
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) {
    throw new Error(
      'No service worker is registered yet. Push notifications only work in a production build — run `npm run build && npm run preview`, not `npm run dev`.',
    )
  }

  const { getMessaging, getToken } = await import('firebase/messaging')
  const messaging = getMessaging(app)
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration })
  if (!token) return null

  await setDoc(pushTokenDoc(uid, token), {
    token,
    userAgent: navigator.userAgent,
    createdAt: Date.now(),
  })
  return token
}

/** The twin of enablePush: finds this device's current token (if any),
    deletes it from FCM, and removes its doc — so a device that opts out
    stops costing the push schedule anything to consider, rather than
    sitting there until Cloud Messaging eventually reports it dead on its
    own. A browser that never granted permission, or has no worker
    registered yet, has nothing to undo. */
export async function disablePush(uid) {
  if (!db || !app) return
  if (!('serviceWorker' in navigator)) return

  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) return

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY
  if (!vapidKey) return

  const { getMessaging, getToken, deleteToken } = await import('firebase/messaging')
  const messaging = getMessaging(app)
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration }).catch(() => null)
  if (!token) return

  await deleteToken(messaging).catch(() => {})
  await deleteDoc(pushTokenDoc(uid, token)).catch(() => {})
}
