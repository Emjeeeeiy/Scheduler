import { useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'

export function ForgotPasswordForm({ onSwitchToLogin }) {
  const { resetPassword, clearError } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    if (submitting) return
    clearError()
    setSubmitting(true)
    try {
      const ok = await resetPassword(identifier)
      if (ok) setSent(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <div className="auth-form">
        <p className="field__hint">
          If an account matches “{identifier}”, a password reset link is on its way — check your
          inbox (and spam folder).
        </p>
        <button
          type="button"
          className="ghost-button ghost-button--block"
          onClick={onSwitchToLogin}
        >
          Back to log in
        </button>
      </div>
    )
  }

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      <label className="field">
        <span className="field__label">Username or email</span>
        <input
          className="input"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          placeholder="yourname"
          required
        />
        <span className="field__hint">We’ll email a reset link if that account exists.</span>
      </label>

      <button type="submit" className="primary-button primary-button--lg" disabled={submitting}>
        {submitting ? 'Sending…' : 'Send reset link'}
      </button>

      <p className="auth-form__switch">
        <button type="button" className="link-button" onClick={onSwitchToLogin}>
          Back to log in
        </button>
      </p>
    </form>
  )
}
