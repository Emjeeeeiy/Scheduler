import { useEffect } from 'react'

/* Helpers for the toolbar that are not components — kept out of
   ToolbarParts.jsx so that file exports only components (which is what React's
   fast refresh needs to keep editor state while you edit them). */

/** Stops a press from moving focus out of the editor. Not applied to inputs,
    which need to be focused to be typed into. */
export const keepSelection = (event) => event.preventDefault()

/** One tab stop for the whole toolbar, arrow keys between the buttons — what
    role="toolbar" promises. Done on the DOM rather than in React state because
    the set of enabled buttons changes constantly (undo, redo, read-only) and
    tracking an index through all of that would be fragile; instead the live
    buttons are re-read on each key press and each focus. */
export function useRovingFocus(containerRef, selector = '.tb-btn') {
  useEffect(() => {
    const root = containerRef.current
    if (!root) return undefined
    const items = () => [...root.querySelectorAll(selector)].filter((el) => !el.disabled)
    const apply = (active) => {
      for (const el of root.querySelectorAll(selector)) el.setAttribute('tabindex', el === active ? '0' : '-1')
    }
    apply(items()[0])

    const onFocusIn = (event) => {
      if (event.target.matches?.(selector)) apply(event.target)
    }
    const onKeyDown = (event) => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
      const list = items()
      const at = list.indexOf(event.target)
      if (at < 0) return
      event.preventDefault()
      const step = event.key === 'ArrowRight' ? 1 : -1
      const next =
        event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : (at + step + list.length) % list.length
      list[next].focus()
    }
    root.addEventListener('focusin', onFocusIn)
    root.addEventListener('keydown', onKeyDown)

    // A disabled button can't hold the tab stop; hand it to one that can.
    const observer = new MutationObserver(() => {
      const current = root.querySelector(`${selector}[tabindex="0"]`)
      if (!current || current.disabled) apply(items()[0])
    })
    observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled'] })
    return () => {
      root.removeEventListener('focusin', onFocusIn)
      root.removeEventListener('keydown', onKeyDown)
      observer.disconnect()
    }
  }, [containerRef, selector])
}
