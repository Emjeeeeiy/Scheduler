import { useEffect, useRef, useState } from 'react'
import { usePersistentState } from './usePersistentState.js'
import { describeNotification } from './notifications.js'

const ENABLED_KEY = 'cadence-app:desktop-notifications'
const SEEN_KEY = 'cadence-app:desktop-notifications-seen'

function currentPermission() {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

function loadSeen() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY)) ?? [])
  } catch {
    return new Set()
  }
}

function saveSeen(seen) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen]))
  } catch {
    /* non-fatal: at worst a reload re-fires an alert that already fired */
  }
}

/**
 * OS-level alerts for the same overdue/now/soon feed the bell panel already
 * lists, so a heads-up reaches the desktop even while the tab is in the
 * background. `enabled` is this app's own opt-in — separate from the
 * browser's grant because a page can never revoke that grant once given, so
 * "off" has to mean "we chose not to use it," persisted the same way the
 * grant survives a reload: in sessionStorage, keyed by item id, so a refresh
 * mid-session does not re-fire everything already shown, but a genuinely new
 * occurrence (a fresh id) still gets its alert.
 */
export function useDesktopNotifications(items) {
  const [permission, setPermission] = useState(currentPermission)
  const [enabled, setEnabled] = usePersistentState(ENABLED_KEY, false)
  const seen = useRef(null)
  if (seen.current === null) seen.current = loadSeen()

  useEffect(() => {
    if (permission === 'unsupported') return undefined
    /* No event fires when the browser's own permission changes from outside
       this tab — the address-bar padlock, a global browser setting. Regaining
       focus is the closest proxy there is to "go check again." */
    const resync = () => setPermission(currentPermission())
    document.addEventListener('visibilitychange', resync)
    window.addEventListener('focus', resync)
    return () => {
      document.removeEventListener('visibilitychange', resync)
      window.removeEventListener('focus', resync)
    }
  }, [permission])

  useEffect(() => {
    const ids = new Set(items.map((item) => item.id))
    let changed = false
    for (const id of seen.current) {
      // Pruned rather than kept forever: the id is free to alert again if it
      // is ever true a second time (resolved, then overdue again next week).
      // Only an item that stays continuously true should go quiet after one.
      if (!ids.has(id)) {
        seen.current.delete(id)
        changed = true
      }
    }

    if (enabled && permission === 'granted') {
      for (const item of items) {
        if (seen.current.has(item.id)) continue
        seen.current.add(item.id)
        changed = true
        const notification = new Notification(item.task.title, {
          body: describeNotification(item),
          tag: item.id,
        })
        notification.onclick = () => window.focus()
      }
    }

    if (changed) saveSeen(seen.current)
  }, [items, enabled, permission])

  async function request() {
    if (permission === 'unsupported') return
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result === 'granted') setEnabled(true)
  }

  return { permission, enabled, setEnabled, request }
}
