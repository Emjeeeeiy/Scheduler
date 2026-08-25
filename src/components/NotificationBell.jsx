import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSchedule } from '../state/ScheduleContext.jsx'
import { useNow } from '../lib/useNow.js'
import { buildNotifications } from '../lib/notifications.js'
import { durationLabel, minToLabel, relativeDayLabel } from '../lib/date.js'

/* No plain-text Unicode glyph reads unambiguously as "bell" without falling
   into the emoji range, and the emoji bell renders in full colour on most
   platforms — a clash with the rest of this icon set, which is line-art in
   a single inherited colour. A small inline stroke icon is the one place
   this app draws an SVG instead of a character. */
function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function describe(item) {
  const { kind, task } = item
  if (kind === 'overdue') return `Overdue since ${relativeDayLabel(task.date)}`
  if (kind === 'now') return `Happening now · ${durationLabel(task.durationMin)}`
  return `Starts in ${item.minutesUntil}m · ${minToLabel(task.startMin)}`
}

const PANEL_WIDTH = 300
const PANEL_MAX_HEIGHT = 360
const GAP = 8

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
  const [placement, setPlacement] = useState(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)

  /* Stored tasks carry the overdue scan, which reaches arbitrarily far back;
     today's repeats have to be expanded before they can be noticed at all. */
  const notifications = buildNotifications(
    [...tasks, ...occurrencesOn(now.key)],
    now.key,
    now.min,
  )

  /* The sidebar scrolls its own overflow, which would clip a dropdown
     positioned relative to it — so this measures the trigger in viewport
     coordinates and renders the panel `position: fixed`, escaping that
     ancestor entirely, and flips above/below or left/right of the button
     based on actual available space rather than a fixed per-breakpoint
     guess (the trigger sits at the sidebar's bottom on desktop but in a top
     bar on mobile — opposite ends of the screen). */
  useLayoutEffect(() => {
    if (!open) return
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return

    const openUpward = rect.bottom + PANEL_MAX_HEIGHT + GAP > window.innerHeight && rect.top > PANEL_MAX_HEIGHT

    /* Always a single `left`, clamped into the viewport, rather than ever
       switching to `right` — mixing `right` with the panel's fixed CSS width
       lets the browser compute an implicit `left` that goes negative the
       moment the trigger sits closer to one edge than the panel is wide
       (exactly the case with a mobile trigger a hundred-odd px from the left:
       right-aligning to it left nowhere for the other 300px to go). Clamping
       one coordinate handles a trigger anywhere on screen uniformly. */
    const maxLeft = window.innerWidth - PANEL_WIDTH - 12
    const clampedLeft = Math.min(Math.max(rect.left, 12), Math.max(maxLeft, 12))

    setPlacement({
      position: 'fixed',
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top + GAP }
        : { top: rect.bottom + GAP }),
      left: clampedLeft,
    })
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event) {
      if (triggerRef.current?.contains(event.target) || panelRef.current?.contains(event.target)) {
        return
      }
      setOpen(false)
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

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
