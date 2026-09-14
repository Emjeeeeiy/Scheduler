import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../state/AuthContext.jsx'
import { disablePush, enablePush, isFcmSubscribed } from '../firebase.js'

function hasBasicPushSupport() {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator
}

export function usePushNotifications() {
  const { user } = useAuth()
  const [supported, setSupported] = useState(() => (hasBasicPushSupport() ? null : false))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [permission, setPermission] = useState(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  )
  const [subscribed, setSubscribed] = useState(false)
  /* Generation guard for the check below: a slow isFcmSubscribed() started
     before an enable()/disable() must not overwrite that fresh intent when
     it lands late (seen as the button flipping back right after the toast
     on slow devices). Bumped by both mutations; the effect only applies a
     result from the current generation. */
  const seqRef = useRef(0)

  useEffect(() => {
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

  // Authoritative subscribed state via Firestore, not permission or localStorage.
  // Handles: permission granted but no token doc → subscribed stays false (shows Turn on).
  useEffect(() => {
    if (!user || supported !== true || permission !== 'granted') {
      setSubscribed(false)
      return undefined
    }
    let cancelled = false
    const mySeq = seqRef.current
    isFcmSubscribed(user.uid)
      .then((val) => {
        if (!cancelled && seqRef.current === mySeq) setSubscribed(val)
      })
      .catch(() => {
        if (!cancelled && seqRef.current === mySeq) setSubscribed(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, supported, permission])

  /* Resolves to a result object — never a bare boolean — so the caller toasts
     exactly what happened. Reading push.denied/push.error after the await
     would see the pre-click render's stale values, misattributing dismissals
     as failures and vice versa. Reasons: 'denied' (browser-blocked),
     'dismissed' (prompt left undecided), 'error' (anything thrown). */
  const enable = useCallback(async () => {
    if (!user) return { ok: false, reason: 'error' }
    setBusy(true)
    setError(null)
    seqRef.current += 1
    try {
      const token = await enablePush(user.uid)
      const permissionNow =
        typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
      setPermission(permissionNow)
      if (token !== null) {
        setSubscribed(true)
        return { ok: true }
      }
      // Null means "no token": a dismissal only while permission is still
      // undecided — denied, or granted-but-empty, are real failures.
      if (permissionNow === 'denied') return { ok: false, reason: 'denied' }
      if (permissionNow === 'granted') return { ok: false, reason: 'error' }
      return { ok: false, reason: 'dismissed' }
    } catch (caught) {
      console.error('Could not enable push notifications.', caught)
      setError(caught)
      return { ok: false, reason: 'error' }
    } finally {
      setBusy(false)
    }
  }, [user])

  const disable = useCallback(async () => {
    if (!user) return false
    setBusy(true)
    setError(null)
    seqRef.current += 1
    try {
      const deleted = await disablePush(user.uid)
      if (!deleted) {
        // disablePush swallows its own failures, so a false means "unknown" —
        // read back the ground truth rather than claiming the token is gone.
        // A failed read stays conservative (still subscribed).
        const still = await isFcmSubscribed(user.uid).catch(() => true)
        setSubscribed(still)
        if (still) return false
      } else {
        setSubscribed(false)
      }
      // permission stays granted at browser level; keep reading actual permission so "denied" note still works.
      setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
      return true
    } catch (caught) {
      console.error('Could not disable push notifications.', caught)
      setError(caught)
      return false
    } finally {
      setBusy(false)
    }
  }, [user])

  return {
    supported,
    subscribed,
    enabled: permission === 'granted',
    denied: permission === 'denied',
    busy,
    error,
    enable,
    disable,
  }
}
