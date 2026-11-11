import { initializeApp } from 'firebase/app'
import { ReCaptchaEnterpriseProvider, getToken, initializeAppCheck } from 'firebase/app-check'
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
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { setAppCheckTokenProvider } from './lib/appCheck.js'
import {
  clearIndexedDbPersistence,
  doc,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  setDoc,
  terminate,
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

let auth = null
let db = null

if (firebaseReady) {
  const app = initializeApp(firebaseConfig)

  /* App Check, when a reCAPTCHA Enterprise site key is configured: it makes
     Firestore, Auth and our own /api calls carry proof that they come from this
     app on our domain. Must run before any other Firebase service is used, so
     their requests pick the token up. Off (and costs nothing) without the key.
     In development a debug token is used instead of reCAPTCHA; the SDK prints
     it to the console once, to be registered in the Firebase console. */
  const appCheckSiteKey = import.meta.env.VITE_APPCHECK_SITE_KEY
  if (appCheckSiteKey) {
    if (import.meta.env.DEV) globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true
    const appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
    setAppCheckTokenProvider(async () => (await getToken(appCheck, false)).token)
  }

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


/* Registration touches Firestore before there is anything useful to show the
   person typing, so it can fail for a reason that has nothing to do with their
   credentials. `permission-denied` here means one thing in practice: the rules
   in firestore.rules were never published, so a production-mode database is
   still denying everything (README step 6). The SDK's own wording — "Missing or
   insufficient permissions" — surfaces on the form as an accusation the visitor
   can do nothing about, so name the real cause instead. */
function describeInfraFailure(caught, action) {
  if (caught.code === 'permission-denied') {
    return appError(
      'app/rules-not-published',
      `${action} needs this project’s Firestore rules — publish firestore.rules in the Firebase console, then try again.`,
    )
  }
  if (caught.code === 'unavailable') {
    return appError('auth/network-request-failed', 'Network error — check your connection and try again.')
  }
  return caught
}

/** The display name is shown only to its owner, so it needs no uniqueness and
    no public lookup — just a sane length. */
export const DISPLAY_NAME_MAX = 60

/** Where the verification and reset links land: back on this app. */
function actionCodeSettings() {
  return typeof window === 'undefined' ? undefined : { url: window.location.origin }
}

/**
 * Creates an email/password account. Sign-in is by email only: there is no
 * public username → email lookup any more (it let anyone who guessed a
 * username read that account's email address). The name typed here is just the
 * display name.
 *
 * A verification email goes out straight away. The app works unverified, but
 * the server-side features — AI, push reminders, the daily digest — wait for
 * it (api/_lib/auth.js, functions/index.js), so an address nobody controls can
 * never be signed up for them.
 */
export async function registerAccount({ username, email, password, rememberMe = true }) {
  if (!auth || !db) throw new Error('Firebase is not configured.')

  const displayName = username.trim().slice(0, DISPLAY_NAME_MAX)
  if (!displayName) throw appError('app/invalid-username', 'Enter a display name.')

  await setAuthPersistence(rememberMe)
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)

  try {
    await updateProfile(credential.user, { displayName })
    await setDoc(doc(db, 'users', credential.user.uid), {
      username: displayName,
      email: credential.user.email,
      createdAt: Date.now(),
    })
  } catch (caught) {
    // An Auth user with no profile is dead weight, not a recoverable state.
    await deleteUser(credential.user).catch(() => {})
    throw describeInfraFailure(caught, 'Creating an account')
  }

  // Best effort: a failed send is retried from the banner, never a reason to
  // undo an account that otherwise exists.
  await sendEmailVerification(credential.user, actionCodeSettings()).catch((caught) => {
    console.warn('Could not send the verification email.', caught)
  })
  return credential.user
}

/** Every failure that is about the credentials throws the identical message —
    "no such account" and "wrong password" must look the same. */
export async function signInWithEmail({ email, password, rememberMe = true }) {
  if (!auth) throw new Error('Firebase is not configured.')
  await setAuthPersistence(rememberMe)
  try {
    return await signInWithEmailAndPassword(auth, email.trim(), password)
  } catch (caught) {
    if (
      caught.code === 'auth/user-not-found' ||
      caught.code === 'auth/wrong-password' ||
      caught.code === 'auth/invalid-credential' ||
      caught.code === 'auth/invalid-email'
    ) {
      throw appError('app/invalid-credential', 'Incorrect email or password.')
    }
    throw caught
  }
}

/** An unknown email, or a Google-only account with no password, is a quiet
    no-op: the caller shows the same "check your email" either way. */
export async function requestPasswordReset(email) {
  if (!auth) throw new Error('Firebase is not configured.')
  try {
    await sendPasswordResetEmail(auth, email.trim(), actionCodeSettings())
  } catch (caught) {
    if (caught.code === 'auth/user-not-found' || caught.code === 'auth/invalid-email') return
    throw describeInfraFailure(caught, 'Sending a password reset email')
  }
}

export async function resendVerification() {
  if (!auth?.currentUser) throw new Error('Not signed in.')
  await sendEmailVerification(auth.currentUser, actionCodeSettings())
}

/** Picks up a verification done in another tab or on another device. The
    reload refreshes `emailVerified` on the user; the forced token refresh is
    what the server sees, since it reads the claim from the ID token. */
export async function refreshVerification() {
  const user = auth?.currentUser
  if (!user) return false
  await user.reload()
  if (user.emailVerified) await user.getIdToken(true)
  return user.emailVerified
}

/**
 * Drops this browser's offline copy of the account. Firestore's persistent
 * cache lives in IndexedDB and survives sign-out, so on a shared computer the
 * next person could read the previous account's schedule from DevTools.
 *
 * Terminating is required before the cache can be cleared, and a terminated
 * instance can't be used again — so the page reloads into a fresh one. Another
 * open tab still holding the cache makes clearing fail (`failed-precondition`);
 * that is tolerated, since there is nothing more this tab can do about it.
 */
export async function clearLocalData() {
  if (db) {
    try {
      await terminate(db)
      await clearIndexedDbPersistence(db)
    } catch (caught) {
      console.warn('Could not clear the offline cache.', caught)
    }
  }
  if (typeof window !== 'undefined') window.location.reload()
}
