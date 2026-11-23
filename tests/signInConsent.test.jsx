/* The agreement belongs to registration alone, and sits at the foot of that
 * form under the two password fields. What is worth pinning here:
 *
 * - an unticked box blocks account creation, including a submit by Enter from
 *   inside a field, and reports why;
 * - the accepted version is passed down with the registration;
 * - Google sign-in and password login keep working with no checkbox at all;
 * - the two documents open as real dialogs without also dismissing the form.
 *
 * The dot swap is stubbed to "cannot run" so the form appears at once; focus
 * and Escape behaviour are the hook's own, and are tested for real here.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  signIn: vi.fn(),
  signInWithPassword: vi.fn(),
  register: vi.fn(),
  reportError: vi.fn(),
  clearError: vi.fn(),
  error: null,
}))

vi.mock('../src/lib/usePushNotifications.js', () => ({
  usePushNotifications: () => ({
    supported: true,
    subscribed: false,
    busy: false,
    disable: vi.fn(async () => true),
  }),
}))
vi.mock('../src/state/AuthContext.jsx', () => ({
  useAuth: () => ({
    signIn: auth.signIn,
    signInWithPassword: auth.signInWithPassword,
    register: auth.register,
    requestPasswordReset: vi.fn(),
    reportError: auth.reportError,
    clearError: auth.clearError,
    error: auth.error,
  }),
}))
vi.mock('../src/components/shell/DotField.jsx', () => ({
  DotField: () => <canvas className="dot-field" aria-hidden="true" />,
}))
const dots = vi.hoisted(() => ({ start: vi.fn(() => null), cancel: vi.fn() }))
vi.mock('../src/lib/dotMorphRun.js', () => ({ startDotMorph: (options) => dots.start(options) }))

import { SignIn } from '../src/components/auth/SignIn.jsx'
import { TERMS_VERSION } from '../src/lib/legalContent.js'

beforeEach(() => {
  auth.signIn.mockReset()
  auth.signInWithPassword.mockReset()
  auth.register.mockReset()
  auth.reportError.mockReset()
  auth.clearError.mockReset()
  auth.error = null
  dots.start.mockReset()
  dots.start.mockImplementation(() => null)
  dots.cancel.mockReset()
})
afterEach(() => {
  cleanup()
  delete window.matchMedia
})

async function openRegister() {
  const view = render(<SignIn />)
  fireEvent.click(screen.getByRole('button', { name: 'Get started' }))
  await waitFor(() =>
    expect(view.container.querySelector('.auth-shell').getAttribute('data-view')).toBe('form'),
  )
  return view.container
}

function fillRegisterForm(container) {
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Ada' } })
  fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'ada@example.com' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'password123' } })
  return container.querySelector('.auth-form')
}

describe('the registration agreement', () => {
  it('sits under the password fields and blocks registration while unticked', async () => {
    const container = await openRegister()
    const box = screen.getByRole('checkbox', { name: /i agree to the terms of service/i })
    const inputs = [...container.querySelectorAll('.auth-form input')]
    expect(inputs[inputs.length - 1]).toBe(box)
    expect(box.checked).toBe(false)
    // Google sign-in is not gated by a checkbox that is not in its form.
    expect(screen.getByRole('button', { name: /sign in with google/i }).disabled).toBe(false)

    fireEvent.submit(fillRegisterForm(container))
    expect(auth.reportError).toHaveBeenCalledWith(
      'Please agree to the Terms of Service and Privacy Policy.',
    )
    expect(auth.register).not.toHaveBeenCalled()
  })

  it('passes the accepted version through when the box is ticked', async () => {
    const container = await openRegister()
    fireEvent.click(screen.getByRole('checkbox', { name: /i agree to the terms of service/i }))
    fireEvent.submit(fillRegisterForm(container))
    expect(auth.register).toHaveBeenCalledWith(
      expect.objectContaining({ termsAccepted: true, termsVersion: TERMS_VERSION }),
    )
  })

  it('leaves Google sign-in and password login with no agreement fields', async () => {
    const container = await openRegister()
    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }))
    expect(auth.signIn).toHaveBeenCalledTimes(1)
    expect(auth.signIn.mock.calls[0][0]).not.toHaveProperty('termsAccepted')

    fireEvent.click(screen.getByRole('tab', { name: 'Log in' }))
    expect(container.querySelector('.auth-consent')).toBeNull()
    fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'ada@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.submit(container.querySelector('.auth-form'))
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'password123',
      rememberMe: true,
    })
  })

  it('opens the right document from each link and closes only the dialog on Escape', async () => {
    const container = await openRegister()
    const before = document.activeElement
    const link = screen.getByRole('button', { name: 'Terms of Service' })
    fireEvent.click(link)

    const dialog = await screen.findByRole('dialog', { name: 'Terms of Service' })
    expect(within(dialog).getByRole('heading', { name: 'Your account' })).toBeTruthy()
    expect(within(dialog).getByText(/firebase firestore/i)).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(container.querySelector('.auth-shell').getAttribute('data-view')).toBe('form')
    expect(document.activeElement).toBe(before)
    expect(link).toBeTruthy()
  })

  it('reaches the Privacy Policy from the form foot and cross-links the two documents', async () => {
    await openRegister()
    const links = screen.getAllByRole('button', { name: 'Privacy Policy' })
    fireEvent.click(links[links.length - 1])

    const privacy = await screen.findByRole('dialog', { name: 'Privacy Policy' })
    expect(within(privacy).getByRole('heading', { name: 'Where it lives' })).toBeTruthy()

    fireEvent.click(within(privacy).getByRole('button', { name: 'Read the Terms of Service' }))
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Terms of Service' })).toBeTruthy(),
    )
  })

  it('styles the checkbox with the accent and the links with the accent text token', () => {
    const authCss = readFileSync(resolve('src/styles/auth.css'), 'utf8')
    const modalCss = readFileSync(resolve('src/styles/modals.css'), 'utf8')
    expect(authCss).toMatch(/\.auth-consent input\s*\{/)
    expect(modalCss).toMatch(/\.checkbox-row input\s*\{[^}]*accent-color:\s*var\(--color-accent\)/)
    expect(authCss).toMatch(/\.link-button\s*\{[^}]*color:\s*var\(--color-accent-text\)/)
  })
})
