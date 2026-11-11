import { useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { PasswordField } from './PasswordField.jsx'
import { REMEMBER_ME_KEY, rememberMeChoice } from '../../lib/sessionHint.js'

export function LoginForm({ onSwitchToRegister, onForgotPassword }) {
  const { signInWithPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(rememberMeChoice)
  const [submitting, setSubmitting] = useState(false)

  function onToggleRememberMe(e) {
    const nextValue = e.target.checked
    setRememberMe(nextValue)
    try {
      localStorage.setItem(REMEMBER_ME_KEY, String(nextValue))
    } catch {
      // storage may be restricted in private browsing
    }
  }

  async function onSubmit(event) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await signInWithPassword({ email, password, rememberMe })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={onSubmit}>
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
