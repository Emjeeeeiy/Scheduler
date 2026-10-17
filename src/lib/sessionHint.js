/* The signed_in hint: whether the previous visit ended with a live session.
   One reader (Gate), one writer. Gate reads hadSession() to decide whether the
   auth check deserves the skeleton or should go straight to sign-in.
   AuthContext is the only writer, from onAuthStateChanged — the one place
   every sign-in (all methods) and sign-out flows through. The boot splash
   used to read the raw key too, to skip itself for returning users; it plays
   unconditionally now, so this is purely about the auth gate.

   This module also owns LAST_VIEW_KEY, the page you were last on. It lives
   here rather than next to the view code because its lifetime is the session's:
   *which page* is only meaningful *to a session*, and signing out is exactly
   the moment it stops being. noteSession(null) clears both keys together,
   which is what keeps the two rules apart —
     a refresh keeps your place, a fresh sign-in starts at the landing view.
   See App.jsx's view initialiser. */

export const SIGNED_IN_KEY = 'cadence-app:signed_in'
export const LAST_VIEW_KEY = 'cadence-app:view'

export function hadSession() {
  try {
    return localStorage.getItem(SIGNED_IN_KEY) === 'true'
  } catch {
    return false
  }
}

/** The page the last session ended on, or null if there wasn't one.
    Deliberately unvalidated as a *view* — whether the shell can still render it
    is the caller's business (see isViewId/rememberedView in App.jsx) — but it
    does have to be parsed: this key is written by usePersistentState, so the
    stored form is JSON and the raw string is `"week"`, not `week`. Unparseable
    counts as absent rather than throwing, because a corrupt key should cost
    you your place, not the whole app. */
export function lastView() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_VIEW_KEY))
    return typeof parsed === 'string' ? parsed : null
  } catch {
    return null
  }
}

export function noteSession(user) {
  try {
    if (user) {
      localStorage.setItem(SIGNED_IN_KEY, 'true')
    } else {
      localStorage.removeItem(SIGNED_IN_KEY)
      /* Sign-out ends the session, and with it the place that session was in.
         Left behind, the next sign-in would drop the user straight onto a page
         from a session they explicitly ended — which is the one case where
         honouring it would be wrong. */
      localStorage.removeItem(LAST_VIEW_KEY)
    }
  } catch {
    /* storage blocked — the gate falls back to the sign-in form, and the view
       falls back to memory for this visit */
  }
}
