/* Per-user wall-clock conversion for push notifications.
 *
 * Cadence stores task times as local wall-clock (date=YYYY-MM-DD,
 * startMin=minutes from midnight in the user's own zone) — see
 * src/lib/date.js. A Cloud Function running on UTC cannot compare UTC
 * `todayKey/nowMin` against those values or every reminder slides by the
 * user's offset.
 *
 * Each user now has `users/{uid}.timeZone` (IANA, e.g. "Asia/Manila") set by
 * the browser via Intl.DateTimeFormat().resolvedOptions().timeZone.
 * This helper turns a single UTC instant into that user's own
 * `{key, min}` so buildNotifications runs against the same clock the
 * foreground NotificationBell already uses (useNow → todayKey/nowMin local).
 */

/**
 * @param {string|null|undefined} timeZone — IANA zone or missing
 * @param {Date} [now] — UTC instant (defaults to new Date())
 * @return {{key:string, min:number}} — user's local day key and minute [0..1439]
 */
export function localNowInZone(timeZone, now = new Date()) {
  if (!timeZone || typeof timeZone !== 'string') {
    return utcFallback(now)
  }
  try {
    // en-CA gives YYYY-MM-DD directly; en-GB with hour12:false gives HH:MM( 24h).
    const key = now.toLocaleDateString('en-CA', { timeZone })
    const time = now.toLocaleTimeString('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const [hStr, mStr] = time.split(':')
    const h = Number(hStr)
    const m = Number(mStr)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return utcFallback(now)
    // Validate key shape — a bad zone would already have thrown, but guard anyway.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return utcFallback(now)
    return { key, min: h * 60 + m }
  } catch {
    return utcFallback(now)
  }
}

function utcFallback(now) {
  const key = now.toISOString().slice(0, 10)
  return { key, min: now.getUTCHours() * 60 + now.getUTCMinutes() }
}
