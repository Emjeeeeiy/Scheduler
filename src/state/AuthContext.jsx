import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, firebaseReady, logout, signInWithGoogle } from '../firebase.js'

const AuthContext = createContext(null)

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
          setError(caught.message ?? 'Sign-in failed.')
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
