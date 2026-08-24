import { initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import {
  doc,
  getDoc,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  runTransaction,
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

const provider = new GoogleAuthProvider()

export async function signInWithGoogle() {
  if (!auth) throw new Error('Firebase is not configured.')
  await signInWithPopup(auth, provider)
}

export async function logout() {
  if (!auth) return
  await signOut(auth)
}

function appError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
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
    throw caught
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
    const snap = await getDoc(doc(db, 'usernames', normalizeUsername(trimmed)))
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
