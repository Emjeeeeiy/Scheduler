import { useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { PasswordField } from './PasswordField.jsx'
import { DISPLAY_NAME_MAX } from '../../firebase.js'

const PASSWORD_MIN = 8

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
    if (password.length < PASSWORD_MIN) {
      reportError(`Password must be at least ${PASSWORD_MIN} characters.`)
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
        <span className="field__label">Display name</span>
        <input
          className="input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="nickname"
          placeholder="Your name"
          maxLength={DISPLAY_NAME_MAX}
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
          You sign in with this. We’ll send a link to confirm it — never shown to anyone
          else.
        </span>
      </label>

      <div className="field-row">
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
        />

        <PasswordField
          label="Confirm password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
        />
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
