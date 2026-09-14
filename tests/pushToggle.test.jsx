/* DOM behaviour for the push on/off toggle. The contract is easy to get
 * subtly wrong in two ways this pins down: the button state must follow the
 * actual Firestore token state through both directions (not assume success),
 * and a slow subscription check started before a tap must not overwrite that
 * tap's fresh intent when it lands late (the button flipping back right
 * after the toast on slow devices).
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockEnablePush, mockDisablePush, mockIsFcmSubscribed } = vi.hoisted(() => ({
  mockEnablePush: vi.fn(),
  mockDisablePush: vi.fn(),
  mockIsFcmSubscribed: vi.fn(),
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
  vi.stubGlobal('Notification', { permission: 'granted' })
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

    let granted
    await act(async () => {
      granted = await result.current.enable()
    })
    expect(granted).toBe(true)
    expect(mockEnablePush).toHaveBeenCalledWith('user-1')
    expect(result.current.subscribed).toBe(true)
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
