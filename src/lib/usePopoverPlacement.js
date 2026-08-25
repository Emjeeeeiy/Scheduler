import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const GAP = 8
const EDGE = 12

/**
 * Anchored popover placement, plus the dismiss handling every popover needs.
 *
 * Extracted from the notification dropdown once a second popover (the month's
 * day peek) needed the same behaviour, because the two non-obvious parts are
 * worth having in exactly one place:
 *
 * 1. `position: fixed`, measured in viewport coordinates. Both triggers sit
 *    inside a scrolling ancestor — the sidebar, and the month grid — which
 *    would clip a panel positioned relative to it.
 * 2. Always a single clamped `left`, never switching to `right`. Mixing
 *    `right` with a fixed panel width lets the browser compute an implicit
 *    `left` that goes negative as soon as the trigger sits closer to an edge
 *    than the panel is wide. Clamping one coordinate handles a trigger
 *    anywhere on screen uniformly.
 *
 * Placement is null until the layout effect has measured, so nothing renders
 * during SSR — which is what keeps the smoke render honest.
 */
export function usePopoverPlacement({ open, onDismiss, width, maxHeight }) {
  const [placement, setPlacement] = useState(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)

  useLayoutEffect(() => {
    /* Nothing to clear on close: the panel renders only when `open` too, and
       this runs before paint on the next open, so a stale value can never be
       seen. Resetting here would just be a second render on every dismiss. */
    if (!open) return
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return

    const openUpward =
      rect.bottom + maxHeight + GAP > window.innerHeight && rect.top > maxHeight

    const maxLeft = window.innerWidth - width - EDGE
    const clampedLeft = Math.min(Math.max(rect.left, EDGE), Math.max(maxLeft, EDGE))

    setPlacement({
      position: 'fixed',
      ...(openUpward ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
      left: clampedLeft,
    })
  }, [open, width, maxHeight])

  useEffect(() => {
    if (!open) return undefined
    function onPointerDown(event) {
      if (triggerRef.current?.contains(event.target) || panelRef.current?.contains(event.target)) {
        return
      }
      onDismiss()
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') onDismiss()
    }
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onDismiss])

  return { placement, triggerRef, panelRef }
}
