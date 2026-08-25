import { useCallback, useState } from 'react'
import { useSchedule } from '../state/ScheduleContext.jsx'
import { useNow } from '../lib/useNow.js'
import { usePopoverPlacement } from '../lib/usePopoverPlacement.js'
import { buildNotifications } from '../lib/notifications.js'
import { durationLabel, minToLabel, relativeDayLabel } from '../lib/date.js'
import { BellIcon } from './icons.jsx'

function describe(item) {
  const { kind, task } = item
  if (kind === 'overdue') return `Overdue since ${relativeDayLabel(task.date)}`
  if (kind === 'now') return `Happening now · ${durationLabel(task.durationMin)}`
  return `Starts in ${item.minutesUntil}m · ${minToLabel(task.startMin)}`
}

const PANEL_WIDTH = 300
const PANEL_MAX_HEIGHT = 360

/**
 * Purely derived from the live task list and the clock — no read/dismissed
 * state to persist, so the badge is always exactly as current as the data
 * already flowing through ScheduleContext. An item drops off on its own the
 * moment it's no longer true (completed, rescheduled, or its window passes).
 */
export function NotificationBell({ onEdit }) {
  const { tasks, occurrencesOn } = useSchedule()
  const now = useNow()
  const [open, setOpen] = useState(false)
  const dismiss = useCallback(() => setOpen(false), [])
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

  return (
    <div className="notif">
      <button
        ref={triggerRef}
        type="button"
        className="icon-button notif__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          notifications.length === 0
            ? 'Notifications — nothing needs attention'
            : `Notifications — ${notifications.length} need attention`
        }
        aria-expanded={open}
        title="Notifications"
      >
        <BellIcon />
        {notifications.length > 0 && (
          <span className="notif__badge" aria-hidden="true">
            {notifications.length > 9 ? '9+' : notifications.length}
          </span>
        )}
      </button>

      {open && placement && (
        <div ref={panelRef} className="notif__panel" style={placement} role="menu" aria-label="Notifications">
          <div className="notif__head">Notifications</div>
          {notifications.length === 0 ? (
            <p className="empty empty--sm">Nothing needs your attention right now.</p>
          ) : (
            <ul className="notif__list">
              {notifications.map((item) => (
                <li key={item.id}>
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
                      <span className="notif__meta">{describe(item)}</span>
                    </span>
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
