/* The push toggle's feedback contract: every toast must describe the
 * operation that actually ran. The click handler used to read push.denied /
 * push.error from the pre-click render after awaiting enable(), so a
 * dismissal could toast as a failure and a failure as a dismissal depending
 * on whatever a previous attempt left behind. These pin the toast to the
 * enable()/disable() result instead — including cases seeded with stale
 * error state that would have misled the old reads.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { pushStub, mockPushSuccess, mockPushError } = vi.hoisted(() => ({
  pushStub: {
    supported: true,
    subscribed: false,
    denied: false,
    busy: false,
    error: null,
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

import { SettingsModal } from '../src/components/shell/SettingsModal.jsx'

function resetPushStub() {
  pushStub.supported = true
  pushStub.subscribed = false
  pushStub.denied = false
  pushStub.busy = false
  pushStub.error = null
  pushStub.enable.mockReset()
  pushStub.disable.mockReset()
}

beforeEach(() => {
  resetPushStub()
  mockPushSuccess.mockClear()
  mockPushError.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function clickPushButton(name) {
  render(<SettingsModal onClose={vi.fn()} />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

describe('SettingsModal push toggle feedback', () => {
  it('Turn on + success toasts turned-on and calls enable, not disable', async () => {
    pushStub.enable.mockResolvedValue({ ok: true })
    await clickPushButton('Turn on')
    expect(pushStub.enable).toHaveBeenCalledTimes(1)
    expect(pushStub.disable).not.toHaveBeenCalled()
    expect(mockPushSuccess).toHaveBeenCalledWith('Push notifications turned on for this device.')
    expect(mockPushError).not.toHaveBeenCalled()
  })

  it('Turn on + denied toasts blocked even with a stale error in state', async () => {
    pushStub.error = new Error('stale from an earlier attempt')
    pushStub.enable.mockResolvedValue({ ok: false, reason: 'denied' })
    await clickPushButton('Turn on')
    expect(mockPushError).toHaveBeenCalledWith(
      "Notifications are blocked — allow them in your browser site settings, then reload.",
    )
    expect(mockPushSuccess).not.toHaveBeenCalled()
  })

  it('Turn on + dismissed toasts not-allowed even with a stale error in state', async () => {
    pushStub.error = new Error('stale from an earlier attempt')
    pushStub.enable.mockResolvedValue({ ok: false, reason: 'dismissed' })
    await clickPushButton('Turn on')
    expect(mockPushError).toHaveBeenCalledWith('Notifications were not allowed for this site.')
    expect(mockPushSuccess).not.toHaveBeenCalled()
  })

  it('Turn on + error toasts could-not-turn-on even with no error in state', async () => {
    pushStub.error = null
    pushStub.enable.mockResolvedValue({ ok: false, reason: 'error' })
    await clickPushButton('Turn on')
    expect(mockPushError).toHaveBeenCalledWith('Could not turn on push notifications. Try again.')
    expect(mockPushSuccess).not.toHaveBeenCalled()
  })

  it('Turn off + success toasts turned-off and calls disable, not enable', async () => {
    pushStub.subscribed = true
    pushStub.disable.mockResolvedValue(true)
    await clickPushButton('Turn off')
    expect(pushStub.disable).toHaveBeenCalledTimes(1)
    expect(pushStub.enable).not.toHaveBeenCalled()
    expect(mockPushSuccess).toHaveBeenCalledWith('Push notifications turned off for this device.')
    expect(mockPushError).not.toHaveBeenCalled()
  })

  it('Turn off + failure toasts could-not-turn-off', async () => {
    pushStub.subscribed = true
    pushStub.disable.mockResolvedValue(false)
    await clickPushButton('Turn off')
    expect(mockPushError).toHaveBeenCalledWith('Could not turn off push notifications. Try again.')
    expect(mockPushSuccess).not.toHaveBeenCalled()
  })
})
