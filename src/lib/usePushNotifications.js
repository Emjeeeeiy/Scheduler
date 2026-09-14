import { useCallback, useEffect, useState } from 'react'
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
    isFcmSubscribed(user.uid)
      .then((val) => {
        if (!cancelled) setSubscribed(val)
      })
      .catch(() => {
        if (!cancelled) setSubscribed(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, supported, permission])

  const enable = useCallback(async () => {
    if (!user) return false
    setBusy(true)
    setError(null)
    try {
      const token = await enablePush(user.uid)
      setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
      if (token !== null) setSubscribed(true)
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
      setSubscribed(false)
      // permission stays granted at browser level; keep reading actual permission so "denied" note still works.
      setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
    } catch (caught) {
      console.error('Could not disable push notifications.', caught)
      setError(caught)
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
