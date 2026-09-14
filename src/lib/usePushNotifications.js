import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../state/AuthContext.jsx'
import { disablePush, enablePush, isFcmSubscribed } from '../firebase.js'

function hasBasicPushSupport() {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator
}

// TEMP-DIAG: tablet PWA diagnosis — ordered rows for the Settings UI panel.
// Statuses only, plus sanitized Firebase error codes; never token/VAPID/uid.
const DIAG_ORDER = [
  { id: 'config', label: 'App initialisation' },
  { id: 'permission', label: 'Permission' },
  { id: 'vapid', label: 'VAPID key' },
  { id: 'sw', label: 'Service worker' },
  { id: 'support', label: 'Firebase Messaging support' },
  { id: 'getToken', label: 'FCM getToken' },
  { id: 'write', label: 'Firestore token write' },
]

function sanitizePushError(caught) {
  const code = caught && typeof caught === 'object' && 'code' in caught ? String(caught.code) : null
  const message = String(caught?.message ?? caught ?? 'unknown error').slice(0, 200)
  return { code, message }
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
  // TEMP-DIAG: last Turn on attempt, for the Settings panel. Remove with it.
  const [diag, setDiag] = useState(null)

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
    const collected = []
    const onStep = (entry) => {
      const at = collected.findIndex((s) => s.id === entry.id)
      if (at >= 0) collected[at] = { ...collected[at], ...entry }
      else collected.push({ ...entry })
    }
    const finishDiag = (ok, errorCode, errorMessage) => {
      setDiag({
        ok,
        errorCode,
        errorMessage,
        steps: DIAG_ORDER.map((def) => ({
          ...def,
          ...(collected.find((s) => s.id === def.id) ?? {
            status: 'skipped',
            code: null,
            message: null,
          }),
        })),
      })
    }
    try {
      const token = await enablePush(user.uid, { onStep })
      setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
      if (token !== null) {
        setSubscribed(true)
        finishDiag(true, null, null)
        return true
      }
      finishDiag(false, null, 'Permission not granted.')
      return false
    } catch (caught) {
      console.error('Could not enable push notifications.', caught)
      setError(caught)
      const { code, message } = sanitizePushError(caught)
      finishDiag(false, code, message)
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
    diag,
    enable,
    disable,
  }
}
