import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../state/AuthContext.jsx'
import { disablePush, enablePush } from '../firebase.js'

/**
 * Push notifications, offered to a Settings toggle the same way
 * useInstallPrompt offers the install button — a browser capability that
 * may not exist here at all, checked once, then acted on from a real click.
 *
 * `supported` starts `null` (not yet known) rather than `false`, so the
 * toggle can render nothing while the async firebase/messaging isSupported()
 * check is still in flight instead of flashing "unsupported" for a moment
 * on every browser. `enabled` reads straight off `Notification.permission`
 * — a real simplification: it means "this browser has said yes," not "a
 * token for this exact device is confirmed sitting in Firestore right now."
 * Good enough for a toggle; enablePush is what actually writes it.
 */
/** Whatever's knowable synchronously, at first render — no Notification API,
    or no service worker support at all, both mean "unsupported" regardless
    of what firebase/messaging's own async isSupported() would say. Pulled
    out of the hook so the initial useState can call it directly instead of
    starting at `null` and immediately setState-ing to the same answer from
    inside an effect. */
function hasBasicPushSupport() {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator
}

export function usePushNotifications() {
  const { user } = useAuth()
  // null = still checking firebase/messaging's own, async isSupported() —
  // never true, unlike `false`, which the synchronous check above can
  // already know for certain before that async check even starts.
  const [supported, setSupported] = useState(() => (hasBasicPushSupport() ? null : false))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // Re-read after every enable/disable rather than derived once, so the
  // toggle reflects a permission change made from the browser's own UI too.
  const [permission, setPermission] = useState(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )

  useEffect(() => {
    // The synchronous check above already settled this as unsupported —
    // nothing async left to confirm.
    if (!hasBasicPushSupport()) return undefined

    let cancelled = false
    import('firebase/messaging')
      .then(({ isSupported }) => isSupported())
      .then((ok) => {
        if (!cancelled) setSupported(ok)
      })
      .catch(() => {
        if (!cancelled) setSupported(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const enable = useCallback(async () => {
    if (!user) return false
    setBusy(true)
    setError(null)
    try {
      const token = await enablePush(user.uid)
      setPermission(Notification.permission)
      return token !== null
    } catch (caught) {
      console.error('Could not enable push notifications.', caught)
      setError(caught)
      return false
    } finally {
      setBusy(false)
    }
  }, [user])

  const disable = useCallback(async () => {
    if (!user) return
    setBusy(true)
    setError(null)
    try {
      await disablePush(user.uid)
    } catch (caught) {
      console.error('Could not disable push notifications.', caught)
      setError(caught)
    } finally {
      setBusy(false)
    }
  }, [user])

  return {
    supported,
    enabled: permission === 'granted',
    // Permission was asked before and refused — the browser will not ask
    // again on its own, so the toggle can say so instead of silently doing
    // nothing on the next click.
    denied: permission === 'denied',
    busy,
    error,
    enable,
    disable,
  }
}
