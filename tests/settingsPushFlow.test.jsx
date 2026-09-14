/* End-to-end push toggle consistency: the rendered button label, the toast,
 * and the backend subscription flag must all describe the same operation
 * result after every click — never "turned on" paired with Turn on, or
 * "turned off" paired with Turn off. Real SettingsModal + real
 * usePushNotifications; only the firebase layer is a faithful in-memory
 * model (one backend flag standing in for the fcmTokens doc).
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockEnablePush, mockDisablePush, mockIsFcmSubscribed, notificationStub } = vi.hoisted(() => ({
  mockEnablePush: vi.fn(),
  mockDisablePush: vi.fn(),
  mockIsFcmSubscribed: vi.fn(),
  notificationStub: { permission: 'granted' },
}))

// In-memory stand-in for the users/{uid}/fcmTokens doc of this device.
let backendSubscribed = false

vi.mock('../src/state/AuthContext.jsx', () => {
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

const { mockPushSuccess, mockPushError } = vi.hoisted(() => ({
  mockPushSuccess: vi.fn(),
  mockPushError: vi.fn(),
}))

vi.mock('../src/state/ToastContext.jsx', () => ({
  useToast: () => ({ pushSuccess: mockPushSuccess, pushError: mockPushError }),
}))

vi.mock('../src/state/ScheduleContext.jsx', () => ({
  useSchedule: () => ({
    tasks: [],
    events: [],
    tags: [],
    templates: [],
    importData: vi.fn(),
    removeTemplate: vi.fn(),
    profile: {},
    updateDigestPreference: vi.fn(),
  }),
}))

vi.mock('../src/state/SettingsContext.jsx', async (importOriginal) => {
  const mod = await importOriginal()
  return {
    ...mod,
    useSettings: () => ({
      settings: {
        weekStartsOn: 1,
        landingView: 'dashboard',
        notificationLeadMin: 60,
        workingHours: null,
        shortcuts: { newTask: 'n', newEvent: 'e', jumpToday: 't', prevDate: 'ArrowLeft', nextDate: 'ArrowRight' },
      },
      updateSetting: vi.fn(),
    }),
  }
})

vi.mock('../src/lib/useInstallPrompt.js', () => ({
  useInstallPrompt: () => ({ canInstall: false, installed: false, promptInstall: vi.fn() }),
}))

import { SettingsModal } from '../src/components/shell/SettingsModal.jsx'

beforeEach(() => {
  backendSubscribed = false
  notificationStub.permission = 'granted'
  vi.stubGlobal('Notification', notificationStub)
  Object.defineProperty(window.navigator, 'serviceWorker', { value: {}, configurable: true })
  mockEnablePush.mockReset().mockImplementation(async () => {
    backendSubscribed = true
    return 'tok-1'
  })
  mockDisablePush.mockReset().mockImplementation(async () => {
    backendSubscribed = false
    return true
  })
  mockIsFcmSubscribed.mockReset().mockImplementation(async () => backendSubscribed)
  mockPushSuccess.mockClear()
  mockPushError.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete window.navigator.serviceWorker
})

async function openSettings() {
  render(<SettingsModal onClose={vi.fn()} />)
}

async function clickPushButton(name) {
  const button = await screen.findByRole('button', { name })
  await act(async () => {
    fireEvent.click(button)
  })
}

describe('SettingsModal push flow — button, toast, and backend agree', () => {
  it('unsubscribed → Turn on → turned-on toast + Turn off + backend on', async () => {
    await openSettings()
    await clickPushButton('Turn on')
    expect(backendSubscribed).toBe(true)
    expect(mockPushSuccess).toHaveBeenCalledWith('Push notifications turned on for this device.')
    expect(mockPushError).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeTruthy()
  })

  it('subscribed → Turn off → turned-off toast + Turn on + backend off', async () => {
    backendSubscribed = true
    await openSettings()
    await clickPushButton('Turn off')
    expect(backendSubscribed).toBe(false)
    expect(mockPushSuccess).toHaveBeenCalledWith('Push notifications turned off for this device.')
    expect(mockPushError).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeTruthy()
  })

  it('failed enable keeps Turn on with a failure toast, backend untouched', async () => {
    mockEnablePush.mockRejectedValue(new Error('No service worker is registered yet.'))
    await openSettings()
    await clickPushButton('Turn on')
    expect(backendSubscribed).toBe(false)
    expect(mockPushError).toHaveBeenCalledWith('Could not turn on push notifications. Try again.')
    expect(mockPushSuccess).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeTruthy()
  })

  it('failed disable keeps Turn off with a failure toast, backend untouched', async () => {
    backendSubscribed = true
    mockDisablePush.mockResolvedValue(false)
    await openSettings()
    await clickPushButton('Turn off')
    expect(backendSubscribed).toBe(true)
    expect(mockPushError).toHaveBeenCalledWith('Could not turn off push notifications. Try again.')
    expect(mockPushSuccess).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeTruthy()
  })

  it('a stale check resolving false after enable does not revert Turn off', async () => {
    let resolveStale
    mockIsFcmSubscribed.mockImplementationOnce(
      () => new Promise((resolve) => { resolveStale = resolve }),
    )
    await openSettings()
    // Initial check still pending: the pre-check Turn on is what the user saw.
    expect((await screen.findByRole('button', { name: 'Turn on' })).textContent).toBe('Turn on')
    await clickPushButton('Turn on')
    expect(mockPushSuccess).toHaveBeenCalledWith('Push notifications turned on for this device.')
    await act(async () => {
      resolveStale(false)
    })
    expect(backendSubscribed).toBe(true)
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeTruthy()
  })

  it('a stale check resolving true after disable does not revert Turn on', async () => {
    // Permission starts undecided so no check runs until enable grants it.
    notificationStub.permission = 'default'
    mockEnablePush.mockImplementation(async () => {
      notificationStub.permission = 'granted'
      backendSubscribed = true
      return 'tok-1'
    })
    let resolveStale
    mockIsFcmSubscribed.mockImplementation(
      () => new Promise((resolve) => { resolveStale = resolve }),
    )
    await openSettings()
    await clickPushButton('Turn on')
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeTruthy()
    // The grant retriggered the check; it is still pending when Turn off lands.
    await clickPushButton('Turn off')
    expect(mockPushSuccess).toHaveBeenCalledWith('Push notifications turned off for this device.')
    await act(async () => {
      resolveStale(true)
    })
    expect(backendSubscribed).toBe(false)
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeTruthy()
  })

  it('a denied browser never offers Turn on — it explains the block instead', async () => {
    notificationStub.permission = 'denied'
    await openSettings()
    expect(await screen.findByText(/Blocked at the browser level/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Turn on' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Turn off' })).toBeNull()
  })

  it('the button is disabled while an operation is in flight', async () => {
    let resolveEnable
    mockEnablePush.mockImplementation(
      () => new Promise((resolve) => { resolveEnable = resolve }),
    )
    await openSettings()
    const button = await screen.findByRole('button', { name: 'Turn on' })
    let clicked
    act(() => {
      fireEvent.click(button)
    })
    clicked = button
    expect(clicked.disabled).toBe(true)
    expect(clicked.textContent).toBe('Working…')
    await act(async () => {
      resolveEnable('tok-1')
    })
    expect(mockEnablePush).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeTruthy()
  })
})
