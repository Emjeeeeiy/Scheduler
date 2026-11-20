/* On a phone the sign-in form opens with Log in | Sign up as a switch at its top,
 * where a thumb starts, instead of a link under every field. The same forms serve
 * a desktop — which keeps its link and does not draw the row — so what is pinned
 * here is the row and what it switches: which tab is on, that choosing one swaps
 * the form, that it clears a stale error as the link did, and that the password
 * reset screen (which has its own way back) is not given one.
 *
 * Whether the row or the foot link is DRAWN is the stylesheet's, keyed off
 * `data-tabs` (checked by eye); that attribute is pinned, since it is what stops
 * the reset screen losing its only link.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ clearError: vi.fn() }))

vi.mock('../src/lib/usePushNotifications.js', () => ({
  usePushNotifications: () => ({ supported: false, subscribed: false, busy: false, disable: vi.fn() }),
}))
vi.mock('../src/state/AuthContext.jsx', () => ({
  useAuth: () => ({
    signIn: vi.fn(),
    signInWithPassword: vi.fn(),
    register: vi.fn(),
    requestPasswordReset: vi.fn(),
    error: null,
    clearError: auth.clearError,
  }),
}))

import { SignIn } from '../src/components/auth/SignIn.jsx'

beforeEach(() => auth.clearError.mockClear())
afterEach(cleanup)

const tabs = () => screen.getAllByRole('tab')
const inner = (container) => container.querySelector('.auth-panel__inner')

describe('Log in | Sign up', () => {
  it('is two tabs at the top of the form, opening on Log in', () => {
    render(<SignIn />)
    expect(screen.getByRole('tablist', { name: 'Account' })).toBeTruthy()
    expect(tabs().map((tab) => tab.textContent)).toEqual(['Log in', 'Sign up'])
    expect(screen.getByRole('tab', { name: 'Log in' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Forgot password?')).toBeTruthy()
  })

  it('swaps the form for the sign-up one, and back', () => {
    render(<SignIn />)
    fireEvent.click(screen.getByRole('tab', { name: 'Sign up' }))
    expect(screen.getByRole('tab', { name: 'Sign up' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByLabelText('Confirm password')).toBeTruthy()
    expect(screen.queryByText('Forgot password?')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'Log in' }))
    expect(screen.getByRole('tab', { name: 'Log in' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Forgot password?')).toBeTruthy()
  })

  // Regression guard: the link it stands in for cleared the last error before
  // showing the other form, so a failed log in does not follow you to sign up.
  it('clears a stale error when it switches, as the link did', () => {
    render(<SignIn />)
    fireEvent.click(screen.getByRole('tab', { name: 'Sign up' }))
    expect(auth.clearError).toHaveBeenCalledTimes(1)
  })

  it('moves between its tabs with the arrow keys', () => {
    render(<SignIn />)
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Log in' }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Sign up' }).getAttribute('aria-selected')).toBe('true')
  })

  it('has no ids or aria-controls pointing at panes that do not exist', () => {
    render(<SignIn />)
    for (const tab of tabs()) {
      expect(tab.getAttribute('aria-controls')).toBeNull()
      expect(tab.id).toBe('')
    }
  })

  it('still offers the link at the foot of each form, for a desktop that has no tab row', () => {
    render(<SignIn />)
    expect(screen.getByRole('button', { name: 'Create one' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Sign up' }))
    expect(screen.getByRole('button', { name: 'Log in' })).toBeTruthy()
  })
})

describe('the password reset screen', () => {
  const toReset = () => fireEvent.click(screen.getByText('Forgot password?'))

  it('has no tab row: it has its own way back', () => {
    render(<SignIn />)
    toReset()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Reset your password' })).toBeTruthy()
  })

  // Regression guard: the stylesheet hides the foot link only where the tab row is
  // drawn. If the reset screen carried the marker it would lose its link and have
  // nothing in its place.
  it('does not carry the marker that hides the link at its foot', () => {
    const { container } = render(<SignIn />)
    expect(inner(container).dataset.tabs).toBe('true')
    toReset()
    expect(inner(container).dataset.tabs).toBeUndefined()
    expect(container.querySelector('.auth-form__switch')).toBeTruthy()
  })
})
