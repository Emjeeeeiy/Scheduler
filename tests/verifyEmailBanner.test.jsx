/* The app-wide "confirm your email address" banner. It states the fact for every
 * feature at once; each feature also carries its own warning (VerifyNotice,
 * covered where each lives). What is proven here: it appears only for an
 * unconfirmed account, it can resend the email and say whether that worked
 * (including when Firebase throttles it, which used to look like a dead button),
 * and it can re-check a confirmation made somewhere else.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VerifyEmailBanner } from '../src/components/shell/VerifyEmailBanner.jsx'

const auth = {
  user: { uid: 'u1', email: 'sam@example.com' },
  emailVerified: false,
  resendVerification: vi.fn(),
  checkVerification: vi.fn(),
}

vi.mock('../src/state/AuthContext.jsx', () => ({ useAuth: () => auth }))

beforeEach(() => {
  auth.user = { uid: 'u1', email: 'sam@example.com' }
  auth.emailVerified = false
  auth.resendVerification = vi.fn(async () => true)
  auth.checkVerification = vi.fn(async () => false)
})

const click = (name) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })

describe('VerifyEmailBanner', () => {
  it('says which features wait, with a warning icon, and offers both actions', () => {
    const { container } = render(<VerifyEmailBanner />)
    expect(
      screen.getByText('Confirm your email address to turn on AI suggestions, push reminders and the daily digest.'),
    ).toBeTruthy()
    expect(container.querySelector('svg')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Resend email' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'I’ve confirmed it' })).toBeTruthy()
  })

  it('renders nothing for a confirmed account, or when signed out', () => {
    auth.emailVerified = true
    const confirmed = render(<VerifyEmailBanner />)
    expect(confirmed.container.firstChild).toBeNull()
    confirmed.unmount()

    auth.emailVerified = false
    auth.user = null
    const signedOut = render(<VerifyEmailBanner />)
    expect(signedOut.container.firstChild).toBeNull()
  })

  it('says where the email went once it is sent', async () => {
    render(<VerifyEmailBanner />)
    await click('Resend email')
    expect(auth.resendVerification).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Sent — check sam@example.com (and spam), then come back here.')).toBeTruthy()
  })

  it('says so when it could not be sent — a throttled resend must not look like a dead button', async () => {
    auth.resendVerification = vi.fn(async () => false)
    render(<VerifyEmailBanner />)
    await click('Resend email')
    expect(screen.getByText('Couldn’t send it. Try again in a minute.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Resend email' }).disabled).toBe(false)
  })

  it('re-checks a confirmation made elsewhere, and says when it is not there yet', async () => {
    render(<VerifyEmailBanner />)
    await click('I’ve confirmed it')
    expect(auth.checkVerification).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Not confirmed yet. Open the link in the email, then try again.')).toBeTruthy()
  })
})
