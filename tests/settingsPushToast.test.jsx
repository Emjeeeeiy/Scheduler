/* The Settings push toggle: what it shows for each state of the browser, and —
 * the part that has bitten before — that every toast describes the operation
 * that ACTUALLY ran. The click handler must pick its message from what
 * enable()/disable() resolve to, never from the hook's fields after the await:
 * those still hold the render the click happened in, so a dismissed prompt
 * could toast as a block (or the reverse) depending on a previous attempt.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { pushStub, diagStub, authStub, scheduleStub, mockPushSuccess, mockPushError } = vi.hoisted(() => ({
  // Push only serves confirmed addresses (api/_lib/auth.js).
  authStub: { emailVerified: true, resendVerification: () => Promise.resolve(true) },
  // The account's profile doc: what the digest checkbox reads.
  scheduleStub: { profile: {} },
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
  // What the server says about this account; null = not answered yet, false =
  // couldn't be reached.
  diagStub: { diagnosis: null, checking: false, testing: false, refresh: vi.fn(), test: vi.fn() },
  mockPushSuccess: vi.fn(),
  mockPushError: vi.fn(),
}))

vi.mock('../src/lib/usePushNotifications.js', () => ({
  usePushNotifications: () => pushStub,
}))

vi.mock('../src/state/AuthContext.jsx', () => ({
  useAuth: () => authStub,
}))

vi.mock('../src/lib/usePushDiagnostics.js', () => ({
  usePushDiagnostics: () => diagStub,
}))

vi.mock('../src/lib/pushSubscription.js', () => ({
  isBrave: vi.fn(() => false),
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
    get profile() {
      return scheduleStub.profile
    },
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

import { SettingsView } from '../src/components/views/SettingsView.jsx'
import { isBrave } from '../src/lib/pushSubscription.js'

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
  authStub.emailVerified = true
  authStub.resendVerification = vi.fn(async () => true)
  scheduleStub.profile = {}
  Object.assign(diagStub, { diagnosis: null, checking: false, testing: false })
  diagStub.refresh.mockReset()
  diagStub.test.mockReset()
  isBrave.mockReset()
  isBrave.mockReturnValue(false)
  // The app's own public key, as this build would have baked in. Pinned so the
  // tests never depend on whatever .env.local holds on the machine running them.
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'server-key')
  mockPushSuccess.mockClear()
  mockPushError.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

async function click(name) {
  render(<SettingsView section="notifications" />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

describe('what the section shows', () => {
  it('offers Turn on when this device isn’t subscribed', () => {
    render(<SettingsView section="notifications" />)
    expect(screen.getByText('Push notifications')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeTruthy()
  })

  it('offers Turn off when it is', () => {
    pushStub.subscribed = true
    render(<SettingsView section="notifications" />)
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Turn on' })).toBeNull()
  })

  it('says it is checking, with no button, until the browser has answered', () => {
    pushStub.checking = true
    render(<SettingsView section="notifications" />)
    expect(screen.getByText(/Checking whether this browser can receive push/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Turn o(n|ff)/ })).toBeNull()
  })

  it('explains an unsupported browser, including the iPhone Home Screen route', () => {
    pushStub.supported = false
    render(<SettingsView section="notifications" />)
    expect(screen.getByText(/can't receive push notifications/)).toBeTruthy()
    expect(screen.getByText(/add Cadence to the Home Screen first \(iOS 16\.4\+\)/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Turn o(n|ff)/ })).toBeNull()
  })

  it('points to the browser’s site settings when notifications are blocked', () => {
    pushStub.denied = true
    render(<SettingsView section="notifications" />)
    expect(screen.getByText(/Blocked at the browser level/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Turn o(n|ff)/ })).toBeNull()
  })

  it('disables the button and says so while working', () => {
    pushStub.busy = true
    render(<SettingsView section="notifications" />)
    const button = screen.getByRole('button', { name: 'Working…' })
    expect(button.disabled).toBe(true)
  })

  it('is honest about the limits: about a minute late, browser must be running on a computer', () => {
    render(<SettingsView section="notifications" />)
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

describe('when the browser cannot reach its push service', () => {
  // Chromium's "Registration failed - push service error". Brave ships with
  // Google's push service off, so for Brave the message names the setting.
  it('tells a Brave user which setting to turn on', async () => {
    isBrave.mockReturnValue(true)
    pushStub.enable.mockResolvedValue({ ok: false, reason: 'service' })
    await click('Turn on')
    expect(mockPushError).toHaveBeenCalledTimes(1)
    expect(mockPushError).toHaveBeenCalledWith(expect.stringContaining('Use Google Services for Push Messaging'))
    expect(mockPushError).toHaveBeenCalledWith(expect.stringContaining('brave://settings/privacy'))
  })

  it('tells anyone else to look for something blocking it', async () => {
    pushStub.enable.mockResolvedValue({ ok: false, reason: 'service' })
    await click('Turn on')
    expect(mockPushError).toHaveBeenCalledWith(expect.stringContaining('VPN'))
    expect(mockPushError).not.toHaveBeenCalledWith(expect.stringContaining('Brave'))
  })

  it('keeps a standing hint for Brave users only', () => {
    render(<SettingsView section="notifications" />)
    expect(screen.queryByText(/In Brave, push only works/)).toBeNull()
    cleanup()

    isBrave.mockReturnValue(true)
    render(<SettingsView section="notifications" />)
    expect(screen.getByText(/In Brave, push only works/)).toBeTruthy()
  })
})

describe('the server status and the test notification', () => {
  const ok = { host: 'fcm.googleapis.com', ok: true, gone: false, status: 201 }
  const healthy = (patch = {}) => ({
    ok: true,
    configured: true,
    vapidPublicKey: 'server-key',
    devices: [{ host: 'fcm.googleapis.com', ua: 'Brave', registeredAt: 1 }],
    reminders: { count: 3, next: { kind: 'soon', title: 'Standup', fireAt: new Date(2026, 7, 24, 9, 0).getTime() } },
    ...patch,
  })

  it('shows nothing about the server, and no test button, while push is off', () => {
    render(<SettingsView section="notifications" />)
    expect(screen.queryByText(/reminders? scheduled/)).toBeNull()
    expect(screen.queryByText(/Checking with the server/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Send test notification' })).toBeNull()
  })

  it('says it is checking until the server has answered', () => {
    pushStub.subscribed = true
    render(<SettingsView section="notifications" />)
    expect(screen.getByText('Checking with the server…')).toBeTruthy()
  })

  it('shows what the server holds: devices, reminders, and what is next', () => {
    pushStub.subscribed = true
    diagStub.diagnosis = healthy()
    render(<SettingsView section="notifications" />)
    expect(screen.getByRole('status').textContent).toMatch(/1 device · 3 reminders scheduled · next: Standup at /)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows what is wrong as an alert', () => {
    pushStub.subscribed = true
    diagStub.diagnosis = healthy({ devices: [] })
    render(<SettingsView section="notifications" />)
    expect(screen.getByRole('alert').textContent).toMatch(/no device registered/)
  })

  it('says so when the server could not be reached at all', () => {
    pushStub.subscribed = true
    diagStub.diagnosis = false
    render(<SettingsView section="notifications" />)
    expect(screen.getByRole('alert').textContent).toMatch(/could not reach the server/i)
  })

  it('sends a test and toasts the result as a success', async () => {
    pushStub.subscribed = true
    diagStub.diagnosis = healthy()
    diagStub.test.mockResolvedValue(healthy({ test: [ok] }))
    await click('Send test notification')
    expect(diagStub.test).toHaveBeenCalledTimes(1)
    expect(mockPushSuccess).toHaveBeenCalledWith(expect.stringMatching(/test sent to your device/i))
    expect(mockPushError).not.toHaveBeenCalled()
  })

  it.each([
    ['a refusal (403)', { test: [{ host: 'h', ok: false, gone: false, status: 403 }] }, /refused it \(403\)/],
    ['an expired subscription', { test: [{ host: 'h', ok: false, gone: true, status: 410 }] }, /expired/],
    ['no device', { test: [], devices: [] }, /no device registered/],
  ])('toasts the cause when the test hits %s, and never a success', async (_label, patch, message) => {
    pushStub.subscribed = true
    diagStub.diagnosis = healthy()
    diagStub.test.mockResolvedValue(healthy(patch))
    await click('Send test notification')
    expect(mockPushError).toHaveBeenCalledWith(expect.stringMatching(message))
    expect(mockPushSuccess).not.toHaveBeenCalled()
  })

  it('toasts that the server could not be reached when the test gets no answer', async () => {
    pushStub.subscribed = true
    diagStub.diagnosis = healthy()
    diagStub.test.mockResolvedValue(null)
    await click('Send test notification')
    expect(mockPushError).toHaveBeenCalledWith(expect.stringMatching(/could not reach the server/i))
  })

  it('disables the test button and says so while it is sending', () => {
    pushStub.subscribed = true
    diagStub.diagnosis = healthy()
    diagStub.testing = true
    render(<SettingsView section="notifications" />)
    const button = screen.getByRole('button', { name: 'Sending…' })
    expect(button.disabled).toBe(true)
  })

  it('"Check again" asks the server again', async () => {
    pushStub.subscribed = true
    diagStub.diagnosis = healthy()
    await click('Check again')
    expect(diagStub.refresh).toHaveBeenCalledTimes(1)
  })
})

describe('before the email address is confirmed', () => {
  const LINK = 'the link is in the email we sent when you signed up.'
  const PUSH_OFF = `Confirm your email address to turn on push notifications — ${LINK}`
  const PUSH_PAUSED = `Push notifications are paused until you confirm your email address — ${LINK}`
  const DIGEST_OFF = `Confirm your email address to turn on the daily digest — ${LINK}`
  const DIGEST_PAUSED = `The daily digest is paused until you confirm your email address — ${LINK}`

  beforeEach(() => {
    authStub.emailVerified = false
  })

  /** The text of the warning with this id, or null when there isn't one. */
  const warning = (container, id) => container.querySelector(`#${id}`)?.textContent ?? null

  describe('push notifications', () => {
    it('carries its own warning in its own row, and the control is visibly unavailable', () => {
      const { container } = render(<SettingsView section="notifications" />)

      const row = container.querySelector('#verify-push').closest('.settings-row')
      expect(row.querySelector('.settings-row__title').textContent).toBe('Push notifications')
      expect(warning(container, 'verify-push')).toContain(PUSH_OFF)
      // A warning icon, not just words.
      expect(container.querySelector('#verify-push svg')).toBeTruthy()

      const button = screen.getByRole('button', { name: 'Turn on' })
      expect(button.disabled).toBe(true)
      // A screen reader reaching the disabled button hears why.
      expect(button.getAttribute('aria-describedby')).toBe('verify-push')
    })

    it('says "paused" rather than "turn on" when push is already on, and still lets it be turned off', () => {
      pushStub.subscribed = true
      const { container } = render(<SettingsView section="notifications" />)
      expect(warning(container, 'verify-push')).toContain(PUSH_PAUSED)
      expect(screen.getByRole('button', { name: 'Turn off' }).disabled).toBe(false)
    })

    it('does not show the server check when already on — it would only fail, and read as "could not reach the server"', () => {
      pushStub.subscribed = true
      diagStub.diagnosis = false // what a refused request comes back as
      render(<SettingsView section="notifications" />)
      expect(screen.queryByText(/Could not reach the server/)).toBeNull()
      expect(screen.queryByText('Checking with the server…')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Send test notification' })).toBeNull()
    })

    it('does not lead with an email warning in a browser that could not do push anyway', () => {
      pushStub.supported = false
      const { container } = render(<SettingsView section="notifications" />)
      expect(container.querySelector('#verify-push')).toBeNull()
    })
  })

  describe('the daily digest', () => {
    it('carries its own warning in its own row, and the checkbox is visibly unavailable', () => {
      const { container } = render(<SettingsView section="notifications" />)

      const row = container.querySelector('#verify-digest').closest('.settings-row')
      expect(row.querySelector('.settings-row__title').textContent).toBe('Daily digest email')
      expect(warning(container, 'verify-digest')).toContain(DIGEST_OFF)
      expect(container.querySelector('#verify-digest svg')).toBeTruthy()

      const box = screen.getByRole('checkbox', { name: 'Email me a daily digest' })
      expect(box.disabled).toBe(true)
      expect(box.getAttribute('aria-describedby')).toBe('verify-digest')
    })

    it('says "paused" when it is already on, which stays checked and can be switched off', () => {
      scheduleStub.profile = { dailyDigestEnabled: true }
      const { container } = render(<SettingsView section="notifications" />)
      expect(warning(container, 'verify-digest')).toContain(DIGEST_PAUSED)
      const box = screen.getByRole('checkbox', { name: 'Email me a daily digest' })
      expect(box.checked).toBe(true)
      expect(box.disabled).toBe(false)
    })
  })

  it('has a Resend email in each warning, and says it went', async () => {
    render(<SettingsView section="notifications" />)
    const buttons = screen.getAllByRole('button', { name: 'Resend email' })
    expect(buttons).toHaveLength(2)

    await act(async () => {
      fireEvent.click(buttons[0])
    })
    expect(authStub.resendVerification).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Sent — check your inbox, and your spam folder.')).toBeTruthy()
  })

  it('says so when the email could not be sent, and offers the button again', async () => {
    authStub.resendVerification = vi.fn(async () => false)
    render(<SettingsView section="notifications" />)
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Resend email' })[0])
    })
    expect(screen.getByText('Couldn’t send it. Try again in a minute.')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Resend email' })).toHaveLength(2)
  })
})

describe('once the email address is confirmed', () => {
  it('shows none of it — no warning, no Resend, and the controls are back to normal', () => {
    pushStub.subscribed = true
    scheduleStub.profile = { dailyDigestEnabled: true }
    const { container } = render(<SettingsView section="notifications" />)

    expect(container.querySelector('.banner--verify')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Resend email' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Turn off' }).disabled).toBe(false)
    const box = screen.getByRole('checkbox', { name: 'Email me a daily digest' })
    expect(box.disabled).toBe(false)
    expect(box.getAttribute('aria-describedby')).toBeNull()
  })

  it('leaves the digest row exactly as it was: no empty "below" slot adding a gap', () => {
    render(<SettingsView section="notifications" />)
    const box = screen.getByRole('checkbox', { name: 'Email me a daily digest' })
    expect(box.closest('.settings-row').querySelector('.settings-row__below')).toBeNull()
    expect(box.getAttribute('aria-describedby')).toBeNull()
    expect(screen.getByRole('button', { name: 'Turn on' }).getAttribute('aria-describedby')).toBeNull()
  })
})
