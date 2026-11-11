import { useAuth } from '../../state/AuthContext.jsx'
import { useResendVerification } from '../../lib/useResendVerification.js'
import { WarningIcon } from '../icons.jsx'

const SENT = 'Sent — check your inbox, and your spam folder.'
const FAILED = 'Couldn’t send it. Try again in a minute.'

/** A feature that is switched off until the email address is confirmed says so
    where the person is looking at it: a warning, in words, with the one action
    that fixes it. Not a faint line of hint text, and not only a banner at the
    top of the app — each unavailable feature carries its own.

    The words come from the caller, because each place names its own feature and
    says what is off. The look, the icon and the action are the same everywhere,
    so the state reads as one thing across Settings, Ask AI and the editor.
    Renders nothing for a confirmed account, so a caller never needs to check:
    when the address is confirmed the notice simply isn't there, and the control
    beside it is back to normal.

    `compact` is the smaller form, for inside a form beside a field.
    `id` is for the disabled controls it explains to point at with
    `aria-describedby`, so a screen reader reaching one hears why. */
export function VerifyNotice({ id, children, compact = false }) {
  const { emailVerified } = useAuth()
  const { status, resend } = useResendVerification()

  if (emailVerified) return null

  const busy = status === 'sending'

  return (
    <div className={`banner banner--verify${compact ? ' banner--compact' : ''}`} id={id}>
      <WarningIcon className="banner__icon" />
      <span className="banner__text">{children}</span>
      <span className="banner__actions" aria-live="polite">
        {status === 'sent' ? (
          <span className="verify-notice__status">{SENT}</span>
        ) : (
          <>
            {status === 'failed' && <span className="verify-notice__status">{FAILED}</span>}
            <button type="button" className="ghost-button ghost-button--sm" onClick={resend} disabled={busy}>
              {busy ? 'Sending…' : 'Resend email'}
            </button>
          </>
        )}
      </span>
    </div>
  )
}
