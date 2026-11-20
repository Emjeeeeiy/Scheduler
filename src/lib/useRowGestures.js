import { useEffect, useRef, useState } from 'react'

/* A finger on a list row: swipe it aside to reveal one action, or hold it to start
   choosing several. The Journal's note list is the one user.

   Touch only. Every handler returns at once for a mouse or a pen, so a desktop
   keeps plain clicks and the keyboard keeps the note header's Pin and Trash. This
   follows the rule the grid's blocks follow (DESIGN.md, "Touch editing"): a thumb
   is also what scrolls the page, so nothing happens to a row because a finger
   passed over it.

   One pointer goes through one of four paths, decided by what it does first:
     - it travels more than SLOP_PX, mostly up or down  -> a scroll. The browser has
       it (the row asks for `touch-action: pan-y`), and nothing here acts.
     - it travels more than SLOP_PX, mostly sideways     -> a swipe. The row follows
       the finger; on release it either stays open on its action or springs shut.
     - it stays put for HOLD_MS                          -> a hold. `onHold` fires
       once, with a small buzz where the device has one.
     - it lifts first                                    -> a tap, left to `click`.

   Releasing a swipe or a hold must not also open the note, because a browser may
   still send a click after it. `onClickCapture` swallows that one click (and only
   for AFTER_MS), the way the grid's "the release that arms it does not open the
   editor" rule does. */

/** How long a finger must rest, without travelling, to count as a hold. The grid's
    blocks arm at about the same moment, so the two gestures feel alike. */
export const HOLD_MS = 500
/** Travel that ends a hold and starts to decide scroll or swipe. Matches the grid's 10px. */
export const SLOP_PX = 10
/** How wide a revealed action is — also a comfortable touch target. */
export const ACTION_W = 72
/** Dragged this far (px), a release leaves the action open; less, and it springs shut. */
const OPEN_AT = 36
/** A little give past the action's width, so the pull has an end you can feel. */
const MAX = ACTION_W * 1.2
const AFTER_MS = 350

const clamp = (value) => Math.max(-MAX, Math.min(MAX, value))

/** Where a row rests: left of home when its trash is open (the action sits at the
    right), right of home when its pin is open (the action sits at the left). */
const resting = (open) => (open === 'trash' ? -ACTION_W : open === 'pin' ? ACTION_W : 0)

function buzz() {
  try {
    navigator.vibrate?.(12)
  } catch {
    /* Some browsers refuse it outside a user gesture; it is only a nicety. */
  }
}

/**
 * @param enabled        false switches every gesture off (choosing several, the trash)
 * @param open           which action the row is showing — 'trash', 'pin' or null; the
 *                       parent owns it so that only one row is ever open
 * @param onOpenChange   called with what a released swipe settled on ('trash' | 'pin' | null)
 * @param onStart        called when a swipe begins, so the parent can shut any other row
 * @param onHold         called when a hold completes
 * @return `offset` (px the row is slid, negative to the left), `dragging`, and the
 *         handlers to spread on the element that slides
 */
export function useRowGestures({ enabled, open, onOpenChange, onStart, onHold }) {
  const [drag, setDrag] = useState(null)

  // Read through a ref, so a parent re-rendering mid-gesture never leaves a
  // handler holding last render's callbacks.
  const live = useRef({ enabled, open, onOpenChange, onStart, onHold })
  useEffect(() => {
    live.current = { enabled, open, onOpenChange, onStart, onHold }
  })

  const gesture = useRef(null)
  const lastOffset = useRef(0)
  const swallowUntil = useRef(0)

  useEffect(() => () => clearTimeout(gesture.current?.timer), [])

  function onPointerDown(event) {
    // Anything but a finger is not this row's business, and neither is a second
    // finger laid down beside the first (`isPrimary` is false for it).
    if (!live.current.enabled || event.pointerType !== 'touch' || event.isPrimary === false) return
    // A new first touch always starts fresh. A lift that never arrived (the page
    // lost it to a system gesture, say) must not leave this row deaf for good.
    clearTimeout(gesture.current?.timer)
    const g = { id: event.pointerId, x: event.clientX, y: event.clientY, base: resting(live.current.open), mode: 'pending', timer: 0 }
    g.timer = setTimeout(() => {
      if (gesture.current !== g || g.mode !== 'pending') return
      g.mode = 'held'
      swallowUntil.current = Infinity // until the finger lifts; end() sets the real deadline
      buzz()
      live.current.onHold?.()
    }, HOLD_MS)
    gesture.current = g
    lastOffset.current = g.base
  }

  function onPointerMove(event) {
    const g = gesture.current
    if (!g || event.pointerId !== g.id) return
    const dx = event.clientX - g.x
    const dy = event.clientY - g.y

    if (g.mode === 'pending' && Math.hypot(dx, dy) > SLOP_PX) {
      clearTimeout(g.timer)
      if (Math.abs(dx) > Math.abs(dy)) {
        g.mode = 'swipe'
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId)
        } catch {
          /* Capture only keeps the drag going when the finger leaves the row. */
        }
        live.current.onStart?.()
      } else {
        g.mode = 'scroll'
      }
    }

    if (g.mode === 'swipe') {
      const offset = clamp(g.base + dx)
      lastOffset.current = offset
      setDrag(offset)
    }
  }

  // Lifting and a cancel (the system took the touch) settle the same way.
  function onPointerEnd(event) {
    const g = gesture.current
    if (!g || event.pointerId !== g.id) return
    clearTimeout(g.timer)
    gesture.current = null

    if (g.mode === 'swipe') {
      swallowUntil.current = Date.now() + AFTER_MS
      const at = lastOffset.current
      setDrag(null)
      live.current.onOpenChange?.(at <= -OPEN_AT ? 'trash' : at >= OPEN_AT ? 'pin' : null)
    } else if (g.mode === 'held') {
      swallowUntil.current = Date.now() + AFTER_MS
    }
  }

  function onClickCapture(event) {
    if (Date.now() < swallowUntil.current) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  // Android raises a context menu on a long press; it would land on top of the
  // selection this gesture starts.
  function onContextMenu(event) {
    if (gesture.current && gesture.current.mode !== 'scroll') event.preventDefault()
  }

  return {
    offset: drag ?? resting(open),
    dragging: drag !== null,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onClickCapture,
      onContextMenu,
    },
  }
}
