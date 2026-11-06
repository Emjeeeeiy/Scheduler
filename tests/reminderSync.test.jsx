/* useReminderSync — keeps the server's copy of the reminder schedule current.
 * The server only ever delivers what it was last told, so the failure modes
 * here are all "told the wrong thing" or "not told":
 *
 *   - sending an EMPTY schedule while the task list is still loading would
 *     erase the real one the server holds;
 *   - two passes overlapping, the older request landing last, would leave the
 *     server with stale data;
 *   - a failed request must be retried, not remembered as done;
 *   - a shared device must move to whoever is signed in now.
 *
 * The contexts, the network and the browser's subscription are stubbed; the
 * reminder maths itself is covered in tests/reminders.test.js.
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: { uid: 'uid-1' },
  schedule: { tasks: [], tasksOn: () => [], eventsOn: () => [], loading: false, error: null },
  settings: { notificationLeadMin: 30, workingHours: null },
}))

vi.mock('../src/state/AuthContext.jsx', () => ({ useAuth: () => ({ user: state.user }) }))
vi.mock('../src/state/ScheduleContext.jsx', () => ({ useSchedule: () => state.schedule }))
vi.mock('../src/state/SettingsContext.jsx', () => ({ useSettings: () => ({ settings: state.settings }) }))
vi.mock('../src/lib/apiClient.js', () => ({ callApi: vi.fn() }))
vi.mock('../src/lib/pushSubscription.js', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, isPushSupported: vi.fn(), pushPermission: vi.fn(), getLocalSubscription: vi.fn() }
})

import { callApi } from '../src/lib/apiClient.js'
import {
  PUSH_CHANGED_EVENT,
  getLocalSubscription,
  isPushSupported,
  pushPermission,
} from '../src/lib/pushSubscription.js'
import { useReminderSync } from '../src/lib/useReminderSync.js'

const DAY = '2026-08-24'
const at = (hour, minute = 0, day = 24) => new Date(2026, 7, day, hour, minute).getTime()

const task = (id, patch = {}) => ({
  id,
  title: `Task ${id}`,
  date: DAY,
  startMin: 9 * 60,
  durationMin: 30,
  done: false,
  recurrence: null,
  ...patch,
})

const scheduleOf = (tasks, patch = {}) => ({
  tasks,
  tasksOn: (key) => tasks.filter((t) => t.date === key),
  eventsOn: () => [],
  loading: false,
  error: null,
  ...patch,
})

const subscription = {
  toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'p', auth: 'a' } }),
}

const calls = (path) => callApi.mock.calls.filter(([p]) => p === path)

/** Lets the "do we have a subscription?" check resolve and the settle timer arm. */
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
/** Waits out the debounce and the pass that follows it. */
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(2100) })

let view
const mount = () => {
  view = renderHook(() => useReminderSync())
  return view
}
/** Changes what the stubbed contexts return, then re-renders the hook. */
const update = (patch) => {
  Object.assign(state, patch)
  act(() => view.rerender())
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 7, 24, 8, 0, 0)) // Monday 08:00, local
  vi.resetAllMocks()
  state.user = { uid: 'uid-1' }
  state.schedule = scheduleOf([task('a')])
  state.settings = { notificationLeadMin: 30, workingHours: null }
  isPushSupported.mockReturnValue(true)
  pushPermission.mockReturnValue('granted')
  getLocalSubscription.mockResolvedValue(subscription)
  callApi.mockResolvedValue({ ok: true })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  view?.unmount()
  view = null
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('when it stays out of the way', () => {
  it('does nothing until this device has a push subscription', async () => {
    getLocalSubscription.mockResolvedValue(null)
    mount()
    await flush()
    await settle()
    expect(callApi).not.toHaveBeenCalled()
  })

  it('does nothing when permission was revoked, even if a subscription lingers', async () => {
    pushPermission.mockReturnValue('denied')
    mount()
    await flush()
    await settle()
    expect(callApi).not.toHaveBeenCalled()
  })

  it('does nothing where push is unsupported', async () => {
    isPushSupported.mockReturnValue(false)
    mount()
    await flush()
    await settle()
    expect(callApi).not.toHaveBeenCalled()
  })

  it('does nothing when nobody is signed in', async () => {
    state.user = null
    mount()
    await flush()
    await settle()
    expect(callApi).not.toHaveBeenCalled()
  })

  it('does not send while the schedule is still loading, which would erase the real one', async () => {
    state.schedule = scheduleOf([], { loading: true })
    mount()
    await flush()
    await settle()
    expect(callApi).not.toHaveBeenCalled()

    update({ schedule: scheduleOf([task('a')]) })
    await flush()
    await settle()
    expect(calls('/api/push/schedule')).toHaveLength(1)
  })

  it('does not send after the schedule failed to load', async () => {
    state.schedule = scheduleOf([], { error: new Error('permission-denied') })
    mount()
    await flush()
    await settle()
    expect(callApi).not.toHaveBeenCalled()
  })

  it('sends nothing if it is unmounted before the edits settle', async () => {
    mount()
    await flush()
    view.unmount()
    await settle()
    expect(callApi).not.toHaveBeenCalled()
  })
})

describe('a pass', () => {
  it('registers this device, then sends the schedule the app computed', async () => {
    mount()
    await flush()
    await settle()

    expect(callApi.mock.calls.map(([path]) => path)).toEqual(['/api/push/subscribe', '/api/push/schedule'])
    expect(callApi).toHaveBeenNthCalledWith(1, '/api/push/subscribe', { subscription: subscription.toJSON() })

    const [, body] = callApi.mock.calls[1]
    // Monday's task is still open on Tuesday, so every morning after it carries
    // an overdue nudge (13 more days in the 14-day window)…
    expect(body.reminders.filter((r) => r.kind === 'nudge')).toHaveLength(13)
    // …and the two reminders for the task itself are exactly these.
    expect(body.reminders.filter((r) => r.kind !== 'nudge')).toEqual([
      {
        id: `soon-a-${DAY}`,
        kind: 'soon',
        fireAt: at(8, 30),
        title: 'Task a',
        body: 'Starts in 30m · 9:00 AM',
        tag: 'soon-a',
      },
      {
        id: `start-a-${DAY}`,
        kind: 'start',
        fireAt: at(9, 0),
        title: 'Task a',
        body: 'Happening now · 30m',
        tag: 'now-a',
      },
    ])
  })

  it('uses the lead time from Settings, and Working hours for the morning nudge', async () => {
    state.settings = { notificationLeadMin: 15, workingHours: { startMin: 9 * 60 + 30, endMin: null } }
    state.schedule = scheduleOf([task('late', { date: '2026-08-20', startMin: null })])
    mount()
    await flush()
    await settle()

    const { reminders } = calls('/api/push/schedule')[0][1]
    // Overdue from 2026-08-20, so a nudge on each of the 14 days at 9:30.
    expect(reminders).toHaveLength(14)
    expect(reminders[0]).toMatchObject({ kind: 'nudge', fireAt: at(9, 30) })
    expect(reminders[1].fireAt).toBe(at(9, 30, 25))
  })

  it('waits for a burst of edits to settle and sends once', async () => {
    mount()
    await flush()
    await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
    update({ schedule: scheduleOf([task('a', { startMin: 10 * 60 })]) })
    await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
    update({ schedule: scheduleOf([task('a', { startMin: 11 * 60 })]) })
    expect(calls('/api/push/schedule')).toHaveLength(0)

    await settle()

    const sent = calls('/api/push/schedule')
    expect(sent).toHaveLength(1)
    expect(sent[0][1].reminders.find((r) => r.kind === 'start').fireAt).toBe(at(11, 0))
  })

  it('sends again when the schedule changes', async () => {
    mount()
    await flush()
    await settle()
    update({ schedule: scheduleOf([task('a'), task('b', { startMin: 14 * 60 })]) })
    await settle()

    const sent = calls('/api/push/schedule')
    expect(sent).toHaveLength(2)
    expect(sent[1][1].reminders.map((r) => r.id)).toContain(`start-b-${DAY}`)
  })

  it('sends an empty schedule when the last reminder is gone, so the server forgets it', async () => {
    mount()
    await flush()
    await settle()
    update({ schedule: scheduleOf([task('a', { done: true })]) })
    await settle()

    expect(calls('/api/push/schedule').at(-1)[1]).toEqual({ reminders: [] })
  })

  it('skips an unchanged schedule on later passes in the same load', async () => {
    mount()
    await flush()
    await settle()
    expect(calls('/api/push/schedule')).toHaveLength(1)

    // The tab comes back to the front: a new pass runs, but nothing changed.
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    await flush()
    await settle()

    expect(calls('/api/push/schedule')).toHaveLength(1)
    expect(calls('/api/push/subscribe')).toHaveLength(1)
  })

  it('refreshes hourly, dropping reminders that have since passed', async () => {
    mount()
    await flush()
    await settle()
    const timed = (call) => call[1].reminders.filter((r) => r.kind !== 'nudge')
    expect(timed(calls('/api/push/schedule')[0])).toHaveLength(2)

    await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60 * 1000) })
    await settle()

    // It is now past 09:00, so both of this morning's reminders are history —
    // only the following mornings' overdue nudges are left.
    const latest = calls('/api/push/schedule').at(-1)
    expect(calls('/api/push/schedule')).toHaveLength(2)
    expect(timed(latest)).toEqual([])
    expect(latest[1].reminders).toHaveLength(13)
  })

  it('picks up a subscription turned on while the page is open', async () => {
    getLocalSubscription.mockResolvedValue(null)
    mount()
    await flush()
    await settle()
    expect(callApi).not.toHaveBeenCalled()

    getLocalSubscription.mockResolvedValue(subscription)
    act(() => {
      window.dispatchEvent(new Event(PUSH_CHANGED_EVENT))
    })
    await flush()
    await settle()

    expect(calls('/api/push/schedule')).toHaveLength(1)
  })
})

describe('when the network lets it down', () => {
  it('tries the schedule again on the next pass, instead of remembering it as sent', async () => {
    callApi.mockImplementation(async (path) => (path === '/api/push/schedule' ? null : { ok: true }))
    mount()
    await flush()
    await settle()
    expect(calls('/api/push/schedule')).toHaveLength(1)

    callApi.mockResolvedValue({ ok: true })
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    await flush()
    await settle()

    expect(calls('/api/push/schedule')).toHaveLength(2)
    expect(calls('/api/push/subscribe')).toHaveLength(1) // the device was registered the first time
  })

  it('does not send a schedule for a device the server didn’t accept, and retries registering', async () => {
    callApi.mockImplementation(async (path) => (path === '/api/push/subscribe' ? null : { ok: true }))
    mount()
    await flush()
    await settle()
    expect(calls('/api/push/schedule')).toHaveLength(0)

    callApi.mockResolvedValue({ ok: true })
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    await flush()
    await settle()

    expect(calls('/api/push/subscribe')).toHaveLength(2)
    expect(calls('/api/push/schedule')).toHaveLength(1)
  })

  it('keeps passes in order: a slow request for older data can’t land after newer data', async () => {
    let releaseFirst
    callApi.mockImplementation((path) =>
      path === '/api/push/schedule' && releaseFirst === undefined
        ? new Promise((resolve) => {
            releaseFirst = () => resolve({ ok: true })
          })
        : Promise.resolve({ ok: true }),
    )
    mount()
    await flush()
    await settle() // pass 1 is now stuck waiting on the network

    update({ schedule: scheduleOf([task('a', { startMin: 15 * 60 })]) })
    await settle()
    // Pass 2 wants to run but must wait its turn.
    expect(calls('/api/push/schedule')).toHaveLength(1)

    await act(async () => {
      releaseFirst()
      await vi.advanceTimersByTimeAsync(0)
    })

    const sent = calls('/api/push/schedule')
    expect(sent).toHaveLength(2)
    // The second request carries the NEWEST data, not what pass 1 started with.
    expect(sent[1][1].reminders.find((r) => r.kind === 'start').fireAt).toBe(at(15, 0))
  })
})

describe('a shared device', () => {
  it('registers again for whoever signs in next, and sends their schedule even if it looks the same', async () => {
    mount()
    await flush()
    await settle()
    view.unmount() // sign out unmounts the signed-in shell

    state.user = { uid: 'uid-2' }
    mount() // …and the next sign-in mounts a fresh one
    await flush()
    await settle()

    expect(calls('/api/push/subscribe')).toHaveLength(2)
    expect(calls('/api/push/schedule')).toHaveLength(2)
    expect(calls('/api/push/schedule')[1][1]).toEqual(calls('/api/push/schedule')[0][1])
  })

  it('re-registers when the signed-in account changes under a mounted hook', async () => {
    mount()
    await flush()
    await settle()

    update({ user: { uid: 'uid-2' } })
    await settle()

    expect(calls('/api/push/subscribe')).toHaveLength(2)
    expect(calls('/api/push/schedule')).toHaveLength(2)
  })
})
