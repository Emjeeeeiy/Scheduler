import { useCallback, useEffect, useRef, useState } from 'react'
import {
  PUSH_CHANGED_EVENT,
  getLocalSubscription,
  isPushSupported,
  pushPermission,
  subscribePush,
  unsubscribePush,
} from './pushSubscription.js'

/**
 * The state behind Settings' "Push notifications" toggle, and the sign-in
 * screen's "reminders are still on" notice.
 *
 * `subscribed` is read from the browser itself (does this device hold a push
 * subscription, and is permission still granted), never from a stored flag —
 * permission can be revoked from the address bar and a subscription can be
 * dropped by the browser, neither of which a flag would notice. It is
 * re-checked when the tab regains focus for exactly that reason.
 *
 * Needs no signed-in user to read or to turn OFF; turning ON registers the
 * device against an account, so that part fails cleanly when signed out.
 */
export function usePushNotifications() {
  const supported = isPushSupported()
  const [permission, setPermission] = useState(pushPermission)
  const [subscribed, setSubscribed] = useState(false)
  const [checking, setChecking] = useState(supported)
  const [busy, setBusy] = useState(false)

  /* A check that started before an enable()/disable() must not overwrite what
     that call just established when it lands late — seen before as the button
     flipping back right after its toast. Every mutation bumps this and a
     check only applies its result if no one has bumped it since. */
  const generation = useRef(0)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    const mine = ++generation.current
    const nextPermission = pushPermission()
    const on = nextPermission === 'granted' && Boolean(await getLocalSubscription())
    if (!alive.current || mine !== generation.current) return
    setPermission(nextPermission)
    setSubscribed(on)
  }, [])

  useEffect(() => {
    if (!supported) return undefined
    refresh().finally(() => {
      if (alive.current) setChecking(false)
    })
    const recheck = () => {
      if (document.visibilityState !== 'hidden') void refresh()
    }
    document.addEventListener('visibilitychange', recheck)
    window.addEventListener('focus', recheck)
    window.addEventListener(PUSH_CHANGED_EVENT, recheck)
    return () => {
      document.removeEventListener('visibilitychange', recheck)
      window.removeEventListener('focus', recheck)
      window.removeEventListener(PUSH_CHANGED_EVENT, recheck)
    }
  }, [supported, refresh])

  /* Resolves to `{ ok }` or `{ ok: false, reason }` — never a bare boolean —
     so the caller toasts exactly what happened. Reading `denied` off this hook
     after the await would see the pre-click render's stale value. */
  const enable = useCallback(async () => {
    setBusy(true)
    generation.current += 1
    try {
      const result = await subscribePush()
      if (alive.current) {
        setPermission(pushPermission())
        if (result.ok) setSubscribed(true)
      }
      return result
    } catch (caught) {
      console.error('Could not turn on push notifications.', caught)
      return { ok: false, reason: 'error' }
    } finally {
      if (alive.current) setBusy(false)
    }
  }, [])

  const disable = useCallback(async () => {
    setBusy(true)
    generation.current += 1
    try {
      const off = await unsubscribePush()
      if (alive.current) {
        setPermission(pushPermission())
        if (off) setSubscribed(false)
      }
      return off
    } catch (caught) {
      console.error('Could not turn off push notifications.', caught)
      return false
    } finally {
      if (alive.current) setBusy(false)
    }
  }, [])

  return {
    supported,
    permission,
    denied: permission === 'denied',
    subscribed,
    checking,
    busy,
    enable,
    disable,
  }
}
