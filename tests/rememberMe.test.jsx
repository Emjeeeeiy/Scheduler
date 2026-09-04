import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginForm } from '../src/components/auth/LoginForm.jsx'

const mockSignInWithPassword = vi.fn()

vi.mock('../src/state/AuthContext.jsx', () => ({
  useAuth: () => ({
    signInWithPassword: mockSignInWithPassword,
  }),
}))

describe('LoginForm - Remember me', () => {
  beforeEach(() => {
    localStorage.clear()
    mockSignInWithPassword.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders a "Remember me" checkbox that defaults to checked', () => {
    render(<LoginForm onSwitchToRegister={vi.fn()} onForgotPassword={vi.fn()} />)
    const checkbox = screen.getByRole('checkbox', { name: /remember me/i })
    expect(checkbox).toBeDefined()
    expect(checkbox.checked).toBe(true)
  })

  it('updates state and localStorage when toggling the checkbox', () => {
    render(<LoginForm onSwitchToRegister={vi.fn()} onForgotPassword={vi.fn()} />)
    const checkbox = screen.getByRole('checkbox', { name: /remember me/i })

    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(false)
    expect(localStorage.getItem('cadence:remember_me')).toBe('false')

    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)
    expect(localStorage.getItem('cadence:remember_me')).toBe('true')
  })

  it('initializes from localStorage if user previously unchecked Remember me', () => {
    localStorage.setItem('cadence:remember_me', 'false')
    render(<LoginForm onSwitchToRegister={vi.fn()} onForgotPassword={vi.fn()} />)
    const checkbox = screen.getByRole('checkbox', { name: /remember me/i })
    expect(checkbox.checked).toBe(false)
  })

  it('passes rememberMe: true to signInWithPassword on form submit when checked', async () => {
    render(<LoginForm onSwitchToRegister={vi.fn()} onForgotPassword={vi.fn()} />)
    const usernameInput = screen.getByPlaceholderText('yourname')
    const passwordInput = screen.getByLabelText('Password')
    const submitButton = screen.getByRole('button', { name: /log in/i })

    fireEvent.change(usernameInput, { target: { value: 'alice' } })
    fireEvent.change(passwordInput, { target: { value: 'secret123' } })
    fireEvent.click(submitButton)

    expect(mockSignInWithPassword).toHaveBeenCalledTimes(1)
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      identifier: 'alice',
      password: 'secret123',
      rememberMe: true,
    })
  })

  it('passes rememberMe: false to signInWithPassword on form submit when unchecked', async () => {
    render(<LoginForm onSwitchToRegister={vi.fn()} onForgotPassword={vi.fn()} />)
    const usernameInput = screen.getByPlaceholderText('yourname')
    const passwordInput = screen.getByLabelText('Password')
    const checkbox = screen.getByRole('checkbox', { name: /remember me/i })
    const submitButton = screen.getByRole('button', { name: /log in/i })

    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(false)

    fireEvent.change(usernameInput, { target: { value: 'bob' } })
    fireEvent.change(passwordInput, { target: { value: 'secret456' } })
    fireEvent.click(submitButton)

    expect(mockSignInWithPassword).toHaveBeenCalledTimes(1)
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      identifier: 'bob',
      password: 'secret456',
      rememberMe: false,
    })
  })
})
