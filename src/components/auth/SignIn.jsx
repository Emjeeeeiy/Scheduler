import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { usePushNotifications } from '../../lib/usePushNotifications.js'
import { startDotMorph } from '../../lib/dotMorphRun.js'
import { LoginForm } from './LoginForm.jsx'
import { RegisterForm } from './RegisterForm.jsx'
import { ForgotPasswordForm } from './ForgotPasswordForm.jsx'
import { LegalModal } from './LegalModal.jsx'
import { rememberMeChoice } from '../../lib/sessionHint.js'
import { DotField } from '../shell/DotField.jsx'
import { PaneTabs } from '../shell/PaneTabs.jsx'
import { ClockIcon, GoogleIcon, Icon, WarningIcon } from '../icons.jsx'

/* A squarish "o", for the headline's "flow": a rounded square outlined in the same
   stroke grammar as the app's icons, on the same footprint as the clock mark in
   "your" so the two sit on the line alike. A letter, not an icon, so it lives here. */
function BoxO(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5.5" />
    </Icon>
  )
}

/** The entry screen. On a desktop it is one centred stage over the dot field: a
    hero (headline, lead, one button) and, when someone asks for it, the sign-in
    form in the same place — a button at the far right of the topbar swaps one for
    the other, and the same button reads "Back" while the form is showing. The swap
    is a dot transition: what is on screen breaks into dots, they scatter, and they
    gather into what comes next (dotMorph.js, dotMorphRun.js). On a phone there is
    no hero: the form is the screen, as it always was. That is the stylesheet's
    doing, not this file's — both are always in the tree, and `data-view` is only
    read by the desktop rules in auth.css.

    No panel gets a fill and no rule is drawn between things; the only lines are
    the form controls' own. It uses the app's ordinary tokens, so it is in whatever
    theme Settings → Appearance has chosen (Light, Dark, or System, which follows
    the OS) — including after signing out, because the theme is held above the auth
    gate. It offers no toggle of its own: Settings owns the choice. */
export function SignIn() {
  const { signIn, error, clearError } = useAuth()
  const [mode, setMode] = useState('login')
  /* Where the screen is (`hero` | `form`). While a dot transition runs it is still
     where it is *leaving*; `morph` says where it is going. */
  const [view, setView] = useState('hero')
  /* `null`, or `{ to, settling }` while the dots are in the air. `settling` is the
     last moment of it, when the real content comes up under the dots as they go. */
  const [morph, setMorph] = useState(null)
  /* Whether anyone has asked for the swap yet — the hero's own rise on load stops
     applying from then on, so it can never replay under a transition. */
  const [touched, setTouched] = useState(false)
  /* Bumped each time the form is shown, so focus moves to it then — and not on a
     first render that is showing it only because there is an error to read. */
  const [focusTick, setFocusTick] = useState(0)
  const isRegister = mode === 'register'
  const isForgot = mode === 'forgot'
  /* An error is never left behind the hero: a failed Google redirect, say, arrives
     before anyone has pressed anything, and has to be where it can be read. */
  const showForm = view === 'form' || Boolean(error)
  /* Where the screen is headed: what the topbar button and the field behind it
     answer to, so they change at the click rather than at the end of the dots. */
  const toward = morph ? morph.to : showForm ? 'form' : 'hero'

  const actionRef = useRef(null)
  const panelRef = useRef(null)
  const heroContentRef = useRef(null)
  const panelInnerRef = useRef(null)
  const morphCanvasRef = useRef(null)
  /* A transition in flight, readable synchronously: a second click, or Escape, in
     the middle of one must do nothing, and state would not be up to date yet. */
  const busyRef = useRef(false)

  /* Signing out deliberately leaves this device's push subscription alone, so
     reminders already scheduled keep arriving while logged out. That is only
     acceptable if the way to stop them is right here, on the screen you land
     on after signing out — not behind a login you may not want to do. */
  const push = usePushNotifications()
  const [remindersOff, setRemindersOff] = useState(false)

  /* The legal dialogs can be opened from the register form's agreement line
     and from the Privacy Policy link at the foot of the form. Only the
     register form asks for agreement — logging in and Google sign-in are
     deliberately untouched. */
  const [legalOpen, setLegalOpen] = useState(null)

  async function turnOffReminders() {
    if (await push.disable()) setRemindersOff(true)
  }

  function switchTo(nextMode) {
    clearError()
    setMode(nextMode)
  }

  /* The swap lands: the new view is the real one, the dots are gone. */
  const commit = useCallback((to) => {
    busyRef.current = false
    setMorph(null)
    setView(to)
    if (to === 'form') setFocusTick((tick) => tick + 1)
  }, [])

  const go = useCallback(
    (to) => {
      if (busyRef.current) return
      setTouched(true)
      // Someone who has asked for less motion gets the swap without the dots.
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
        commit(to)
        return
      }
      busyRef.current = true
      setMorph({ to, settling: false })
    },
    [commit],
  )

  function openForm(nextMode) {
    if (busyRef.current) return
    switchTo(nextMode)
    go('form')
  }

  const closeForm = useCallback(() => {
    if (busyRef.current) return
    clearError()
    go('hero')
    actionRef.current?.focus()
  }, [clearError, go])

  /* The dots. A layout effect, so the first frame of them is on the canvas before
     the browser paints the one in which the real content has gone — there is never
     a frame with neither. Keyed on where it is going and nothing else: `settling`
     changing mid-run must not restart it. Where it cannot run (no canvas, nothing
     to draw) the swap is simply made. */
  const target = morph?.to ?? null
  useLayoutEffect(() => {
    if (!target) return undefined
    const leaving = target === 'form' ? heroContentRef.current : panelInnerRef.current
    const arriving = target === 'form' ? panelInnerRef.current : heroContentRef.current
    const run = startDotMorph({
      canvas: morphCanvasRef.current,
      from: leaving,
      to: arriving,
      onSettle: () => setMorph((current) => (current ? { ...current, settling: true } : current)),
      onDone: () => commit(target),
    })
    if (!run) {
      commit(target)
      return undefined
    }
    return () => run.cancel()
  }, [target, commit])

  useEffect(() => {
    if (focusTick === 0) return
    /* Focus the first field of the form, not the first input in the panel:
       the form owns its own agreement checkbox now, further down. */
    panelRef.current?.querySelector('.auth-form input')?.focus()
  }, [focusTick])

  /* Escape goes back — but only from a form that was asked for. An error that put
     the form there is not something to dismiss by accident with a stray key. */
  useEffect(() => {
    /* While a legal document is open its own useModalA11y handler owns Escape.
       Leaving this one mounted too would close the form under it on the same
       key press. */
    if (view !== 'form' || legalOpen) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') closeForm()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [view, closeForm, legalOpen])

  return (
    <div
      className="auth-shell"
      data-view={showForm ? 'form' : 'hero'}
      data-target={toward}
      data-morph={morph ? `to-${morph.to}` : undefined}
      data-settling={morph?.settling ? '' : undefined}
      data-touched={touched ? '' : undefined}
    >
      <header className="auth-topbar">
        <div className="auth-topbar__brand">
          <span className="auth-hero__name">Cadence</span>
        </div>

        {/* Desktop only (auth.css): a phone is already looking at the form. One
            button for both directions, so there is a single way in and the same
            place to find the way out. */}
        <button
          type="button"
          ref={actionRef}
          className="auth-topbar__action"
          onClick={toward === 'form' ? closeForm : () => openForm('login')}
        >
          {toward === 'form' ? 'Back' : 'Log in'}
        </button>
      </header>

      <div className="auth-body">
        <DotField />

        <div className="auth-hero">
          <div className="auth-hero__content" ref={heroContentRef}>
            {/* Two of the o's are drawn: the app's own mark in "your" and a squarish
                one in "flow". They are decoration, so the heading is named in words. */}
            <h1 className="auth-hero__title" aria-label="Plan your rhythm. Find your flow.">
              Plan{' '}
              <span className="auth-hero__word">
                y<ClockIcon className="auth-hero__glyph" />
                ur
              </span>{' '}
              rhythm. Find your{' '}
              <span className="auth-hero__word">
                fl<BoxO className="auth-hero__glyph" />w
              </span>
              .
            </h1>
            <p className="auth-hero__lead">Personal Time-Blocking Planner &amp; Focus Tracker</p>
            <button
              type="button"
              className="primary-button primary-button--lg auth-hero__cta"
              onClick={() => openForm('register')}
            >
              Get started
            </button>
          </div>
        </div>

        <div className="auth-panel" ref={panelRef}>
          <div className="auth-panel__inner" ref={panelInnerRef} data-tabs={isForgot ? undefined : 'true'}>
            {/* On a phone: Log in | Sign up as a switch at the top of the form, where
                a thumb starts, instead of a link at its very foot under a keyboard.
                Not drawn on a desktop, where that link stays. The reset form has its
                own way back, so it has no tabs. */}
            {!isForgot && (
              <div className="pane-tabs-band auth-tabs">
                <PaneTabs
                  label="Account"
                  tabs={[
                    { id: 'login', label: 'Log in' },
                    { id: 'register', label: 'Sign up' },
                  ]}
                  value={isRegister ? 'register' : 'login'}
                  onChange={switchTo}
                />
              </div>
            )}
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
                <button
                  type="button"
                  className="google-button"
                  onClick={() => signIn({ rememberMe: rememberMeChoice() })}
                >
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
            {mode === 'register' && (
              <RegisterForm
                onOpenLegal={setLegalOpen}
                onSwitchToLogin={() => switchTo('login')}
              />
            )}
            {mode === 'forgot' && <ForgotPasswordForm onSwitchToLogin={() => switchTo('login')} />}

            {error && (
              <p className="banner banner--error" role="alert">
                <WarningIcon className="banner__icon" /> {error}
              </p>
            )}

            {mode === 'login' && (
              <p className="auth-panel__note">
                Your schedule is private to your account.{' '}
                <button type="button" className="link-button" onClick={() => setLegalOpen('privacy')}>
                  Privacy Policy
                </button>
              </p>
            )}
          </div>
        </div>

        {/* The dots, over the whole stage. Decoration, and never a target. */}
        <canvas ref={morphCanvasRef} className="auth-morph" aria-hidden="true" />
      </div>

      {legalOpen && (
        <LegalModal
          kind={legalOpen}
          onClose={() => setLegalOpen(null)}
          onNavigate={setLegalOpen}
        />
      )}

      {/* Outside the form's panel on purpose: on a desktop the panel is not there
          until someone asks for it, and "stop my reminders" has to be on the screen
          you land on after signing out, not behind a button first. */}
      {(push.subscribed || (remindersOff && !push.subscribed)) && (
        <div className="auth-notice">
          {push.subscribed && (
            <p role="status">
              Reminders are still on for this device.{' '}
              <button type="button" className="link-button" onClick={turnOffReminders} disabled={push.busy}>
                Turn off
              </button>
            </p>
          )}
          {remindersOff && !push.subscribed && (
            <p role="status">Reminders are off for this device.</p>
          )}
        </div>
      )}
    </div>
  )
}
