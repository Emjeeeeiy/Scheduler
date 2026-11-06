import { useEffect, useRef, useState } from 'react'
import { nowMin, todayKey } from '@cadence/shared/date.js'
import { buildReminders, reminderFireAt } from '@cadence/shared/reminders.js'
import { useAuth } from '../state/AuthContext.jsx'
import { useSchedule } from '../state/ScheduleContext.jsx'
import { useSettings } from '../state/SettingsContext.jsx'
import { callApi } from './apiClient.js'
import { PUSH_CHANGED_EVENT, getLocalSubscription, isPushSupported, pushPermission } from './pushSubscription.js'

/* Wait for edits to settle before sending: dragging a task around the grid is
   a dozen writes in a second, and only the last one matters. */
const SETTLE_MS = 2000

/* An open tab re-checks hourly so the two-week window keeps rolling forward
   and a reminder that has since passed drops out, with no one touching
   anything. */
const REFRESH_MS = 60 * 60 * 1000

/** cyrb53: a small, well-distributed 53-bit string hash. Only used to notice
    "is this the same schedule I already sent" — no security role. */
function fingerprint(text) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/**
 * One sync pass: make sure the server knows this device belongs to this
 * account, then replace the account's reminder schedule with what the app
 * says should exist for the next two weeks.
 *
 * `session` lives as long as this hook does (one page load, one sign-in). It
 * remembers which account the device was registered for and the fingerprint of
 * the last schedule the server acknowledged. Both start empty, so the FIRST
 * pass of every load registers the device and sends the schedule even if it
 * looks identical to last time: that is what moves a shared device to whoever
 * is signed in now, and what repairs a server that has lost its copy (a Redis
 * reset, the schedule's own expiry). Later passes in the same load skip a
 * schedule that hasn't changed.
 */
async function syncOnce(inputs, session) {
  const { uid, tasks, tasksOn, eventsOn, leadMin, nudgeMin } = inputs

  if (session.registeredFor !== uid) {
    const subscription = await getLocalSubscription()
    if (!subscription) return
    const registered = await callApi('/api/push/subscribe', { subscription: subscription.toJSON() })
    if (!registered) return
    session.registeredFor = uid
    session.lastSent = null
  }

  const today = todayKey()
  const reminders = buildReminders({
    tasksOn,
    eventsOn,
    allTasks: tasks,
    fromKey: today,
    nowMin: nowMin(),
    leadMin,
    nudgeMin,
  })
  const entries = reminders.map((reminder) => ({
    id: reminder.id,
    kind: reminder.kind,
    fireAt: reminderFireAt(reminder.key, reminder.min),
    title: reminder.title,
    body: reminder.body,
    tag: reminder.tag,
  }))

  // Today's key is part of it so the window re-sends once a day even when
  // nothing was edited — otherwise it would never roll forward.
  const print = fingerprint(JSON.stringify([uid, today, entries]))
  if (print === session.lastSent) return

  const saved = await callApi('/api/push/schedule', { reminders: entries })
  if (!saved) return // not recorded as sent, so the next pass tries again
  session.lastSent = print
}

/**
 * Keeps the server's copy of "what to remind this person about" current, so
 * reminders still arrive with the app closed or the account signed out.
 *
 * Mounted once, inside the signed-in app shell. It does nothing unless this
 * device has a push subscription — people who never turn push on pay nothing.
 *
 * Signing out unmounts this and deliberately leaves the server's schedule
 * alone: that schedule is exactly what keeps delivering while logged out.
 */
export function useReminderSync() {
  const { user } = useAuth()
  const { tasks, tasksOn, eventsOn, loading, error } = useSchedule()
  const { settings } = useSettings()

  const uid = user?.uid ?? null
  const leadMin = settings.notificationLeadMin
  const nudgeMin = settings.workingHours?.startMin ?? undefined

  const [subscribed, setSubscribed] = useState(false)
  const [beat, setBeat] = useState(0)

  /* Is there a subscription on this device at all? Re-checked when it is
     turned on or off, and whenever the tab comes back, since permission can be
     revoked from the browser's own UI without telling us. */
  useEffect(() => {
    if (!isPushSupported()) return undefined
    let alive = true
    const check = async () => {
      const on = pushPermission() === 'granted' && Boolean(await getLocalSubscription())
      if (alive) setSubscribed(on)
    }
    void check()
    const wake = () => {
      if (document.visibilityState === 'hidden') return
      void check()
      setBeat((n) => n + 1)
    }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('focus', wake)
    window.addEventListener('online', wake)
    window.addEventListener(PUSH_CHANGED_EVENT, wake)
    const hourly = setInterval(() => setBeat((n) => n + 1), REFRESH_MS)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('focus', wake)
      window.removeEventListener('online', wake)
      window.removeEventListener(PUSH_CHANGED_EVENT, wake)
      clearInterval(hourly)
    }
  }, [])

  /* Passes run strictly one at a time, each reading the NEWEST inputs when it
     starts. Otherwise a slow request for an older edit could land after a
     newer one and leave the server with the stale schedule. */
  const latest = useRef(null)
  const session = useRef({ registeredFor: null, lastSent: null })
  const running = useRef(false)
  const rerun = useRef(false)

  // Kept current from an effect, not during render: it runs before the settle
  // timer below can fire, so a pass always sees what was last rendered.
  useEffect(() => {
    latest.current = { uid, tasks, tasksOn, eventsOn, leadMin, nudgeMin }
  }, [uid, tasks, tasksOn, eventsOn, leadMin, nudgeMin])

  useEffect(() => {
    /* `loading`/`error` matter: before the first snapshot lands the task list
       is empty, and sending THAT would erase a schedule the server holds. */
    if (!uid || loading || error || !subscribed) return undefined

    const drain = async () => {
      if (running.current) {
        rerun.current = true
        return
      }
      running.current = true
      try {
        do {
          rerun.current = false
          await syncOnce(latest.current, session.current)
        } while (rerun.current)
      } catch (caught) {
        console.warn('Could not sync push reminders.', caught)
      } finally {
        running.current = false
      }
    }

    const timer = setTimeout(drain, SETTLE_MS)
    return () => clearTimeout(timer)
  }, [uid, loading, error, subscribed, tasks, tasksOn, eventsOn, leadMin, nudgeMin, beat])
}
