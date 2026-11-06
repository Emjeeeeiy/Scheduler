/* The push diagnostics: turning what the server says about an account into
 * plain sentences, and the hook that fetches it for Settings.
 *
 * The wording matters because it is the whole point — before this, "push
 * doesn't work" looked identical whichever of five things had gone wrong, and
 * each message here names one of them. A cause is asserted by what it says to
 * do about it, not by exact copy where the copy is incidental.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/apiClient.js', () => ({ callApi: vi.fn() }))

import { callApi } from '../src/lib/apiClient.js'
import { explainTest, summarizeDiagnostics } from '../src/lib/pushDiagnostics.js'
import { usePushDiagnostics } from '../src/lib/usePushDiagnostics.js'

const KEY = 'the-public-key'
const NOW = new Date(2026, 7, 24, 8, 0, 0).getTime() // Monday 08:00 local
const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** A healthy server answer, overridable per test. */
const diagnosis = (patch = {}) => ({
  ok: true,
  configured: true,
  vapidPublicKey: KEY,
  devices: [{ host: 'fcm.googleapis.com', ua: 'Brave', registeredAt: NOW }],
  reminders: { count: 3, next: { kind: 'soon', title: 'Standup', fireAt: NOW + 30 * 60_000 } },
  ...patch,
})

describe('summarizeDiagnostics', () => {
  it('says it could not reach the server when there is no answer', () => {
    for (const nothing of [null, false]) {
      const { text, problem } = summarizeDiagnostics(nothing, KEY, NOW)
      expect(text).toBeNull()
      expect(problem).toMatch(/could not reach the server/i)
    }
  })

  it('writes the status line: devices, reminders, and what is next', () => {
    const { text, problem } = summarizeDiagnostics(diagnosis(), KEY, NOW)
    expect(text).toBe(`1 device · 3 reminders scheduled · next: Standup at ${clock(NOW + 30 * 60_000)}`)
    expect(problem).toBeNull()
  })

  it('pluralises properly', () => {
    const two = summarizeDiagnostics(
      diagnosis({ devices: [{ host: 'a' }, { host: 'b' }], reminders: { count: 1, next: null } }),
      KEY,
      NOW,
    )
    expect(two.text).toBe('2 devices · 1 reminder scheduled')
  })

  it('leaves "next" out when nothing is queued, and does not call that a fault', () => {
    const { text, problem } = summarizeDiagnostics(diagnosis({ reminders: { count: 0, next: null } }), KEY, NOW)
    expect(text).toBe('1 device · 0 reminders scheduled')
    expect(problem).toBeNull()
  })

  it('adds the day when the next reminder is not today', () => {
    const tomorrow = NOW + 26 * 60 * 60_000
    const { text } = summarizeDiagnostics(
      diagnosis({ reminders: { count: 1, next: { kind: 'start', title: 'Dentist', fireAt: tomorrow } } }),
      KEY,
      NOW,
    )
    const expected = new Date(tomorrow).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    expect(text).toContain(`next: Dentist at ${expected}`)
  })

  describe('what it flags, in the order it would have to be fixed', () => {
    it('a broken server setup, with the server’s own explanation', () => {
      const { problem } = summarizeDiagnostics(
        diagnosis({ configured: false, configError: 'Server is missing VAPID_SUBJECT.' }),
        KEY,
        NOW,
      )
      expect(problem).toContain('Server is missing VAPID_SUBJECT.')
    })

    it('different keys in the app and on the server', () => {
      const { problem } = summarizeDiagnostics(diagnosis({ vapidPublicKey: 'some-other-key' }), KEY, NOW)
      expect(problem).toMatch(/different push keys/)
      expect(problem).toMatch(/VITE_VAPID_PUBLIC_KEY/)
    })

    it('no device registered for the account', () => {
      const { problem } = summarizeDiagnostics(diagnosis({ devices: [] }), KEY, NOW)
      expect(problem).toMatch(/no device registered/)
      expect(problem).toMatch(/turn push off and on/i)
    })

    it('a setup problem outranks a key mismatch, which outranks a missing device', () => {
      const all = diagnosis({ configured: false, configError: 'bad', vapidPublicKey: 'other', devices: [] })
      expect(summarizeDiagnostics(all, KEY, NOW).problem).toContain('bad')
      expect(summarizeDiagnostics({ ...all, configured: true }, KEY, NOW).problem).toMatch(/different push keys/)
    })

    it('does not cry mismatch when this build has no client key to compare', () => {
      expect(summarizeDiagnostics(diagnosis({ vapidPublicKey: 'other' }), '', NOW).problem).toBeNull()
    })
  })
})

describe('explainTest', () => {
  const sent = (results, patch = {}) => diagnosis({ test: results, ...patch })
  const ok = { host: 'fcm.googleapis.com', ok: true, gone: false, status: 201 }

  it('says it could not reach the server when there is no answer', () => {
    expect(explainTest(null, KEY)).toEqual({ ok: false, message: expect.stringMatching(/could not reach/i) })
  })

  it('reports a delivered test, to one device or several', () => {
    expect(explainTest(sent([ok]), KEY)).toEqual({ ok: true, message: expect.stringMatching(/sent to your device/i) })
    expect(explainTest(sent([ok, ok]), KEY).message).toMatch(/sent to 2 devices/i)
  })

  it('reports a partial delivery as a success that names the shortfall', () => {
    const result = explainTest(sent([ok, { host: 'x', ok: false, gone: false, status: 403 }]), KEY)
    expect(result.ok).toBe(true)
    expect(result.message).toMatch(/1 of 2 devices/)
  })

  describe('when nothing was sent', () => {
    it('no device: says so, and to turn push off and on', () => {
      const result = explainTest(sent([], { devices: [] }), KEY)
      expect(result.ok).toBe(false)
      expect(result.message).toMatch(/no device registered/)
    })

    it('server not set up: relays the server’s reason', () => {
      const result = explainTest(
        diagnosis({ configured: false, configError: 'VAPID configuration is invalid: bad subject' }),
        KEY,
      )
      expect(result).toEqual({ ok: false, message: expect.stringContaining('bad subject') })
    })
  })

  describe('when the push service refused it', () => {
    const refused = (status, extra = {}) => ({ host: 'fcm.googleapis.com', ok: false, gone: false, status, ...extra })

    it('expired subscription: turn push off and on', () => {
      const result = explainTest(sent([refused(410, { gone: true })]), KEY)
      expect(result.ok).toBe(false)
      expect(result.message).toMatch(/expired/)
      expect(result.message).toMatch(/turn push off and on/i)
    })

    it('403 or 401: points at the keys, with the status', () => {
      for (const status of [401, 403]) {
        const result = explainTest(sent([refused(status)]), KEY)
        expect(result.message).toContain(`(${status})`)
        expect(result.message).toMatch(/keys differ/)
      }
    })

    it('a confirmed key mismatch is named as such rather than as a bare 403', () => {
      const result = explainTest(sent([refused(403)], { vapidPublicKey: 'other-key' }), KEY)
      expect(result.message).toMatch(/different push keys/)
    })

    it('anything else: includes the status when there is one', () => {
      expect(explainTest(sent([refused(500)]), KEY).message).toMatch(/\(status 500\)/)
      expect(explainTest(sent([refused(null)]), KEY).message).not.toMatch(/status/)
      expect(explainTest(sent([refused(null)]), KEY).message).toMatch(/try again/i)
    })
  })
})

describe('usePushDiagnostics', () => {
  beforeEach(() => {
    callApi.mockReset()
    callApi.mockResolvedValue(diagnosis())
  })

  it('asks nothing of the server until push is on', async () => {
    const { result } = renderHook(() => usePushDiagnostics(false))
    await act(async () => {})
    expect(callApi).not.toHaveBeenCalled()
    expect(result.current.diagnosis).toBeNull()
  })

  it('fetches the diagnosis once push is on', async () => {
    const { result } = renderHook(() => usePushDiagnostics(true))
    await waitFor(() => expect(result.current.diagnosis).toEqual(diagnosis()))
    expect(callApi).toHaveBeenCalledWith('/api/push/diagnose', {})
    expect(result.current.checking).toBe(false)
  })

  it('records an unreachable server as `false`, distinct from "not asked yet"', async () => {
    callApi.mockResolvedValue(null)
    const { result } = renderHook(() => usePushDiagnostics(true))
    await waitFor(() => expect(result.current.diagnosis).toBe(false))
  })

  it('fetches when push is turned on later, and forgets when it is turned off', async () => {
    const { result, rerender } = renderHook(({ active }) => usePushDiagnostics(active), {
      initialProps: { active: false },
    })
    expect(callApi).not.toHaveBeenCalled()

    rerender({ active: true })
    await waitFor(() => expect(result.current.diagnosis).not.toBeNull())

    rerender({ active: false })
    await waitFor(() => expect(result.current.diagnosis).toBeNull())
  })

  it('refresh() asks again', async () => {
    const { result } = renderHook(() => usePushDiagnostics(true))
    await waitFor(() => expect(result.current.diagnosis).not.toBeNull())
    callApi.mockResolvedValue(diagnosis({ reminders: { count: 9, next: null } }))

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.diagnosis.reminders.count).toBe(9)
    expect(callApi).toHaveBeenCalledTimes(2)
  })

  it('test() sends a test, shows the new picture, and hands back the answer', async () => {
    const { result } = renderHook(() => usePushDiagnostics(true))
    await waitFor(() => expect(result.current.diagnosis).not.toBeNull())
    const tested = diagnosis({ test: [{ host: 'fcm.googleapis.com', ok: true, gone: false, status: 201 }] })
    callApi.mockResolvedValue(tested)

    let answer
    await act(async () => {
      answer = await result.current.test()
    })

    expect(callApi).toHaveBeenLastCalledWith('/api/push/diagnose', { test: true })
    expect(answer).toBe(tested)
    expect(result.current.diagnosis).toBe(tested)
    expect(result.current.testing).toBe(false)
  })

  it('test() reports being busy while it works', async () => {
    const { result } = renderHook(() => usePushDiagnostics(true))
    await waitFor(() => expect(result.current.diagnosis).not.toBeNull())
    let release
    callApi.mockReturnValue(new Promise((resolve) => (release = resolve)))

    let pending
    act(() => {
      pending = result.current.test()
    })
    expect(result.current.testing).toBe(true)

    await act(async () => {
      release(diagnosis())
      await pending
    })
    expect(result.current.testing).toBe(false)
  })

  it('test() keeps what was already known when the server can’t be reached', async () => {
    const { result } = renderHook(() => usePushDiagnostics(true))
    await waitFor(() => expect(result.current.diagnosis).toEqual(diagnosis()))
    callApi.mockResolvedValue(null)

    let answer
    await act(async () => {
      answer = await result.current.test()
    })

    expect(answer).toBeNull()
    expect(result.current.diagnosis).toEqual(diagnosis())
  })
})
