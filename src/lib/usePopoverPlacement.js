import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BACK_RANK, useBackLayer } from './useBackLayer.js'

const GAP = 8
const EDGE = 12
/* The width below which a popover that asks for it is docked to the bottom
   edge as a sheet — the same line modals.css turns every dialog into one. */
const SHEET_QUERY = '(max-width: 640px)'
/* The placement of a docked panel: a sentinel compared by identity — truthy so
   the panel renders, but not a style. */
const DOCKED = Object.freeze({ docked: true })

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
 *
 * `sheet: true` is for a menu that is better as a bottom sheet on a phone (the
 * account menu, notifications): at SHEET_QUERY there is nothing to anchor to, so
 * it returns `docked` and no inline position, and the caller adds `popover--sheet`
 * and a scrim (modals.css draws both). Everything that is not asked to be a
 * sheet — the day peek, the Journal toolbar's pop-ups — is placed as before: a
 * docked panel would sit under the keyboard while writing.
 */
export function usePopoverPlacement({ open, onDismiss, width, maxHeight, sheet = false }) {
  const [placement, setPlacement] = useState(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)

  /* Back closes an open popover first. Ranked above dialogs because a popover
     can be opened from inside one (the Journal toolbar's pop-ups, the day peek),
     and the thing most recently opened is the thing Back should close. */
  useBackLayer(
    open ? 'popover' : null,
    () => {
      onDismiss()
      return true
    },
    BACK_RANK.popover,
  )

  /* Worked out while rendering, not by an effect that sets state: it is a fact
     about the window, not something to measure from the DOM, so there is no
     second render and no frame where the panel is somewhere else first. (It also
     follows the window if a phone is turned while the menu is open.) */
  const docked = open && sheet && fitsSheet()

  useLayoutEffect(() => {
    /* Nothing to clear on close: the panel renders only when `open` too, and
       this runs before paint on the next open, so a stale value can never be
       seen. Resetting here would just be a second render on every dismiss.
       A docked panel has nothing to measure: the stylesheet places it. */
    if (!open || docked) return
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
  }, [open, docked, width, maxHeight])

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

  // `placement` is truthy once the panel may render: docked at once, anchored once
  // measured. `style` is what to put on it — nothing when docked (CSS positions
  // it), the measured position otherwise.
  return {
    placement: docked ? DOCKED : placement,
    docked,
    style: docked ? undefined : placement,
    triggerRef,
    panelRef,
  }
}

/** Whether the window is narrow enough for a menu that asked for it to be a sheet.
    False where there is no window or no matchMedia (the smoke render, an old browser). */
function fitsSheet() {
  return typeof window !== 'undefined' && (window.matchMedia?.(SHEET_QUERY)?.matches ?? false)
}
