/* Stand-in for state/AuthContext.jsx during the smoke render. */

export function AuthProvider({ children }) {
  return children
}

export function useAuth() {
  return {
    user: { uid: 'smoke-uid', displayName: 'Smoke Tester', email: 'smoke@example.com', photoURL: null },
    loading: false,
    error: null,
    clearError: () => {},
    reportError: () => {},
    signIn: async () => {},
    signInWithPassword: async () => {},
    register: async () => {},
    signOut: async () => {},
  }
}
