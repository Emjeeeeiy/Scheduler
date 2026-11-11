import { useState } from 'react'
import { useAuth } from '../state/AuthContext.jsx'

/** "Send the confirmation email again", with the four states every place that
    offers it has to tell the person about: idle, sending, sent, and failed.

    Failed matters more than it looks. Firebase throttles repeated sends, and a
    resend button that does nothing when throttled reads as broken — so the
    caller gets a `failed` status to say so, instead of the click vanishing.

    Shared by the app-wide banner (VerifyEmailBanner) and the in-context notices
    (VerifyNotice), so the two can never word or behave differently. */
export function useResendVerification() {
  const { resendVerification } = useAuth()
  const [status, setStatus] = useState('idle') // idle | sending | sent | failed

  async function resend() {
    if (status === 'sending') return
    setStatus('sending')
    setStatus((await resendVerification()) ? 'sent' : 'failed')
  }

  return { status, resend }
}
