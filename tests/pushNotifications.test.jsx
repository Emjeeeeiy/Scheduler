/* DOM behaviour for usePushNotifications. Mirrors installPrompt.test.jsx's
 * shape — a browser-capability hook, tested the same way — but everything
 * this hook actually WRITES (a token, a Firestore doc) is mocked at the
 * src/firebase.js boundary, since enablePush/disablePush need a live
 * project to do anything real. What's under test here is the hook's own
 * state machine: does it reflect permission correctly, does it recover
 * from a rejection, does "denied" mean what the UI needs it to mean.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePushNotifications } from '../src/lib/usePushNotifications.js'

// A mutable binding inside the mock factory (the same pattern
// itemDetail.test.jsx uses for its own stateful mock) so one test —
// "does nothing when there is no signed-in user" — can flip it to null
// without needing vi.resetModules() or a second dynamic import.
let mockUser = { uid: 'u1' }

vi.mock('../src/state/AuthContext.jsx', () => ({
  useAuth: () => ({ user: mockUser }),
}))

const enablePushMock = vi.fn()
const disablePushMock = vi.fn()
vi.mock('../src/firebase.js', () => ({
  enablePush: (...args) => enablePushMock(...args),
  disablePush: (...args) => disablePushMock(...args),
}))

vi.mock('firebase/messaging', () => ({
  isSupported: vi.fn(async () => true),
}))

function stubNotification(initialPermission) {
  const requestPermission = vi.fn(async () => initialPermission)
  vi.stubGlobal('Notification', { permission: initialPermission, requestPermission })
  vi.stubGlobal('navigator', { ...globalThis.navigator, serviceWorker: {} })
  return requestPermission
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  mockUser = { uid: 'u1' }
})

describe('usePushNotifications', () => {
  it('starts unsupported when the browser has no Notification API at all', async () => {
    vi.stubGlobal('Notification', undefined)
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.supported).toBe(false))
    expect(result.current.enabled).toBe(false)
  })

  it('resolves supported once firebase/messaging confirms it', async () => {
    stubNotification('default')
    const { result } = renderHook(() => usePushNotifications())
    expect(result.current.supported).toBe(null)
    await waitFor(() => expect(result.current.supported).toBe(true))
  })

  it('reports enabled once permission is already granted', async () => {
    stubNotification('granted')
    const { result } = renderHook(() => usePushNotifications())
    expect(result.current.enabled).toBe(true)
    expect(result.current.denied).toBe(false)
  })

  it('reports denied distinctly from "never asked", so the UI can explain why the toggle is stuck', async () => {
    stubNotification('denied')
    const { result } = renderHook(() => usePushNotifications())
    expect(result.current.enabled).toBe(false)
    expect(result.current.denied).toBe(true)
  })

  it('enable() calls through to firebase.js and reflects the resulting permission', async () => {
    stubNotification('default')
    enablePushMock.mockImplementation(async () => {
      globalThis.Notification.permission = 'granted'
      return 'a-fake-token'
    })
    const { result } = renderHook(() => usePushNotifications())

    let ok
    await act(async () => {
      ok = await result.current.enable()
    })

    expect(enablePushMock).toHaveBeenCalledWith('u1')
    expect(ok).toBe(true)
    expect(result.current.enabled).toBe(true)
  })

  it('enable() reports false, not a thrown error into the render, when permission is refused', async () => {
    stubNotification('default')
    enablePushMock.mockResolvedValue(null) // enablePush's own contract for "denied"
    const { result } = renderHook(() => usePushNotifications())

    let ok
    await act(async () => {
      ok = await result.current.enable()
    })

    expect(ok).toBe(false)
    expect(result.current.error).toBe(null)
  })

  it('surfaces a genuine failure (missing VAPID key, network) without crashing the hook', async () => {
    stubNotification('default')
    const boom = new Error('VITE_FIREBASE_VAPID_KEY is missing')
    enablePushMock.mockRejectedValue(boom)
    const { result } = renderHook(() => usePushNotifications())

    let ok
    await act(async () => {
      ok = await result.current.enable()
    })

    expect(ok).toBe(false)
    expect(result.current.error).toBe(boom)
    expect(result.current.busy).toBe(false)
  })

  it('disable() calls through with the current uid', async () => {
    stubNotification('granted')
    disablePushMock.mockResolvedValue(undefined)
    const { result } = renderHook(() => usePushNotifications())

    await act(async () => {
      await result.current.disable()
    })

    expect(disablePushMock).toHaveBeenCalledWith('u1')
  })

  it('does nothing when there is no signed-in user', async () => {
    stubNotification('default')
    mockUser = null
    const { result } = renderHook(() => usePushNotifications())

    let ok
    await act(async () => {
      ok = await result.current.enable()
    })

    expect(ok).toBe(false)
    expect(enablePushMock).not.toHaveBeenCalled()
  })
})
