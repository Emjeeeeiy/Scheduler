import { useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { PasswordField } from './PasswordField.jsx'

const REMEMBER_ME_STORAGE_KEY = 'cadence:remember_me'

export function LoginForm({ onSwitchToRegister, onForgotPassword }) {
  const { signInWithPassword } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(() => {
    try {
      const stored = localStorage.getItem(REMEMBER_ME_STORAGE_KEY)
      return stored !== null ? stored === 'true' : true
    } catch {
      return true
    }
  })
  const [submitting, setSubmitting] = useState(false)

  function onToggleRememberMe(e) {
    const nextValue = e.target.checked
    setRememberMe(nextValue)
    try {
      localStorage.setItem(REMEMBER_ME_STORAGE_KEY, String(nextValue))
    } catch {
      // storage may be restricted in private browsing
    }
  }

  async function onSubmit(event) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await signInWithPassword({ identifier, password, rememberMe })
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

      <div className="auth-form__options">
        <label className="checkbox-row auth-form__remember" htmlFor="remember-me">
          <input
            id="remember-me"
            name="rememberMe"
            type="checkbox"
            checked={rememberMe}
            onChange={onToggleRememberMe}
          />
          <span>Remember me</span>
        </label>

        <button type="button" className="link-button auth-form__forgot" onClick={onForgotPassword}>
          Forgot password?
        </button>
      </div>

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
