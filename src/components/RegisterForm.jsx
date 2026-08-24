import { useState } from 'react'
import { useAuth } from '../state/AuthContext.jsx'

export function RegisterForm({ onSwitchToLogin }) {
  const { register, reportError, clearError } = useAuth()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    if (submitting) return
    clearError()

    if (password !== confirmPassword) {
      reportError("Passwords don't match.")
      return
    }
    if (password.length < 6) {
      reportError('Password must be at least 6 characters.')
      return
    }

    setSubmitting(true)
    try {
      await register({ username, email, password })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      <label className="field">
        <span className="field__label">Username</span>
        <input
          className="input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          placeholder="yourname"
          required
        />
      </label>

      <label className="field">
        <span className="field__label">Email</span>
        <input
          type="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          required
        />
        <span className="field__hint">
          Used to sign you in behind the scenes and to recover the account — never shown to
          anyone else.
        </span>
      </label>

      <div className="field-row">
        <label className="field">
          <span className="field__label">Password</span>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </label>

        <label className="field">
          <span className="field__label">Confirm password</span>
          <input
            type="password"
            className="input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
        </label>
      </div>

      <button type="submit" className="primary-button primary-button--lg" disabled={submitting}>
        {submitting ? 'Creating account…' : 'Create account'}
      </button>

      <p className="auth-form__switch">
        Already have an account?{' '}
        <button type="button" className="link-button" onClick={onSwitchToLogin}>
          Log in
        </button>
      </p>
    </form>
  )
}
