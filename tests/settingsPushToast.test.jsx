/* The Settings push toggle: what it shows for each state of the browser, and —
 * the part that has bitten before — that every toast describes the operation
 * that ACTUALLY ran. The click handler must pick its message from what
 * enable()/disable() resolve to, never from the hook's fields after the await:
 * those still hold the render the click happened in, so a dismissed prompt
 * could toast as a block (or the reverse) depending on a previous attempt.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { pushStub, mockPushSuccess, mockPushError } = vi.hoisted(() => ({
  pushStub: {
    supported: true,
    permission: 'default',
    denied: false,
    subscribed: false,
    checking: false,
    busy: false,
    enable: vi.fn(),
    disable: vi.fn(),
  },
  mockPushSuccess: vi.fn(),
  mockPushError: vi.fn(),
}))

vi.mock('../src/lib/usePushNotifications.js', () => ({
  usePushNotifications: () => pushStub,
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

vi.mock('../src/state/ThemeContext.jsx', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: vi.fn() }),
}))

import { SettingsModal } from '../src/components/shell/SettingsModal.jsx'

beforeEach(() => {
  Object.assign(pushStub, {
    supported: true,
    permission: 'default',
    denied: false,
    subscribed: false,
    checking: false,
    busy: false,
  })
  pushStub.enable.mockReset()
  pushStub.disable.mockReset()
  mockPushSuccess.mockClear()
  mockPushError.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function click(name) {
  render(<SettingsModal onClose={vi.fn()} />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

describe('what the section shows', () => {
  it('offers Turn on when this device isn’t subscribed', () => {
    render(<SettingsModal onClose={vi.fn()} />)
    expect(screen.getByText('Push notifications')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeTruthy()
  })

  it('offers Turn off when it is', () => {
    pushStub.subscribed = true
    render(<SettingsModal onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Turn on' })).toBeNull()
  })

  it('says it is checking, with no button, until the browser has answered', () => {
    pushStub.checking = true
    render(<SettingsModal onClose={vi.fn()} />)
    expect(screen.getByText(/Checking whether this browser can receive push/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Turn o(n|ff)/ })).toBeNull()
  })

  it('explains an unsupported browser, including the iPhone Home Screen route', () => {
    pushStub.supported = false
    render(<SettingsModal onClose={vi.fn()} />)
    expect(screen.getByText(/can't receive push notifications/)).toBeTruthy()
    expect(screen.getByText(/add Cadence to the Home Screen first \(iOS 16\.4\+\)/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Turn o(n|ff)/ })).toBeNull()
  })

  it('points to the browser’s site settings when notifications are blocked', () => {
    pushStub.denied = true
    render(<SettingsModal onClose={vi.fn()} />)
    expect(screen.getByText(/Blocked at the browser level/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Turn o(n|ff)/ })).toBeNull()
  })

  it('disables the button and says so while working', () => {
    pushStub.busy = true
    render(<SettingsModal onClose={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Working…' })
    expect(button.disabled).toBe(true)
  })

  it('is honest about the limits: about a minute late, browser must be running on a computer', () => {
    render(<SettingsModal onClose={vi.fn()} />)
    expect(screen.getByText(/within about a minute/)).toBeTruthy()
    expect(screen.getByText(/browser has to be\s+running/)).toBeTruthy()
  })
})

describe('toast feedback', () => {
  it('Turn on + success toasts turned-on, and calls enable, not disable', async () => {
    pushStub.enable.mockResolvedValue({ ok: true })
    await click('Turn on')
    expect(pushStub.enable).toHaveBeenCalledTimes(1)
    expect(pushStub.disable).not.toHaveBeenCalled()
    expect(mockPushSuccess).toHaveBeenCalledWith('Push notifications turned on for this device.')
    expect(mockPushError).not.toHaveBeenCalled()
  })

  it.each([
    ['denied', 'Notifications are blocked — allow them in your browser site settings, then reload.'],
    ['dismissed', 'Notifications were not allowed for this site.'],
    ['unsupported', 'This browser cannot receive push notifications.'],
    ['unavailable', 'Push notifications are not available in this build — see README-push.md.'],
    ['error', 'Could not turn on push notifications. Try again.'],
  ])('Turn on + %s toasts the matching error and nothing else', async (reason, message) => {
    pushStub.enable.mockResolvedValue({ ok: false, reason })
    await click('Turn on')
    expect(mockPushError).toHaveBeenCalledTimes(1)
    expect(mockPushError).toHaveBeenCalledWith(message)
    expect(mockPushSuccess).not.toHaveBeenCalled()
  })

  it('picks the message from the result, not from the hook’s stale fields', async () => {
    // The hook still says “not denied” (the render the click happened in) while
    // the result says the browser blocked it — the result wins.
    pushStub.denied = false
    pushStub.enable.mockResolvedValue({ ok: false, reason: 'denied' })
    await click('Turn on')
    expect(mockPushError).toHaveBeenCalledWith(expect.stringContaining('blocked'))
  })

  it('Turn off + success toasts turned-off, and calls disable, not enable', async () => {
    pushStub.subscribed = true
    pushStub.disable.mockResolvedValue(true)
    await click('Turn off')
    expect(pushStub.disable).toHaveBeenCalledTimes(1)
    expect(pushStub.enable).not.toHaveBeenCalled()
    expect(mockPushSuccess).toHaveBeenCalledWith('Push notifications turned off for this device.')
  })

  it('Turn off + failure toasts the failure, never a success', async () => {
    pushStub.subscribed = true
    pushStub.disable.mockResolvedValue(false)
    await click('Turn off')
    expect(mockPushError).toHaveBeenCalledWith('Could not turn off push notifications. Try again.')
    expect(mockPushSuccess).not.toHaveBeenCalled()
  })
})
