/* usePushNotifications — the state behind Settings' toggle. What matters, and
 * what these pin down:
 *
 *   - `subscribed` is read from the BROWSER (permission granted AND a live
 *     subscription), so a permission revoked in the address bar, or a
 *     subscription the browser dropped, shows as off instead of lying.
 *   - enable() hands back WHAT HAPPENED. The caller toasts from that result;
 *     reading denied/error off the hook after the await would see the
 *     pre-click render's values.
 *   - a slow check that started before enable()/disable() can't land late and
 *     flip the button back (seen before as the toggle reverting right after
 *     its own toast).
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/pushSubscription.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    isPushSupported: vi.fn(),
    pushPermission: vi.fn(),
    getLocalSubscription: vi.fn(),
    subscribePush: vi.fn(),
    unsubscribePush: vi.fn(),
  }
})

import {
  PUSH_CHANGED_EVENT,
  getLocalSubscription,
  isPushSupported,
  pushPermission,
  subscribePush,
  unsubscribePush,
} from '../src/lib/pushSubscription.js'
import { usePushNotifications } from '../src/lib/usePushNotifications.js'

const SUB = { endpoint: 'https://fcm.googleapis.com/fcm/send/x' }

/** A promise the test settles by hand — for "the check is still in flight". */
function deferred() {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.resetAllMocks()
  isPushSupported.mockReturnValue(true)
  pushPermission.mockReturnValue('granted')
  getLocalSubscription.mockResolvedValue(null)
  subscribePush.mockResolvedValue({ ok: true })
  unsubscribePush.mockResolvedValue(true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('what the hook reports', () => {
  it('is simply unsupported, and not “checking”, where the browser can’t do push', () => {
    isPushSupported.mockReturnValue(false)
    pushPermission.mockReturnValue('unsupported')
    const { result } = renderHook(() => usePushNotifications())
    expect(result.current).toMatchObject({ supported: false, checking: false, subscribed: false, denied: false })
    expect(getLocalSubscription).not.toHaveBeenCalled()
  })

  it('checks the browser first, then settles', async () => {
    getLocalSubscription.mockResolvedValue(SUB)
    const { result } = renderHook(() => usePushNotifications())
    expect(result.current.checking).toBe(true)
    await waitFor(() => expect(result.current.checking).toBe(false))
    expect(result.current).toMatchObject({ supported: true, subscribed: true, denied: false })
  })

  it('is off when permission is granted but there is no subscription', async () => {
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.checking).toBe(false))
    expect(result.current.subscribed).toBe(false)
  })

  it('is off, and says blocked, when permission was revoked — even if a subscription lingers', async () => {
    pushPermission.mockReturnValue('denied')
    getLocalSubscription.mockResolvedValue(SUB)
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.checking).toBe(false))
    expect(result.current).toMatchObject({ subscribed: false, denied: true })
  })

  it('notices a change made elsewhere on the page', async () => {
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.checking).toBe(false))
    expect(result.current.subscribed).toBe(false)

    getLocalSubscription.mockResolvedValue(SUB)
    act(() => {
      window.dispatchEvent(new Event(PUSH_CHANGED_EVENT))
    })
    await waitFor(() => expect(result.current.subscribed).toBe(true))
  })

  it('re-reads the browser when the tab regains focus (permission can change outside the page)', async () => {
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.checking).toBe(false))

    pushPermission.mockReturnValue('denied')
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    await waitFor(() => expect(result.current.denied).toBe(true))
  })
})

describe('enable()', () => {
  it('resolves to { ok: true } and flips to subscribed', async () => {
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.checking).toBe(false))

    let outcome
    await act(async () => {
      outcome = await result.current.enable()
    })

    expect(outcome).toEqual({ ok: true })
    expect(result.current.subscribed).toBe(true)
    expect(result.current.busy).toBe(false)
  })

  it('is busy while it works', async () => {
    const gate = deferred()
    subscribePush.mockReturnValue(gate.promise)
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.checking).toBe(false))

    let pending
    act(() => {
      pending = result.current.enable()
    })
    expect(result.current.busy).toBe(true)

    await act(async () => {
      gate.resolve({ ok: true })
      await pending
    })
    expect(result.current.busy).toBe(false)
  })

  it('hands back exactly why it failed, and picks up a block from the browser', async () => {
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.checking).toBe(false))
    expect(result.current.denied).toBe(false)

    subscribePush.mockResolvedValue({ ok: false, reason: 'denied' })
    pushPermission.mockReturnValue('denied')
    let outcome
    await act(async () => {
      outcome = await result.current.enable()
    })

    expect(outcome).toEqual({ ok: false, reason: 'denied' })
    expect(result.current).toMatchObject({ subscribed: false, denied: true })
  })

  it('does not call a dismissed prompt a block', async () => {
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.checking).toBe(false))

    subscribePush.mockResolvedValue({ ok: false, reason: 'dismissed' })
    pushPermission.mockReturnValue('default')
    let outcome
    await act(async () => {
      outcome = await result.current.enable()
    })

    expect(outcome).toEqual({ ok: false, reason: 'dismissed' })
    expect(result.current).toMatchObject({ subscribed: false, denied: false })
  })

  it('turns an unexpected throw into a plain error result', async () => {
    subscribePush.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.checking).toBe(false))

    let outcome
    await act(async () => {
      outcome = await result.current.enable()
    })

    expect(outcome).toEqual({ ok: false, reason: 'error' })
    expect(result.current.busy).toBe(false)
  })
})

describe('disable()', () => {
  it('flips to off when the device is really unsubscribed', async () => {
    getLocalSubscription.mockResolvedValue(SUB)
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.subscribed).toBe(true))

    let off
    await act(async () => {
      off = await result.current.disable()
    })

    expect(off).toBe(true)
    expect(result.current.subscribed).toBe(false)
  })

  it('stays on, and says so, when the subscription couldn’t be removed', async () => {
    getLocalSubscription.mockResolvedValue(SUB)
    unsubscribePush.mockResolvedValue(false)
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.subscribed).toBe(true))

    let off
    await act(async () => {
      off = await result.current.disable()
    })

    expect(off).toBe(false)
    expect(result.current.subscribed).toBe(true)
  })

  it('reports a throw as a failure rather than leaving the toggle stuck busy', async () => {
    getLocalSubscription.mockResolvedValue(SUB)
    unsubscribePush.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.subscribed).toBe(true))

    let off
    await act(async () => {
      off = await result.current.disable()
    })

    expect(off).toBe(false)
    expect(result.current.busy).toBe(false)
    expect(result.current.subscribed).toBe(true)
  })
})

describe('a slow check against a quick tap', () => {
  it('does not flip the toggle back after enable() succeeded', async () => {
    // The first check is still waiting on the browser when the person taps.
    const slowCheck = deferred()
    getLocalSubscription.mockReturnValue(slowCheck.promise)
    const { result } = renderHook(() => usePushNotifications())

    await act(async () => {
      await result.current.enable()
    })
    expect(result.current.subscribed).toBe(true)

    // …and now the stale “no subscription” answer finally arrives.
    await act(async () => {
      slowCheck.resolve(null)
      await slowCheck.promise
    })
    expect(result.current.subscribed).toBe(true)
  })
})
