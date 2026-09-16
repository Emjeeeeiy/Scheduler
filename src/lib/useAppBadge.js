import { useEffect } from 'react'

/* Mirrors a count onto the installed app's launcher icon via the Badging
   API — the one "live icon" channel phone/tablet OSes grant a web app. An
   installed PWA's launcher artwork is a static PNG snapshot the OS draws
   itself, so the clock mark there can never tick the way ClockIcon does
   in-app; a badge over it is as live as that icon gets. Needs no permission
   and no-ops wherever the API is missing (desktop browser tab, unsupported
   OS) — the in-app bell dot always shows the same number regardless.

   Never throws, same contract as showLocalNotification: where the API exists
   but the app isn't installed the returned promise rejects, which is caught
   and ignored rather than reaching the ErrorBoundary. */

function badgeApi() {
  if (typeof navigator === 'undefined') return null
  if (typeof navigator.setAppBadge !== 'function') return null
  return navigator
}

function settle(promise) {
  if (promise && typeof promise.catch === 'function') promise.catch(() => {})
}

export function useAppBadge(count) {
  useEffect(() => {
    const api = badgeApi()
    if (!api) return
    try {
      if (count > 0) settle(api.setAppBadge(count))
      else if (typeof api.clearAppBadge === 'function') settle(api.clearAppBadge())
    } catch {
      // Synchronous throw (unsupported context) — ignore, see above.
    }
    /* The bell unmounts only with the signed-in shell, at which point its
       tasks are gone too — so clear rather than leave a stale number behind.
       (In dev StrictMode this cleanup also runs between the double-invoked
       effects; the re-mount re-applies the count immediately after.) */
    return () => {
      try {
        if (typeof api.clearAppBadge === 'function') settle(api.clearAppBadge())
      } catch {
        // ignore, see above.
      }
    }
  }, [count])
}
