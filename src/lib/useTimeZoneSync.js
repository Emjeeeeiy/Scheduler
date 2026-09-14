import { useEffect } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../firebase.js'
import { useAuth } from '../state/AuthContext.jsx'
import { useSchedule } from '../state/ScheduleContext.jsx'

/**
 * Keeps users/{uid}.timeZone (IANA) in sync with the browser's own zone.
 * Tasks store wall-clock (date/startMin) — see src/lib/date.js — so the
 * server's 5-min push scheduler must know which zone to interpret them in.
 * Without this, UTC vs local offset would slide reminders by hours.
 *
 * Writes best-effort on login and when the zone visibly changes (travel,
 * OS change detected via visibilitychange/focus).
 */
export function useTimeZoneSync() {
  const { user } = useAuth()
  const { profile } = useSchedule()
  const uid = user?.uid ?? null

  const existingZone = profile?.timeZone ?? null

  useEffect(() => {
    if (!uid || !db) return undefined
    let cancelled = false

    async function sync() {
      let tz = null
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null
      } catch {
        return
      }
      if (!tz || typeof tz !== 'string') return
      if (existingZone === tz) return
      // Don't spam writes: profile may be null on first load (Google account
      // with no doc yet) — still write so server has something to use.
      try {
        await setDoc(
          doc(db, 'users', uid),
          { timeZone: tz, timeZoneUpdatedAt: Date.now() },
          { merge: true },
        )
      } catch {
        /* offline or rules not published — non-fatal, will retry next sync */
      }
      if (cancelled) return
    }

    sync()

    // Re-check when tab regains focus — user may have changed OS zone or
    // traveled since last sync.
    const handle = () => sync()
    document.addEventListener('visibilitychange', handle)
    window.addEventListener('focus', handle)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handle)
      window.removeEventListener('focus', handle)
    }
  }, [uid, existingZone])
}
