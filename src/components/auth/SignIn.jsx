import { useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useTheme } from '../../lib/useTheme.js'
import { LoginForm } from './LoginForm.jsx'
import { RegisterForm } from './RegisterForm.jsx'
import {
  ClockIcon,
  GoogleIcon,
  ThemeDarkIcon,
  ThemeLightIcon,
  ThemeSystemIcon,
  WarningIcon,
} from '../icons.jsx'

const THEME_LABEL = { system: 'System', light: 'Light', dark: 'Dark' }
const THEME_ICON = { system: ThemeSystemIcon, light: ThemeLightIcon, dark: ThemeDarkIcon }

/** A two-column entry screen — brand and pitch on the left, the actual form
    on the right — built entirely from lines, not boxes: a top bar rules off
    the brand and theme toggle, a single hairline divides the two columns,
    and a drawn cross marks each corner of the content frame. No panel ever
    gets a fill color of its own; every color comes from the same neutral
    tokens as the rest of the app, so this screen follows the light/dark
    toggle instead of carrying a fixed palette. */
export function SignIn() {
  const { signIn, error, clearError } = useAuth()
  const { theme, cycleTheme } = useTheme()
  const [mode, setMode] = useState('login')
  const isRegister = mode === 'register'
  const ThemeIcon = THEME_ICON[theme]

  function switchTo(nextMode) {
    clearError()
    setMode(nextMode)
  }

  return (
    <div className="auth-shell">
      <header className="auth-topbar">
        <div className="auth-topbar__brand">
          <ClockIcon className="auth-hero__mark" />
          <span className="auth-hero__name">Cadence</span>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={cycleTheme}
          aria-label={`Theme: ${THEME_LABEL[theme]}. Click to change.`}
          title={`Theme: ${THEME_LABEL[theme]}`}
        >
          <ThemeIcon />
        </button>
      </header>

      <div className="auth-body">
        <span className="auth-tick auth-tick--tl" aria-hidden="true" />
        <span className="auth-tick auth-tick--tr" aria-hidden="true" />
        <span className="auth-tick auth-tick--bl" aria-hidden="true" />
        <span className="auth-tick auth-tick--br" aria-hidden="true" />

        <div className="auth-hero">
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
    </div>
  )
}
