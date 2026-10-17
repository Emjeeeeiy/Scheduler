/* The signed_in hint: whether the previous visit ended with a live session.
   One reader (Gate), one writer. Gate reads hadSession() to decide whether
   the auth check deserves the skeleton or should go straight to sign-in.
   AuthContext is the only writer, from onAuthStateChanged — the one place
   every sign-in (all methods) and sign-out flows through. The boot splash
   used to read the raw key too, to skip itself for returning users; it plays
   unconditionally now, so this is purely about the auth gate. */

export const SIGNED_IN_KEY = 'cadence-app:signed_in'

export function hadSession() {
  try {
    return localStorage.getItem(SIGNED_IN_KEY) === 'true'
  } catch {
    return false
  }
}

export function noteSession(user) {
  try {
    if (user) localStorage.setItem(SIGNED_IN_KEY, 'true')
    else localStorage.removeItem(SIGNED_IN_KEY)
  } catch {
    /* storage blocked — the gate falls back to the sign-in form */
  }
}
