import { useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { LoginForm } from './LoginForm.jsx'
import { RegisterForm } from './RegisterForm.jsx'
import { ClockIcon, GoogleIcon, WarningIcon } from '../icons.jsx'

/** A fixed, always-dark two-column entry screen — brand and pitch on the
    left, the actual form on the right. Deliberately not theme-reactive: this
    is the one branded moment before the app's own light/dark toggle exists
    to the visitor at all, so it keeps its own look regardless of that later
    choice, the way a product's marketing surface usually does. */
export function SignIn() {
  const { signIn, error, clearError } = useAuth()
  const [mode, setMode] = useState('login')
  const isRegister = mode === 'register'

  function switchTo(nextMode) {
    clearError()
    setMode(nextMode)
  }

  return (
    <div className="auth-shell">
      <div className="auth-hero">
        <div className="auth-hero__brand">
          <ClockIcon className="auth-hero__mark" />
          <span className="auth-hero__name">Cadence</span>
        </div>
        <div className="auth-hero__copy">
          <h1 className="auth-hero__title">Plan your day in blocks.</h1>
          <p className="auth-hero__lead">
            Capture what needs doing, give it a real slot on your calendar, and see afterward
            exactly where the hours went.
          </p>
        </div>
      </div>

      <div className="auth-panel">
        <div className="auth-panel__inner">
          <div className="auth-panel__head">
            <h2 className="auth-panel__title">{isRegister ? 'Sign up' : 'Log in'}</h2>
            <p className="auth-panel__lead">
              {isRegister
                ? 'Enter your details to create your account.'
                : 'Enter your details to access your account.'}
            </p>
          </div>

          <button type="button" className="google-button" onClick={signIn}>
            <GoogleIcon /> Sign in with Google
          </button>

          <div className="auth-divider" role="presentation">
            <span>or</span>
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

          <p className="auth-panel__note">Your schedule is private to your account.</p>
        </div>
      </div>
    </div>
  )
}
