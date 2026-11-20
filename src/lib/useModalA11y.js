import { useEffect, useRef } from 'react'
import { BACK_RANK, useBackLayer } from './useBackLayer.js'

/* The swipe-to-close is only for a touch screen at sheet width — with a mouse
   nothing is dragged, and a wider dialog is a card, not a sheet. */
const SHEET_SWIPE_QUERY = '(max-width: 640px) and (pointer: coarse)'
/* How far down the head is dragged to close, and the shorter, quicker flick that
   closes too (px, then px per ms). */
const SWIPE_CLOSE_PX = 90
const SWIPE_FLICK_MIN_PX = 40
const SWIPE_FLICK_SPEED = 0.6

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableElements(panel) {
  if (!panel) return []
  // No visibility filtering beyond the selector itself: every dialog in this
  // app hides a section by not rendering it (the item manager's
  // filters, the editors' repeat picker, …), never by CSS-hiding a focusable
  // element while leaving it in the DOM — so there is nothing here for an
  // offsetParent-style layout check to catch, and jsdom (used by
  // tests/a11y.test.jsx) never computes real layout, which would make such
  // a check see everything as hidden.
  return Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR))
}

/**
 * The keyboard behaviour every one of this app's `.modal__panel` dialogs is
 * supposed to have, in one place instead of six near-identical copies: focus
 * moves into the dialog when it opens (a given `initialFocusRef`, or
 * otherwise the first focusable element), Tab/Shift+Tab cycle within it
 * rather than escaping into the page underneath, Escape closes it, and focus
 * returns to whatever was focused before the dialog opened once it closes —
 * the element a screen-reader or keyboard user was already on, not the top
 * of the page.
 *
 * Replaces each component's own "Escape closes" effect rather than sitting
 * beside it; every modal already renders the same
 * `<div className="modal__panel" role="dialog" aria-modal="true">` shape, so
 * one hook can own the whole contract for all of them.
 */
/* Scroll lock state, shared across every dialog rather than held per hook.
 *
 * Counted rather than a boolean because dialogs do stack — the item index
 * opens an editor over itself, the account menu opens a profile modal — and
 * the second one closing must not unlock the page while the first is still
 * up. Only the outermost lock restores.
 */
let scrollLocks = 0
let restoreBodyStyle = null

function lockBodyScroll() {
  scrollLocks += 1
  if (scrollLocks > 1) return

  const { body } = document
  restoreBodyStyle = { overflow: body.style.overflow, paddingRight: body.style.paddingRight }
  /* Removing the page's scrollbar makes the viewport wider, which shifts
     everything behind the dimmed backdrop sideways at the exact moment a
     dialog appears over it. Replacing its width with padding keeps the page
     still. Zero on overlay-scrollbar platforms, where there was nothing
     taking up space to begin with. */
  const scrollbar = window.innerWidth - document.documentElement.clientWidth
  if (scrollbar > 0) {
    const current = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0
    body.style.paddingRight = `${current + scrollbar}px`
  }
  body.style.overflow = 'hidden'
}

function unlockBodyScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1)
  if (scrollLocks > 0 || !restoreBodyStyle) return
  document.body.style.overflow = restoreBodyStyle.overflow
  document.body.style.paddingRight = restoreBodyStyle.paddingRight
  restoreBodyStyle = null
}

export function useModalA11y(panelRef, { onClose, initialFocusRef, escapeDisabled = false } = {}) {
  const previouslyFocused = useRef(null)

  /* Both read through a ref, not closed over directly, for the same reason:
     not every caller wraps `onClose` in useCallback (ItemManager/the
     editors pass a plain inline arrow at their mount site), so its
     identity can change on a render this dialog had nothing to do with — a
     Firestore snapshot updating elsewhere re-renders the parent, which
     recreates that arrow. If the setup effect below depended on `onClose`,
     that unrelated re-render would re-run it: re-capturing
     `previouslyFocused` and re-focusing the initial element, yanking focus
     out from under whatever the person is mid-typing into. Reading the
     latest value through a ref, updated every render, keeps the trap itself
     — set up once on mount — from caring that the identity moved. */
  const onCloseRef = useRef(onClose)
  const escapeDisabledRef = useRef(escapeDisabled)
  useEffect(() => {
    onCloseRef.current = onClose
    escapeDisabledRef.current = escapeDisabled
  })

  /* The phone's Back button closes the dialog the way Escape does — and is
     refused in the same circumstances (a dialog that has switched Escape off is
     mid-something that closing would lose). Without this Back skipped straight
     past an open dialog and left the app. See backStack.js. */
  useBackLayer(
    true,
    () => {
      if (escapeDisabledRef.current) return false
      onCloseRef.current?.()
      return true
    },
    BACK_RANK.modal,
  )

  useEffect(() => {
    // Captured once, up front, rather than re-read as `panelRef.current`
    // inside the cleanup below — by the time cleanup runs (unmount), the ref
    // may already have been detached.
    const panel = panelRef.current
    previouslyFocused.current = document.activeElement

    /* The page behind a dialog stays put while it is open. Without this,
       scrolling a long panel to its end hands the rest of the gesture to the
       page underneath, which slides around behind the dim — and a wheel over
       the backdrop scrolls it directly. Both make the app look like the
       dialog is drifting. */
    lockBodyScroll()

    // Direct, not deferred: useEffect already runs after the DOM has
    // committed and painted (unlike useLayoutEffect), so the panel and
    // everything in it already exists and is visible by the time this runs.
    const toFocus = initialFocusRef?.current ?? focusableElements(panel)[0]
    toFocus?.focus()

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        if (!escapeDisabledRef.current) onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab') return

      const list = focusableElements(panel)
      if (list.length === 0) return
      const first = list[0]
      const last = list[list.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      unlockBodyScroll()
      /* Unconditional, deliberately: removing the panel's DOM node is what
         triggers this cleanup to run, and a browser blurs a focused element
         the instant it's detached — so by the time this runs,
         document.activeElement has already reset to <body> whether or not
         anything "took over" focus first. A "restore only if focus is still
         inside the panel" check therefore can never be true here; it would
         make this silently never restore anything. The one real handoff
         case — this dialog swaps for a different one in the same update
         (e.g. TaskEditor's "Edit the series") — is still fine: the new
         dialog's own mount effect runs afterward in the same commit and
         focuses itself, overriding whatever this line does first. */
      const el = previouslyFocused.current
      if (el && document.contains(el)) el.focus()
    }
    /* Deliberately empty: this is mount/unmount setup for one dialog
       instance, not something that should redo on every render. `panelRef`
       and `initialFocusRef` are refs the caller creates once via useRef and
       never recreates, so they carry nothing new to react to; `onClose` and
       `escapeDisabled` are read through the refs above precisely so this
       effect doesn't need to depend on either. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* On a phone a dialog is a bottom sheet (modals.css), and two things about one
     are only a script's to do — so they live here, where every dialog already gets
     its keyboard behaviour, rather than being copied into each.

     1. Stand clear of the on-screen keyboard. A sheet bottom-aligned in the layout
        viewport sits BEHIND the keyboard, hiding Save exactly when a field is being
        typed in. The visual viewport knows how much of the screen the keyboard took;
        it is written to `--keyboard-inset` on the dim, which the sheet pads by.
        (Not while pinch-zoomed: a zoomed viewport is smaller too, and that is not a
        keyboard.)
     2. Swipe down on the head to close. Closing goes through the same `onClose` —
        and the same refusal when Escape is off — as every other way out, so a
        dialog that is mid-save cannot be flicked away. Anything short of a clear
        drag springs back. The head, not the whole panel, is the drag zone: a drag
        inside the content is a scroll. */
  useEffect(() => {
    const panel = panelRef.current
    const root = panel?.closest?.('.modal')
    if (!panel || !root) return undefined
    const undo = []

    const viewport = window.visualViewport
    if (viewport) {
      const measure = () => {
        const inset = viewport.scale > 1.01 ? 0 : window.innerHeight - viewport.height - viewport.offsetTop
        root.style.setProperty('--keyboard-inset', `${Math.max(0, Math.round(inset))}px`)
      }
      measure()
      viewport.addEventListener('resize', measure)
      viewport.addEventListener('scroll', measure)
      undo.push(() => {
        viewport.removeEventListener('resize', measure)
        viewport.removeEventListener('scroll', measure)
      })
    }

    const head = panel.querySelector('.modal__head')
    if (head && window.matchMedia?.(SHEET_SWIPE_QUERY)?.matches) {
      const drag = { id: null, startY: 0, startAt: 0, dy: 0 }

      const onDown = (event) => {
        // A press on the Close button (or any control in the head) is that
        // control's, not the start of a drag.
        if (event.pointerType === 'mouse' || event.target.closest?.('button, a, input, select, textarea')) return
        drag.id = event.pointerId
        drag.startY = event.clientY
        drag.startAt = event.timeStamp
        drag.dy = 0
        head.setPointerCapture?.(event.pointerId)
      }
      const onMove = (event) => {
        if (drag.id !== event.pointerId) return
        // Downward only: a sheet has nowhere to go up.
        drag.dy = Math.max(0, event.clientY - drag.startY)
        panel.style.transition = 'none'
        panel.style.transform = `translateY(${drag.dy}px)`
      }
      const onEnd = (event, cancelled) => {
        if (drag.id !== event.pointerId) return
        drag.id = null
        const elapsed = Math.max(1, event.timeStamp - drag.startAt)
        // Far enough, or a short but quick flick.
        const dismissed = !cancelled && (drag.dy > SWIPE_CLOSE_PX || (drag.dy > SWIPE_FLICK_MIN_PX && drag.dy / elapsed > SWIPE_FLICK_SPEED))
        if (dismissed && !escapeDisabledRef.current) onCloseRef.current?.()
        // Whether it closed (the panel is about to go) or not (it must come back),
        // hand the transform back to the stylesheet.
        panel.style.transition = 'transform 160ms ease-out'
        panel.style.transform = ''
      }
      const onUp = (event) => onEnd(event, false)
      const onCancel = (event) => onEnd(event, true)

      head.addEventListener('pointerdown', onDown)
      head.addEventListener('pointermove', onMove)
      head.addEventListener('pointerup', onUp)
      head.addEventListener('pointercancel', onCancel)
      undo.push(() => {
        head.removeEventListener('pointerdown', onDown)
        head.removeEventListener('pointermove', onMove)
        head.removeEventListener('pointerup', onUp)
        head.removeEventListener('pointercancel', onCancel)
      })
    }

    return () => undo.forEach((fn) => fn())
    // Mount-only, for the reasons given for the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
