import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../state/AuthContext.jsx'
import { disablePush, enablePush, isFcmSubscribed } from '../firebase.js'

function hasBasicPushSupport() {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator
}

/* TEMP PUSH-DEBUG — diagnosis only, remove entirely once the toggle mismatch
   is identified (this block plus every pushLog/applySubscribed/notePushDebug
   call site and the modal panel). Values only on every line: never FCM token,
   VAPID key, uid, or credentials. Deliberately NOT dev-gated: the tablet PWA
   runs a production build, which is exactly where we must capture. */
let pushDebugInstanceCount = 0

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

  // TEMP PUSH-DEBUG — per-instance diagnostics. The instance id answers
  // whether more than one hook lives at once; renderCount counts commits.
  const instanceRef = useRef(0)
  if (instanceRef.current === 0) instanceRef.current = ++pushDebugInstanceCount
  const renderRef = useRef(0)
  renderRef.current += 1
  const [pushDebug, setPushDebug] = useState(() => ({
    lastClick: null,
    lastOperation: null,
    lastCheck: null,
    lastSetSubscribed: null,
    lastToast: null,
    lastEvent: null,
    timestamp: null,
    renderCount: 0,
  }))
  const pushLog = useCallback((event, consoleFields = {}, panelPatch = {}) => {
    console.info('[PUSH-DEBUG]', event, { instance: instanceRef.current, ...consoleFields })
    setPushDebug((prev) => ({
      ...prev,
      ...panelPatch,
      renderCount: renderRef.current,
      lastEvent: event,
      timestamp: new Date().toISOString(),
    }))
  }, [])
  const applySubscribed = useCallback(
    (value, origin) => {
      pushLog('SET_SUBSCRIBED', { value, origin }, { lastSetSubscribed: `${value} (${origin})` })
      setSubscribed(value)
    },
    [pushLog],
  )
  // TEMP PUSH-DEBUG — lets the modal record CLICK/TOAST into the same panel.
  const notePushDebug = useCallback(
    (event, consoleFields = {}, panelPatch = {}) => {
      pushLog(event, consoleFields, panelPatch)
    },
    [pushLog],
  )

  console.info('[PUSH-DEBUG] RENDER', {
    instance: instanceRef.current,
    subscribed,
    button: busy ? 'Working…' : subscribed ? 'Turn off' : 'Turn on',
    supported,
    permission,
  })

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
      applySubscribed(false, 'effect:early-reset')
      return undefined
    }
    let cancelled = false
    const mySeq = seqRef.current
    pushLog('SUBSCRIPTION_CHECK_START', { seq: mySeq }, { lastCheck: `start seq=${mySeq}` })
    isFcmSubscribed(user.uid)
      .then((val) => {
        const applied = !cancelled && seqRef.current === mySeq
        pushLog(
          'SUBSCRIPTION_CHECK_RESULT',
          { seq: mySeq, currentSeq: seqRef.current, applied, value: val },
          { lastCheck: `result seq=${mySeq} applied=${applied} value=${val}` },
        )
        if (applied) applySubscribed(val, 'effect:check')
      })
      .catch(() => {
        const applied = !cancelled && seqRef.current === mySeq
        pushLog(
          'SUBSCRIPTION_CHECK_RESULT',
          { seq: mySeq, currentSeq: seqRef.current, applied, value: false, errored: true },
          { lastCheck: `result seq=${mySeq} applied=${applied} value=false (check threw)` },
        )
        if (applied) applySubscribed(false, 'effect:check-error')
      })
    return () => {
      cancelled = true
    }
  }, [user, supported, permission, applySubscribed, pushLog])

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
    pushLog('ENABLE_START', { seq: seqRef.current }, { lastOperation: 'enable started' })
    try {
      const token = await enablePush(user.uid)
      const permissionNow =
        typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
      setPermission(permissionNow)
      if (token !== null) {
        applySubscribed(true, 'enable:success')
        const result = { ok: true }
        pushLog('ENABLE_RESULT', { result }, { lastOperation: `enable → ${JSON.stringify(result)}` })
        return result
      }
      // Null means "no token": a dismissal only while permission is still
      // undecided — denied, or granted-but-empty, are real failures.
      const reason = permissionNow === 'denied' ? 'denied' : permissionNow === 'granted' ? 'error' : 'dismissed'
      const result = { ok: false, reason }
      pushLog('ENABLE_RESULT', { result }, { lastOperation: `enable → ${JSON.stringify(result)}` })
      return result
    } catch (caught) {
      console.error('Could not enable push notifications.', caught)
      setError(caught)
      const result = { ok: false, reason: 'error' }
      pushLog('ENABLE_RESULT', { result }, { lastOperation: `enable → ${JSON.stringify(result)}` })
      return result
    } finally {
      setBusy(false)
    }
  }, [user, applySubscribed, pushLog])

  const disable = useCallback(async () => {
    if (!user) return false
    setBusy(true)
    setError(null)
    seqRef.current += 1
    pushLog('DISABLE_START', { seq: seqRef.current }, { lastOperation: 'disable started' })
    try {
      const deleted = await disablePush(user.uid)
      if (!deleted) {
        // disablePush swallows its own failures, so a false means "unknown" —
        // read back the ground truth rather than claiming the token is gone.
        // A failed read stays conservative (still subscribed).
        const still = await isFcmSubscribed(user.uid).catch(() => true)
        applySubscribed(still, 'disable:verify')
        pushLog('DISABLE_RESULT', { deleted, still, returnValue: !still }, { lastOperation: `disable → verified still=${still}` })
        if (still) return false
      } else {
        applySubscribed(false, 'disable:success')
        pushLog('DISABLE_RESULT', { deleted, returnValue: true }, { lastOperation: 'disable → deleted=true' })
      }
      // permission stays granted at browser level; keep reading actual permission so "denied" note still works.
      setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
      return true
    } catch (caught) {
      console.error('Could not disable push notifications.', caught)
      setError(caught)
      pushLog('DISABLE_RESULT', { threw: true, returnValue: false }, { lastOperation: 'disable → threw' })
      return false
    } finally {
      setBusy(false)
    }
  }, [user, applySubscribed, pushLog])

  return {
    supported,
    subscribed,
    enabled: permission === 'granted',
    denied: permission === 'denied',
    busy,
    error,
    enable,
    disable,
    // TEMP PUSH-DEBUG — panel data + modal event recorder. Remove with the block.
    pushDebug,
    notePushDebug,
  }
}
