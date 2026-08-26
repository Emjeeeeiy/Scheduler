import { useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { PasswordField } from './PasswordField.jsx'

export function LoginForm({ onSwitchToRegister }) {
  const { signInWithPassword } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(event) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await signInWithPassword({ identifier, password })
    } finally {
      setSubmitting(false)
    }
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
      </label>

      <PasswordField
        label="Password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
      />

      <button type="submit" className="primary-button primary-button--lg" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Log in'}
      </button>

      <p className="auth-form__switch">
        No account yet?{' '}
        <button type="button" className="link-button" onClick={onSwitchToRegister}>
          Create one
        </button>
      </p>
    </form>
  )
}
