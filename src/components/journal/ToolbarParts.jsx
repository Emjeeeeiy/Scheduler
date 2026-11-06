import { useCallback, useEffect } from 'react'
import { usePopoverPlacement } from '../../lib/usePopoverPlacement.js'
import { CheckIcon } from '../icons.jsx'
import { ChevronDownIcon } from './journalIcons.jsx'
import { SHORTCUTS, ariaKeys, formatKeys, withShortcut } from './shortcuts.js'
import { keepSelection } from './toolbarUtils.js'

/* The pieces every toolbar control is made of.
 *
 * The one rule that shapes all of them: pressing a toolbar control must not take
 * focus — and with it the selection — away from the text it is about to change.
 * Every control therefore swallows mousedown (which is what moves focus) and
 * acts on click, and every command ends in `.focus()` to hand the caret back.
 */

export function ToolButton({
  icon: Glyph,
  label,
  shortcut,
  pressed,
  disabled,
  onClick,
  className = '',
  children,
  ...rest
}) {
  const keys = shortcut ? SHORTCUTS[shortcut] : null
  return (
    <button
      type="button"
      className={`tb-btn${pressed ? ' tb-btn--on' : ''}${className ? ` ${className}` : ''}`}
      aria-label={label}
      title={withShortcut(label, shortcut)}
      aria-pressed={pressed}
      aria-keyshortcuts={keys ? ariaKeys(keys) : undefined}
      disabled={disabled}
      onMouseDown={keepSelection}
      onClick={onClick}
      {...rest}
    >
      {Glyph ? <Glyph className="tb-icon" /> : null}
      {children}
    </button>
  )
}

/** A toolbar button that opens a popover: an optional icon, optional text, and a
    chevron. `ref` and the aria/handler props arrive from ToolPopover. */
export function TriggerButton({ icon: Glyph, text, label, title, wide, className = '', children, ...props }) {
  return (
    <button
      type="button"
      className={`tb-btn tb-btn--menu${wide ? ' tb-btn--wide' : ''}${className ? ` ${className}` : ''}`}
      aria-label={label}
      title={title ?? label}
      {...props}
    >
      {Glyph ? <Glyph className="tb-icon" /> : null}
      {text ? <span className="tb-btn__text">{text}</span> : null}
      {children}
      <ChevronDownIcon className="tb-chevron" />
    </button>
  )
}

const NAVIGABLE = 'button:not(:disabled)'
const ENTRY = '[data-autofocus], [aria-checked="true"], [aria-pressed="true"], button:not(:disabled), input:not(:disabled)'

/** A floating panel anchored to its trigger. Placement, outside-click and Escape
    come from usePopoverPlacement (the same behaviour as the notification and
    day-peek popovers); this adds what a toolbar needs on top: focus moves into
    the panel on open — to the checked item if there is one — and arrow keys walk
    its buttons. Escape returns focus to the trigger before the panel closes. */
export function ToolPopover({
  open,
  onOpenChange,
  renderTrigger,
  children,
  label,
  width = 240,
  maxHeight = 360,
  className = '',
}) {
  const onDismiss = useCallback(() => onOpenChange(false), [onOpenChange])
  const { placement, triggerRef, panelRef } = usePopoverPlacement({ open, onDismiss, width, maxHeight })
  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  useEffect(() => {
    if (!open || !placement) return
    panelRef.current?.querySelector(ENTRY)?.focus({ preventScroll: true })
  }, [open, placement, panelRef])

  function onPanelKeyDown(event) {
    if (event.key === 'Escape') {
      triggerRef.current?.focus()
      return
    }
    // Keys typed into an open popover are its own: they must not also fire the
    // app's global shortcuts (n for a new task, Ctrl+K for the palette) behind it.
    event.stopPropagation()
    if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
    if (event.target.tagName === 'INPUT' && event.target.type !== 'color') return
    const items = [...panelRef.current.querySelectorAll(NAVIGABLE)]
    const at = items.indexOf(document.activeElement)
    if (at < 0) return
    event.preventDefault()
    const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight'
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (at + (forward ? 1 : -1) + items.length) % items.length
    items[next].focus()
  }

  return (
    <>
      {renderTrigger({
        ref: triggerRef,
        'aria-haspopup': 'dialog',
        'aria-expanded': open,
        onMouseDown: keepSelection,
        onClick: () => onOpenChange(!open),
        onKeyDown: (event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault()
            onOpenChange(true)
          }
        },
      })}
      {open && placement && (
        <div
          ref={panelRef}
          className={`tb-pop${className ? ` ${className}` : ''}`}
          role="dialog"
          aria-label={label}
          style={{ ...placement, width, maxHeight }}
          onKeyDown={onPanelKeyDown}
        >
          {typeof children === 'function' ? children({ close }) : children}
        </div>
      )}
    </>
  )
}

/** One row of a menu: a radio/checkbox-style choice when `checked` is given, a
    plain action otherwise. The key hint is the same string the tooltips use. */
export function MenuItem({ icon: Glyph, label, shortcut, checked, onSelect, style, children, ...rest }) {
  const toggles = typeof checked === 'boolean'
  return (
    <button
      type="button"
      role={toggles ? 'menuitemradio' : 'menuitem'}
      aria-checked={toggles ? checked : undefined}
      className={`tb-item${checked ? ' tb-item--on' : ''}`}
      onMouseDown={keepSelection}
      onClick={onSelect}
      style={style}
      {...rest}
    >
      {Glyph ? <Glyph className="tb-icon" /> : null}
      <span className="tb-item__label">{label}</span>
      {children}
      {shortcut && SHORTCUTS[shortcut] ? <kbd className="tb-item__keys">{formatKeys(SHORTCUTS[shortcut])}</kbd> : null}
      {checked ? <CheckIcon className="tb-item__check" /> : null}
    </button>
  )
}

export const ToolSeparator = () => <span className="tb-sep" role="separator" aria-orientation="vertical" />
