import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import {
  auth,
  deleteAccount,
  firebaseReady,
  logout,
  reauthenticate,
  registerWithUsername,
  requestPasswordReset,
  signInWithGoogle,
  signInWithUsernameOrEmail,
} from '../firebase.js'

const AuthContext = createContext(null)

const FRIENDLY_MESSAGES = {
  'auth/email-already-in-use': 'An account with that email already exists.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/weak-password': 'Password must be at least 6 characters.',
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

  useEffect(() => {
    if (!firebaseReady) return undefined
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
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

      async signInWithPassword({ identifier, password, rememberMe = true }) {
        setError(null)
        try {
          await signInWithUsernameOrEmail({ identifier, password, rememberMe })
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
      async resetPassword(identifier) {
        setError(null)
        try {
          await requestPasswordReset(identifier)
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
          await registerWithUsername({ username, email, password, rememberMe })
        } catch (caught) {
          console.error('Registration failed.', caught)
          setError(friendlyMessage(caught))
        }
      },

      async signOut() {
        try {
          await logout()
        } catch (caught) {
          console.error('Sign-out failed.', caught)
        }
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
    [user, loading, error],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
