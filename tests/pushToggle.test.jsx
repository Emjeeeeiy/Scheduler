/* DOM behaviour for the push on/off toggle. The contract is easy to get
 * subtly wrong in two ways this pins down: the button state must follow the
 * actual Firestore token state through both directions (not assume success),
 * and a slow subscription check started before a tap must not overwrite that
 * tap's fresh intent when it lands late (the button flipping back right
 * after the toast on slow devices).
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockEnablePush, mockDisablePush, mockIsFcmSubscribed, notificationStub } = vi.hoisted(() => ({
  mockEnablePush: vi.fn(),
  mockDisablePush: vi.fn(),
  mockIsFcmSubscribed: vi.fn(),
  notificationStub: { permission: 'granted' },
}))

vi.mock('../src/state/AuthContext.jsx', () => {
  // One stable reference, like the real AuthContext state — a fresh object
  // per render would refire the hook's effect on every state update.
  const user = { uid: 'user-1' }
  return { useAuth: () => ({ user }) }
})

vi.mock('../src/firebase.js', () => ({
  enablePush: mockEnablePush,
  disablePush: mockDisablePush,
  isFcmSubscribed: mockIsFcmSubscribed,
}))

vi.mock('firebase/messaging', () => ({
  isSupported: () => Promise.resolve(true),
}))

import { usePushNotifications } from '../src/lib/usePushNotifications.js'

beforeEach(() => {
  // jsdom has neither: both are required before the hook reports support.
  notificationStub.permission = 'granted'
  vi.stubGlobal('Notification', notificationStub)
  Object.defineProperty(window.navigator, 'serviceWorker', { value: {}, configurable: true })
  mockEnablePush.mockReset().mockResolvedValue('token-abc')
  mockDisablePush.mockReset().mockResolvedValue(true)
  mockIsFcmSubscribed.mockReset().mockResolvedValue(false)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete window.navigator.serviceWorker
})

describe('usePushNotifications toggle', () => {
  it('Turn on registers the token and reports Turn off state', async () => {
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.supported).toBe(true))

    let outcome
    await act(async () => {
      outcome = await result.current.enable()
    })
    expect(outcome).toEqual({ ok: true })
    expect(mockEnablePush).toHaveBeenCalledWith('user-1')
    expect(result.current.subscribed).toBe(true)
  })

  it('a denied permission reports denied and stays on Turn on', async () => {
    notificationStub.permission = 'denied'
    mockEnablePush.mockResolvedValue(null)
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.supported).toBe(true))

    let outcome
    await act(async () => {
      outcome = await result.current.enable()
    })
    expect(outcome).toEqual({ ok: false, reason: 'denied' })
    expect(result.current.subscribed).toBe(false)
  })

  it('a dismissed prompt reports dismissed and stays on Turn on', async () => {
    notificationStub.permission = 'default'
    mockEnablePush.mockResolvedValue(null)
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.supported).toBe(true))

    let outcome
    await act(async () => {
      outcome = await result.current.enable()
    })
    expect(outcome).toEqual({ ok: false, reason: 'dismissed' })
    expect(result.current.subscribed).toBe(false)
  })

  it('a thrown enable reports error and stays on Turn on', async () => {
    mockEnablePush.mockRejectedValue(new Error('No service worker is registered yet.'))
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.supported).toBe(true))

    let outcome
    await act(async () => {
      outcome = await result.current.enable()
    })
    expect(outcome).toEqual({ ok: false, reason: 'error' })
    expect(result.current.subscribed).toBe(false)
    expect(result.current.error).toBeTruthy()
  })

  it('Turn off deletes the token and reports Turn on state', async () => {
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.supported).toBe(true))

    await act(async () => {
      await result.current.enable()
    })
    expect(result.current.subscribed).toBe(true)

    let ok
    await act(async () => {
      ok = await result.current.disable()
    })
    expect(ok).toBe(true)
    expect(mockDisablePush).toHaveBeenCalledWith('user-1')
    expect(result.current.subscribed).toBe(false)
  })

  it('a slow subscription check landing after Turn off does not flip the button back', async () => {
    let resolveCheck
    mockIsFcmSubscribed.mockImplementation(
      () => new Promise((resolve) => { resolveCheck = resolve }),
    )
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(mockIsFcmSubscribed).toHaveBeenCalled())

    await act(async () => {
      await result.current.enable()
    })
    expect(result.current.subscribed).toBe(true)
    await act(async () => {
      await result.current.disable()
    })
    expect(result.current.subscribed).toBe(false)

    await act(async () => {
      resolveCheck(true)
    })
    expect(result.current.subscribed).toBe(false)
  })

  it('a failed delete keeps Turn off state and reports failure', async () => {
    mockDisablePush.mockResolvedValue(false)
    mockIsFcmSubscribed.mockResolvedValue(true)
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.supported).toBe(true))
    await waitFor(() => expect(result.current.subscribed).toBe(true))

    let ok
    await act(async () => {
      ok = await result.current.disable()
    })
    expect(ok).toBe(false)
    expect(result.current.subscribed).toBe(true)
  })
})
