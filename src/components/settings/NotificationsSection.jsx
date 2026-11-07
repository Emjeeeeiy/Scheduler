import { useState } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useSettings } from '../../state/SettingsContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { usePushNotifications } from '../../lib/usePushNotifications.js'
import { usePushDiagnostics } from '../../lib/usePushDiagnostics.js'
import { explainTest, summarizeDiagnostics } from '../../lib/pushDiagnostics.js'
import { isBrave } from '../../lib/pushSubscription.js'
import { WarningIcon } from '../icons.jsx'
import { Row } from './SettingsParts.jsx'

const LEAD_TIME_OPTIONS = [15, 30, 60, 120]

/** Reminders: how far ahead "starting soon" looks, push on this device, and the
    morning email. */
export function NotificationsSection() {
  const { profile, updateDigestPreference } = useSchedule()
  const { settings, updateSetting } = useSettings()
  const { pushError, pushSuccess } = useToast()
  const push = usePushNotifications()
  // What the server knows (devices, queued reminders, its VAPID setup) — only
  // asked for once push is on, so people who never use it cost nothing.
  const diagnostics = usePushDiagnostics(push.subscribed)
  const pushStatus = push.subscribed && diagnostics.diagnosis !== null ? summarizeDiagnostics(diagnostics.diagnosis) : null
  const [digestBusy, setDigestBusy] = useState(false)

  async function onTogglePush() {
    if (push.subscribed) {
      const off = await push.disable()
      if (off) pushSuccess('Push notifications turned off for this device.')
      else pushError('Could not turn off push notifications. Try again.')
      return
    }
    /* The toast is chosen from what enable() returns, never from push.denied
       or the like: after the await those would still hold the values from the
       render that was on screen when the button was clicked. */
    const result = await push.enable()
    if (result.ok) pushSuccess('Push notifications turned on for this device.')
    else if (result.reason === 'denied')
      pushError('Notifications are blocked — allow them in your browser site settings, then reload.')
    else if (result.reason === 'dismissed') pushError('Notifications were not allowed for this site.')
    else if (result.reason === 'unsupported') pushError('This browser cannot receive push notifications.')
    else if (result.reason === 'unavailable')
      pushError('Push notifications are not available in this build — see README-push.md.')
    else if (result.reason === 'service')
      pushError(
        isBrave()
          ? 'Brave blocks push by default. Turn on "Use Google Services for Push Messaging" in brave://settings/privacy, restart Brave, then try again.'
          : "Your browser couldn't reach its push service. Check for a VPN, firewall or privacy extension blocking it, then try again.",
      )
    else pushError('Could not turn on push notifications. Try again.')
  }

  /* Sends a real notification to every device now, then says what happened in
     terms of the cause — the point is to separate "the server can't deliver"
     from "this device doesn't show it" without waiting on the cron job. */
  async function onTestPush() {
    const { ok, message } = explainTest(await diagnostics.test())
    if (ok) pushSuccess(message)
    else pushError(message)
  }

  async function onToggleDigest(enabled) {
    setDigestBusy(true)
    try {
      await updateDigestPreference(enabled)
    } catch (caught) {
      console.error('Could not update the digest setting.', caught)
      pushError('Could not update that setting. Try again.')
    } finally {
      setDigestBusy(false)
    }
  }

  return (
    <>
      <Row
        title="Notify ahead of time"
        hint={'How soon before a timed task starts it shows up as "starting soon."'}
      >
        <div className="filter-row" role="group" aria-label="Notify ahead of time">
          {LEAD_TIME_OPTIONS.map((min) => (
            <button
              key={min}
              type="button"
              className={`filter-chip${settings.notificationLeadMin === min ? ' filter-chip--on' : ''}`}
              aria-pressed={settings.notificationLeadMin === min}
              onClick={() => updateSetting('notificationLeadMin', min)}
            >
              {min < 60 ? `${min}m` : `${min / 60}h`}
            </button>
          ))}
        </div>
      </Row>

      <Row
        title="Push notifications"
        hint={
          'Reminders that arrive even when Cadence is closed or you\'re logged out: ahead of a task or event (your "Notify ahead of time"), when it starts, and a morning heads-up if anything is overdue.'
        }
      >
        {push.checking ? (
          <p className="field__hint">Checking whether this browser can receive push…</p>
        ) : !push.supported ? (
          <p className="field__hint">
            This browser can&apos;t receive push notifications. Try Chrome, Edge or Firefox.
            On iPhone or iPad, add Cadence to the Home Screen first (iOS 16.4+), open the
            installed app, and turn push on there.
          </p>
        ) : push.denied ? (
          <p className="field__hint">
            Blocked at the browser level. Allow notifications for this site in your browser's
            site settings, then reload.
          </p>
        ) : (
          <div className="settings-actions">
            <button
              type="button"
              className="ghost-button ghost-button--sm"
              onClick={onTogglePush}
              disabled={push.busy}
            >
              {push.busy ? 'Working…' : push.subscribed ? 'Turn off' : 'Turn on'}
            </button>
          </div>
        )}
        {push.subscribed && (
          <>
            {diagnostics.diagnosis === null ? (
              <p className="field__hint">Checking with the server…</p>
            ) : (
              <>
                {pushStatus?.text && (
                  <p className="field__hint" role="status">
                    {pushStatus.text}
                  </p>
                )}
                {pushStatus?.problem && (
                  <p className="banner banner--error" role="alert">
                    <WarningIcon className="banner__icon" /> {pushStatus.problem}
                  </p>
                )}
              </>
            )}
            <div className="settings-actions">
              <button
                type="button"
                className="ghost-button ghost-button--sm"
                onClick={onTestPush}
                disabled={diagnostics.testing}
              >
                {diagnostics.testing ? 'Sending…' : 'Send test notification'}
              </button>
              <button
                type="button"
                className="ghost-button ghost-button--sm"
                onClick={diagnostics.refresh}
                disabled={diagnostics.checking || diagnostics.testing}
              >
                Check again
              </button>
            </div>
          </>
        )}
        <p className="field__hint">
          Delivered within about a minute of the time. On a computer the browser has to be
          running — it can sit in the background with no windows open.
        </p>
        {isBrave() && (
          <p className="field__hint">
            In Brave, push only works with &quot;Use Google Services for Push Messaging&quot;
            turned on in brave://settings/privacy.
          </p>
        )}
      </Row>

      <Row
        title="Daily digest email"
        hint="One email each morning with today's plan, anything overdue, and what's coming up. Needs the backend pieces in functions/ deployed; see README-functions.md."
      >
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={profile?.dailyDigestEnabled === true}
            disabled={digestBusy}
            onChange={(e) => onToggleDigest(e.target.checked)}
          />
          Email me a daily digest
        </label>
      </Row>
    </>
  )
}
