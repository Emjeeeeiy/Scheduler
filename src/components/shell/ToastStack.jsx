import { useToast } from '../../state/ToastContext.jsx'
import { CheckIcon, CloseIcon, WarningIcon } from '../icons.jsx'

/** Fixed to a screen corner rather than inline in the header flow — unlike
    AuthContext's session-level banner, these describe one thing that just
    happened, not a standing condition, so they float over the content
    instead of pushing it down.

    A toast carrying an action (undo-delete) isn't reporting a failure, so it
    skips the error banner's critical styling entirely — a neutral surface
    and a check mark instead of a warning triangle. */
export function ToastStack() {
  const { toasts, dismiss } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="toast-stack" role="region" aria-label="Alerts">
      {toasts.map((toast) => {
        const hasAction = Boolean(toast.actionLabel && toast.onAction)
        return (
          <p
            key={toast.id}
            className={`toast${hasAction ? ' toast--action' : ' banner banner--error'}`}
            role={hasAction ? 'status' : 'alert'}
          >
            {hasAction ? <CheckIcon className="banner__icon" /> : <WarningIcon className="banner__icon" />}
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
