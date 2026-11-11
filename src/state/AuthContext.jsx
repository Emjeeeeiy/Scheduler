import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { noteSession, rememberMeChoice } from '../lib/sessionHint.js'
import { unsubscribePush } from '../lib/pushSubscription.js'
import {
  auth,
  clearLocalData,
  deleteAccount,
  firebaseReady,
  logout,
  reauthenticate,
  refreshVerification,
  registerAccount,
  requestPasswordReset,
  resendVerification,
  signInWithEmail,
  signInWithGoogle,
} from '../firebase.js'

const AuthContext = createContext(null)

const FRIENDLY_MESSAGES = {
  // Deliberately not "that email is taken": the sign-up form shouldn't be a
  // way to test which addresses have an account.
  'auth/email-already-in-use':
    'Couldn’t create an account with that email. If it’s yours, log in or reset your password.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/weak-password': 'Choose a longer, harder-to-guess password.',
  'auth/password-does-not-meet-requirements': 'Choose a longer, harder-to-guess password.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
  'auth/network-request-failed': 'Network error — check your connection and try again.',
  // Backstop for any Firestore call that reaches this banner without going
  // through firebase.js's own describeInfraFailure — "Missing or insufficient
  // permissions" always means firestore.rules was never published.
  'permission-denied':
    'This project’s Firestore rules haven’t been published — publish firestore.rules in the Firebase console, then try again.',
}

function friendlyMessage(error) {
  return FRIENDLY_MESSAGES[error.code] ?? error.message ?? 'Something went wrong.'
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  /* Starts true so the app renders a spinner, not the sign-in screen, while
     Firebase restores the session from IndexedDB. Without it every reload
     flashes "Sign in" at an already-signed-in user. */
  const [loading, setLoading] = useState(firebaseReady)
  const [error, setError] = useState(null)
  /* Mirrors user.emailVerified, which Firebase only updates on reload() — and
     reloading doesn't re-render anything, so the flag is held here. Google
     accounts arrive verified. */
  const [emailVerified, setEmailVerified] = useState(false)
  const checking = useRef(false)

  useEffect(() => {
    if (!firebaseReady) return undefined
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setEmailVerified(Boolean(nextUser?.emailVerified))
      setLoading(false)
      // The signed_in hint for Gate (see sessionHint.js).
      noteSession(nextUser)
    })
  }, [])

  async function checkVerification() {
    if (checking.current) return false
    checking.current = true
    try {
      const verified = await refreshVerification()
      setEmailVerified(verified)
      return verified
    } catch (caught) {
      console.warn('Could not refresh the verification state.', caught)
      return false
    } finally {
      checking.current = false
    }
  }

  /* Verifying happens in another tab (the emailed link), so coming back to
     this one is the natural moment to look again. */
  useEffect(() => {
    if (!user || emailVerified) return undefined
    const onFocus = () => {
      checkVerification()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [user, emailVerified])

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      emailVerified,
      checkVerification,

      /** Resolves to whether the email went out; failures (most often
          Firebase's own resend throttle) surface on the shared banner. */
      async resendVerification() {
        setError(null)
        try {
          await resendVerification()
          return true
        } catch (caught) {
          console.error('Could not resend the verification email.', caught)
          setError(friendlyMessage(caught))
          return false
        }
      },
      clearError: () => setError(null),
      // Exposed for a form's own pre-submit checks (password mismatch, too
      // short) so every error — client-side or server round-trip — surfaces
      // through the same single banner instead of two competing ones.
      reportError: (message) => setError(message),

      async signIn({ rememberMe = true } = {}) {
        setError(null)
        try {
          await signInWithGoogle({ rememberMe })
        } catch (caught) {
          /* Closing the popup is a normal thing to do, not an error worth
             shouting about; anything else is worth surfacing.

             Unrelated to this catch, but the question keeps coming back: the
             "Cross-Origin-Opener-Policy policy would block the window.closed
             call" line Chrome logs from inside firebase_auth during Google
             sign-in is noise, not a fault here. Google's OAuth page sends
             `Cross-Origin-Opener-Policy: same-origin`, and the SDK's
             pollUserCancellation() reads `popup.closed` to notice a dismissed
             window; Chrome warns that the read *would* be blocked under
             enforcement while still returning the real value, so the poll goes
             on working — which is why the line repeats rather than appearing
             once. Nothing is degraded.

             It cannot be fixed from this app: the header is Google's, and
             setting COOP on our own document does not undo it —
             same-origin-allow-popups governs what a popup may see of its
             opener, not what an opener may see of a COOP-isolated popup
             (measured, not assumed). Only signInWithRedirect removes it, at
             the cost of third-party-storage problems that need authDomain to
             share an origin with the app. */
          if (
            caught.code === 'auth/popup-closed-by-user' ||
            caught.code === 'auth/cancelled-popup-request'
          ) {
            return
          }
          console.error('Google sign-in failed.', caught)
          setError(friendlyMessage(caught))
        }
      },

      async signInWithPassword({ email, password, rememberMe = true }) {
        setError(null)
        try {
          await signInWithEmail({ email, password, rememberMe })
        } catch (caught) {
          console.error('Sign-in failed.', caught)
          setError(friendlyMessage(caught))
        }
      },

      /* Unlike its siblings, this reports success back to the caller instead
         of leaving it to infer from navigation or the shared banner — there
         is no "signed in now" transition to fall back on, and the same
         "check your email" message has to show whether the account was real
         or not (see requestPasswordReset), so the form needs an explicit
         yes/no to know when that's safe to say. */
      async resetPassword(email) {
        setError(null)
        try {
          await requestPasswordReset(email)
          return true
        } catch (caught) {
          console.error('Password reset failed.', caught)
          setError(friendlyMessage(caught))
          return false
        }
      },

      async register({ username, email, password, rememberMe = true }) {
        setError(null)
        try {
          await registerAccount({ username, email, password, rememberMe })
        } catch (caught) {
          console.error('Registration failed.', caught)
          setError(friendlyMessage(caught))
        }
      },

      /* An unticked "Remember me" means "not my device": reminders for this
         account stop arriving here too. Either way the offline copy of the
         account is wiped from this browser (clearLocalData reloads the page
         into the signed-out state). */
      async signOut() {
        if (!rememberMeChoice()) {
          await unsubscribePush().catch((caught) => console.warn('Could not turn off push here.', caught))
        }
        try {
          await logout()
        } catch (caught) {
          console.error('Sign-out failed.', caught)
          return
        }
        await clearLocalData()
      },

      /* Deliberately left to throw, unlike the methods above: the profile
         modal's delete flow is a multi-step confirmation (reauthenticate,
         then wipe Firestore, then delete the account) that needs to branch
         on exactly what failed and where — a wrong password is not the same
         situation as a closed Google popup — so it keeps its own local error
         state rather than sharing this banner's single message. */
      reauthenticate,
      deleteAccount,
    }),
    [user, loading, error, emailVerified],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
