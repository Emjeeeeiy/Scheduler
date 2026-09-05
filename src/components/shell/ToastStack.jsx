import { useToast } from '../../state/ToastContext.jsx'
import { CheckIcon, CloseIcon, WarningIcon } from '../icons.jsx'

// One glyph per tone (WarningIcon doubles for both error and warning — the
// same triangle at two different colors is a common, well-understood
// convention, and this app avoids proliferating near-identical icons), and
// one modifier class carrying that tone's full surface — background AND
// text color together, mirroring .banner--error's own pattern so a toast
// reads correctly at a glance without needing to read it.
const TONE = {
  error: { Icon: WarningIcon, className: 'banner banner--error', role: 'alert' },
  warning: { Icon: WarningIcon, className: 'toast--warning', role: 'status' },
  success: { Icon: CheckIcon, className: 'toast--success', role: 'status' },
}

/** Fixed to a screen corner rather than inline in the header flow — unlike
    AuthContext's session-level banner, these describe one thing that just
    happened, not a standing condition, so they float over the content
    instead of pushing it down.

    Styled off `tone` alone — error (red), warning (amber), success (green,
    the same tone an undo toast uses) — each a full colored surface, not
    just a tinted icon, so the three read apart from across the room, not
    only up close. */
export function ToastStack() {
  const { toasts, dismiss } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="toast-stack" role="region" aria-label="Alerts">
      {toasts.map((toast) => {
        const hasAction = Boolean(toast.actionLabel && toast.onAction)
        const { Icon, className, role } = TONE[toast.tone] ?? TONE.success
        return (
          <p key={toast.id} className={`toast ${className}`} role={role}>
            <Icon className="banner__icon" />
            <span className="toast__message">{toast.message}</span>
            {hasAction && (
              <button
                type="button"
                className="link-button toast__action"
                onClick={() => {
                  toast.onAction()
                  dismiss(toast.id)
                }}
              >
                {toast.actionLabel}
              </button>
            )}
            <button
              type="button"
              className="icon-button icon-button--sm toast__dismiss"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
            >
              <CloseIcon />
            </button>
          </p>
        )
      })}
    </div>
  )
}
