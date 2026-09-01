import { useCallback, useState } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useNow } from '../../lib/useNow.js'
import { usePopoverPlacement } from '../../lib/usePopoverPlacement.js'
import { useDesktopNotifications } from '../../lib/useDesktopNotifications.js'
import { buildNotifications, describeNotification } from '../../lib/notifications.js'
import { BellIcon, CloseIcon } from '../icons.jsx'

const PANEL_WIDTH = 300
const PANEL_MAX_HEIGHT = 360

/**
 * Purely derived from the live task list and the clock — no read/dismissed
 * state to persist, so the badge is always exactly as current as the data
 * already flowing through ScheduleContext. An item drops off on its own the
 * moment it's no longer true (completed, rescheduled, or its window passes).
 *
 * Deleting one is a separate, session-only idea layered on top: there is no
 * notification document to remove, so a delete just hides that id from this
 * panel until it changes shape (or the tab reloads) — the underlying task is
 * untouched, and the badge count follows the hidden set the same way.
 */
export function NotificationBell({ onEdit }) {
  const { tasks, occurrencesOn } = useSchedule()
  const now = useNow()
  const [open, setOpen] = useState(false)
  const [dismissedIds, setDismissedIds] = useState(() => new Set())
  const dismiss = useCallback(() => setOpen(false), [])
  const deleteNotification = useCallback((id) => {
    setDismissedIds((current) => new Set(current).add(id))
  }, [])
  /* Placement and dismissal both live in the shared hook — see the note there
     about fixed positioning and the single clamped `left`. The month's day
     peek needs identical behaviour, and this logic is too subtle to keep in
     two places. */
  const { placement, triggerRef, panelRef } = usePopoverPlacement({
    open,
    onDismiss: dismiss,
    width: PANEL_WIDTH,
    maxHeight: PANEL_MAX_HEIGHT,
  })

  /* Stored tasks carry the overdue scan, which reaches arbitrarily far back;
     today's repeats have to be expanded before they can be noticed at all. */
  const notifications = buildNotifications(
    [...tasks, ...occurrencesOn(now.key)],
    now.key,
    now.min,
  )

  /* Called unconditionally, independent of `open`, and over the *undismissed*
     list — a desktop alert is only useful for the moment nobody has the panel
     open to see the same thing, and deleting an item from the panel should
     quiet its desktop alert too, not just hide the row. */
  const visible = notifications.filter((item) => !dismissedIds.has(item.id))
  const desktop = useDesktopNotifications(visible)

  return (
    <div className="notif">
      <button
        ref={triggerRef}
        type="button"
        className="icon-button notif__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          visible.length === 0
            ? 'Notifications — nothing needs attention'
            : `Notifications — ${visible.length} need attention`
        }
        aria-expanded={open}
        title="Notifications"
      >
        <BellIcon />
        {visible.length > 0 && (
          <span className="notif__badge" aria-hidden="true">
            {visible.length > 9 ? '9+' : visible.length}
          </span>
        )}
      </button>

      {open && placement && (
        <div ref={panelRef} className="notif__panel" style={placement} role="menu" aria-label="Notifications">
          <div className="notif__head">Notifications</div>
          {desktop.permission === 'denied' ? (
            <p className="notif__desktop-note">
              Desktop alerts are blocked — allow notifications for this site in your browser
              settings to turn them on.
            </p>
          ) : desktop.permission !== 'unsupported' ? (
            <label className="notif__desktop-toggle">
              <input
                type="checkbox"
                checked={desktop.enabled && desktop.permission === 'granted'}
                onChange={(e) => (e.target.checked ? desktop.request() : desktop.setEnabled(false))}
              />
              <span>Desktop alerts for overdue &amp; upcoming</span>
            </label>
          ) : null}
          {visible.length === 0 ? (
            <p className="empty empty--sm">Nothing needs your attention right now.</p>
          ) : (
            <ul className="notif__list">
              {visible.map((item) => (
                <li key={item.id} className="notif__row">
                  <button
                    type="button"
                    className="notif__item"
                    onClick={() => {
                      onEdit(item.task)
                      setOpen(false)
                    }}
                  >
                    <span className={`notif__dot notif__dot--${item.kind}`} aria-hidden="true" />
                    <span className="notif__body">
                      <span className="notif__title">{item.task.title}</span>
                      <span className="notif__meta">{describeNotification(item)}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="notif__dismiss"
                    onClick={() => deleteNotification(item.id)}
                    aria-label={`Delete notification: ${item.task.title}`}
                  >
                    <CloseIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
