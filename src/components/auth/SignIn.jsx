import { useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useTheme } from '../../lib/useTheme.js'
import { FrameTicks } from '../shell/FrameTicks.jsx'
import { LoginForm } from './LoginForm.jsx'
import { RegisterForm } from './RegisterForm.jsx'
import { ForgotPasswordForm } from './ForgotPasswordForm.jsx'
import {
  ClockIcon,
  GoogleIcon,
  ListIcon,
  ThemeDarkIcon,
  ThemeLightIcon,
  ThemeSystemIcon,
  TrendIcon,
  WarningIcon,
} from '../icons.jsx'

const HOW_IT_WORKS = [
  { icon: ListIcon, term: 'Capture', detail: 'what needs doing' },
  { icon: ClockIcon, term: 'Schedule', detail: 'a real time slot' },
  { icon: TrendIcon, term: 'Review', detail: 'where the hours went' },
]

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
  const isForgot = mode === 'forgot'
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
        <FrameTicks />

        <div className="auth-hero">
          <div className="auth-hero__grid">
            <span className="auth-hero__hatch auth-hero__hatch--l" aria-hidden="true" />
            <span className="auth-hero__hatch auth-hero__hatch--r" aria-hidden="true" />
            <span className="auth-hero__vline auth-hero__vline--l" aria-hidden="true" />
            <span className="auth-hero__vline auth-hero__vline--r" aria-hidden="true" />

            <div className="auth-hero__row">
              <h1 className="auth-hero__title">Plan your day in blocks.</h1>
            </div>

            <div className="auth-hero__row">
              <p className="auth-hero__lead">
                Capture what needs doing, give it a real slot on your calendar, and see afterward
                exactly where the hours went.
              </p>
            </div>

            <div className="auth-hero__row auth-hero__preview-row">
              <div className="auth-hero__preview">
                <p className="auth-hero__preview-text">Tasks &amp; time blocks, one calendar</p>
                <img
                  src="/black-calendar.jpg"
                  alt="A physical desk calendar, open to January"
                  className="auth-hero__preview-img"
                />
              </div>
            </div>

            <div className="auth-hero__row auth-hero__row--last">
              <ul className="auth-hero__stats">
                {HOW_IT_WORKS.map(({ icon: StepIcon, term, detail }) => (
                  <li className="auth-hero__stat" key={term}>
                    <StepIcon className="auth-hero__stat-icon" />
                    <strong className="auth-hero__stat-term">{term}</strong>
                    <span className="auth-hero__stat-detail">{detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="auth-panel">
          <div className="auth-panel__inner">
            <div className="auth-panel__head">
              <h2 className="auth-panel__title">
                {isForgot ? 'Reset your password' : isRegister ? 'Sign up' : 'Log in'}
              </h2>
              <p className="auth-panel__lead">
                {isForgot
                  ? 'Enter the username or email on your account.'
                  : isRegister
                    ? 'Enter your details to create your account.'
                    : 'Enter your details to access your account.'}
              </p>
            </div>

            {/* A password reset has nothing to do with Google's own sign-in,
                which never has a password to reset — so this and the divider
                below only make sense on the two forms that do use one. */}
            {!isForgot && (
              <>
                <button type="button" className="google-button" onClick={signIn}>
                  <GoogleIcon /> Sign in with Google
                </button>

                <div className="auth-divider" role="presentation">
                  <span>or</span>
                </div>
              </>
            )}

            {mode === 'login' && (
              <LoginForm
                onSwitchToRegister={() => switchTo('register')}
                onForgotPassword={() => switchTo('forgot')}
              />
            )}
            {mode === 'register' && <RegisterForm onSwitchToLogin={() => switchTo('login')} />}
            {mode === 'forgot' && <ForgotPasswordForm onSwitchToLogin={() => switchTo('login')} />}

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
