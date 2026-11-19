/* The app lives at one URL. There is no router: the page you are on is state
   (`usePersistentState`), and the only things that ride on the address are the
   launch parameters `?view=` and `?new=` (see `launch` in App.jsx). Every
   notification click, manifest shortcut and email link points at `/`, so any
   other path is a link that was mistyped or has gone stale.

   Vercel rewrites every unknown path without a dot to index.html (vercel.json),
   so without this check a bad address would quietly open the app at its root and
   the visitor would never learn the link was wrong. */

/** Whether `pathname` is an address the app actually serves. */
export function isAppPath(pathname) {
  return pathname === '' || pathname === '/' || pathname === '/index.html'
}
