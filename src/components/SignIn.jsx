import { useState } from 'react'
import { useAuth } from '../state/AuthContext.jsx'
import { LoginForm } from './LoginForm.jsx'
import { RegisterForm } from './RegisterForm.jsx'
import { ClockIcon, WarningIcon } from './icons.jsx'

export function SignIn() {
  const { signIn, error, clearError } = useAuth()
  const [mode, setMode] = useState('login')

  function switchTo(nextMode) {
    clearError()
    setMode(nextMode)
  }

  return (
    <div className="centered">
      <div className="signin card">
        <ClockIcon className="signin__mark" />
        <h1 className="signin__title">Cadence</h1>
        <p className="signin__lead">
          Plan your days in blocks, keep the loose ends in one inbox, and see where the hours
          actually went.
        </p>

        <button type="button" className="primary-button primary-button--lg" onClick={signIn}>
          Sign in with Google
        </button>

        <div className="auth-divider" role="presentation">
          <span>or</span>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Sign in or create an account">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`auth-tab${mode === 'login' ? ' auth-tab--active' : ''}`}
            onClick={() => switchTo('login')}
          >
            Log in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={`auth-tab${mode === 'register' ? ' auth-tab--active' : ''}`}
            onClick={() => switchTo('register')}
          >
            Create account
          </button>
        </div>

        {mode === 'login' ? (
          <LoginForm onSwitchToRegister={() => switchTo('register')} />
        ) : (
          <RegisterForm onSwitchToLogin={() => switchTo('login')} />
        )}

        {error && (
          <p className="banner banner--error" role="alert">
            <WarningIcon className="banner__icon" /> {error}
          </p>
        )}

        <p className="signin__note">Your schedule is private to your account.</p>
      </div>
    </div>
  )
}
