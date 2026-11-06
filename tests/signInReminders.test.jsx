/* The sign-in screen's “reminders are still on” notice. Signing out leaves
 * this device's push subscription in place on purpose — that's how reminders
 * keep arriving while logged out — which is only defensible if the way to stop
 * them is on the screen you land on after signing out, usable without logging
 * in again.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { pushStub } = vi.hoisted(() => ({
  pushStub: { supported: true, subscribed: false, busy: false, disable: vi.fn() },
}))

vi.mock('../src/lib/usePushNotifications.js', () => ({
  usePushNotifications: () => pushStub,
}))

vi.mock('../src/state/AuthContext.jsx', () => ({
  useAuth: () => ({
    signIn: vi.fn(),
    signInWithPassword: vi.fn(),
    error: null,
    clearError: vi.fn(),
  }),
}))

import { SignIn } from '../src/components/auth/SignIn.jsx'

beforeEach(() => {
  Object.assign(pushStub, { supported: true, subscribed: false, busy: false })
  pushStub.disable.mockReset()
})

describe('SignIn — reminders after logging out', () => {
  it('says nothing when this device has no reminders on', () => {
    render(<SignIn />)
    expect(screen.queryByText(/Reminders are still on/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Turn off' })).toBeNull()
  })

  it('says reminders are still on, with a way to turn them off', () => {
    pushStub.subscribed = true
    render(<SignIn />)
    expect(screen.getByText(/Reminders are still on for this device/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Turn off' })).toBeTruthy()
  })

  it('turns them off without a login, and confirms it', async () => {
    pushStub.subscribed = true
    pushStub.disable.mockImplementation(async () => {
      pushStub.subscribed = false
      return true
    })
    const { rerender } = render(<SignIn />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Turn off' }))
    })
    rerender(<SignIn />)

    expect(pushStub.disable).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Turn off' })).toBeNull()
    expect(screen.getByText('Reminders are off for this device.')).toBeTruthy()
  })

  it('keeps the notice, and does not claim success, if turning them off failed', async () => {
    pushStub.subscribed = true
    pushStub.disable.mockResolvedValue(false)
    render(<SignIn />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Turn off' }))
    })

    expect(screen.getByText(/Reminders are still on for this device/)).toBeTruthy()
    expect(screen.queryByText('Reminders are off for this device.')).toBeNull()
  })

  it('disables the button while it works', () => {
    pushStub.subscribed = true
    pushStub.busy = true
    render(<SignIn />)
    expect(screen.getByRole('button', { name: 'Turn off' }).disabled).toBe(true)
  })
})
