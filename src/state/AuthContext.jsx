import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import {
  auth,
  firebaseReady,
  logout,
  registerWithUsername,
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

      async signIn() {
        setError(null)
        try {
          await signInWithGoogle()
        } catch (caught) {
          // Closing the popup is a normal thing to do, not an error worth
          // shouting about; anything else is worth surfacing.
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

      async signInWithPassword({ identifier, password }) {
        setError(null)
        try {
          await signInWithUsernameOrEmail({ identifier, password })
        } catch (caught) {
          console.error('Sign-in failed.', caught)
          setError(friendlyMessage(caught))
        }
      },

      async register({ username, email, password }) {
        setError(null)
        try {
          await registerWithUsername({ username, email, password })
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
