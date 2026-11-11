import { useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useResendVerification } from '../../lib/useResendVerification.js'
import { WarningIcon } from '../icons.jsx'

/** Shown until the account's email address is confirmed. Everything on the
    device works unverified; what waits is the part that runs on our servers —
    AI suggestions, push reminders and the daily digest — so an address nobody
    controls can't be signed up for any of them. Google accounts arrive
    verified and never see this.

    The same fact is repeated, briefly, where each of those features is blocked
    (VerifyNotice) — this is the app-wide statement of it, and the one place
    that also offers "I've confirmed it" for a confirmation done elsewhere. */
export function VerifyEmailBanner() {
  const { user, emailVerified, checkVerification } = useAuth()
  const { status: resendStatus, resend } = useResendVerification()
  const [check, setCheck] = useState('idle') // idle | checking | still-unverified

  if (!user || emailVerified) return null

  async function onCheck() {
    setCheck('checking')
    const verified = await checkVerification()
    if (!verified) setCheck('still-unverified')
  }

  const message =
    resendStatus === 'sent'
      ? `Sent — check ${user.email ?? 'your inbox'} (and spam), then come back here.`
      : resendStatus === 'failed'
        ? 'Couldn’t send it. Try again in a minute.'
        : check === 'still-unverified'
          ? 'Not confirmed yet. Open the link in the email, then try again.'
          : 'Confirm your email address to turn on AI suggestions, push reminders and the daily digest.'

  const busy = resendStatus === 'sending' || check === 'checking'

  return (
    <div className="banner banner--verify" role="status">
      <WarningIcon className="banner__icon" />
      <span className="banner__text">{message}</span>
      <span className="banner__actions">
        <button type="button" className="ghost-button ghost-button--sm" onClick={resend} disabled={busy}>
          {resendStatus === 'sending' ? 'Sending…' : 'Resend email'}
        </button>
        <button type="button" className="ghost-button ghost-button--sm" onClick={onCheck} disabled={busy}>
          {check === 'checking' ? 'Checking…' : 'I’ve confirmed it'}
        </button>
      </span>
    </div>
  )
}
