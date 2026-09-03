import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusableElements(panel) {
  if (!panel) return []
  // No visibility filtering beyond the selector itself: every dialog in this
  // app hides a section by not rendering it (TagManager's icon picker,
  // ProfileModal's password step, …), never by CSS-hiding a focusable
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
export function useModalA11y(panelRef, { onClose, initialFocusRef, escapeDisabled = false } = {}) {
  const previouslyFocused = useRef(null)

  /* Both read through a ref, not closed over directly, for the same reason:
     not every caller wraps `onClose` in useCallback (TagManager/ItemManager/
     ProfileModal pass a plain inline arrow at their mount site), so its
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

  useEffect(() => {
    // Captured once, up front, rather than re-read as `panelRef.current`
    // inside the cleanup below — by the time cleanup runs (unmount), the ref
    // may already have been detached.
    const panel = panelRef.current
    previouslyFocused.current = document.activeElement

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
}
