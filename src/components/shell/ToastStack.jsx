import { useToast } from '../../state/ToastContext.jsx'
import { CloseIcon, WarningIcon } from '../icons.jsx'

/** Fixed to a screen corner rather than inline in the header flow — unlike
    AuthContext's session-level banner, these describe one action that just
    failed, not a standing condition, so they float over the content instead
    of pushing it down. */
export function ToastStack() {
  const { toasts, dismiss } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="toast-stack" role="region" aria-label="Alerts">
      {toasts.map((toast) => (
        <p key={toast.id} className="toast banner banner--error" role="alert">
          <WarningIcon className="banner__icon" />
          <span className="toast__message">{toast.message}</span>
          <button
            type="button"
            className="icon-button icon-button--sm toast__dismiss"
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss"
          >
            <CloseIcon />
          </button>
        </p>
      ))}
    </div>
  )
}
