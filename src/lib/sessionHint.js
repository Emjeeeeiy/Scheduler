/* The signed_in hint: whether the previous visit ended with a live session.
   Two readers, one writer. index.html's head script reads the raw key before
   first paint (a module can't load that early) to decide whether the boot
   splash may show at all; Gate reads hadSession() to decide whether the auth
   check deserves the skeleton or should go straight to sign-in. AuthContext
   is the only writer, from onAuthStateChanged — the one place every sign-in
   (all methods) and sign-out flows through. */

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
    /* storage blocked — splash and skeleton fall back to always showing */
  }
}
