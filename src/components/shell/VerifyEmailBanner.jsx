import { useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'

/** Shown until the account's email address is confirmed. Everything on the
    device works unverified; what waits is the part that runs on our servers —
    AI suggestions, push reminders and the daily digest — so an address nobody
    controls can't be signed up for any of them. Google accounts arrive
    verified and never see this. */
export function VerifyEmailBanner() {
  const { user, emailVerified, resendVerification, checkVerification } = useAuth()
  const [status, setStatus] = useState('idle') // idle | sending | sent | checking | still-unverified

  if (!user || emailVerified) return null

  async function onResend() {
    setStatus('sending')
    setStatus((await resendVerification()) ? 'sent' : 'idle')
  }

  async function onCheck() {
    setStatus('checking')
    const verified = await checkVerification()
    if (!verified) setStatus('still-unverified')
  }

  const message =
    status === 'sent'
      ? `Sent — check ${user.email ?? 'your inbox'} (and spam), then come back here.`
      : status === 'still-unverified'
        ? 'Not confirmed yet. Open the link in the email, then try again.'
        : `Confirm your email address to turn on AI suggestions, push reminders and the daily digest.`

  return (
    <div className="banner banner--verify" role="status">
      <span className="banner__text">{message}</span>
      <span className="banner__actions">
        <button
          type="button"
          className="ghost-button ghost-button--sm"
          onClick={onResend}
          disabled={status === 'sending' || status === 'checking'}
        >
          {status === 'sending' ? 'Sending…' : 'Resend email'}
        </button>
        <button
          type="button"
          className="ghost-button ghost-button--sm"
          onClick={onCheck}
          disabled={status === 'sending' || status === 'checking'}
        >
          {status === 'checking' ? 'Checking…' : 'I’ve confirmed it'}
        </button>
      </span>
    </div>
  )
}
