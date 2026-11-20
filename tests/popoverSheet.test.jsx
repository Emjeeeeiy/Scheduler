/* usePopoverPlacement's `sheet` mode: a menu that asks for it is docked to the
 * bottom edge on a phone (there is no corner to anchor to) and anchored as always
 * on anything wider. Pinned: the choice follows the same 640px line modals.css
 * turns dialogs into sheets at; a popover that did NOT ask (the day peek, the
 * Journal toolbar's pop-ups — a docked panel would sit under the keyboard) is
 * never docked; and docking changes where the panel is, not how it is dismissed.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePopoverPlacement } from '../src/lib/usePopoverPlacement.js'

afterEach(() => {
  cleanup()
  delete window.matchMedia
})

const viewport = (narrow) => {
  window.matchMedia = (query) => ({
    matches: narrow && query === '(max-width: 640px)',
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })
}

function Menu({ sheet, onDismiss }) {
  const { placement, docked, style, triggerRef, panelRef } = usePopoverPlacement({
    open: true,
    onDismiss,
    width: 190,
    maxHeight: 280,
    sheet,
  })
  return (
    <div>
      <button ref={triggerRef} type="button">
        trigger
      </button>
      {placement && (
        <div ref={panelRef} role="menu" data-docked={String(docked)} style={style}>
          panel
        </div>
      )}
    </div>
  )
}

describe('usePopoverPlacement sheet mode', () => {
  it('docks on a phone: no inline position, for the stylesheet to place', () => {
    viewport(true)
    render(<Menu sheet onDismiss={vi.fn()} />)
    const panel = screen.getByRole('menu')
    expect(panel.dataset.docked).toBe('true')
    expect(panel.getAttribute('style')).toBeNull()
  })

  it('anchors to its trigger on anything wider', () => {
    viewport(false)
    render(<Menu sheet onDismiss={vi.fn()} />)
    const panel = screen.getByRole('menu')
    expect(panel.dataset.docked).toBe('false')
    expect(panel.style.position).toBe('fixed')
    expect(panel.style.left).not.toBe('')
  })

  it('never docks a popover that did not ask, whatever the width', () => {
    viewport(true)
    render(<Menu onDismiss={vi.fn()} />)
    const panel = screen.getByRole('menu')
    expect(panel.dataset.docked).toBe('false')
    expect(panel.style.position).toBe('fixed')
  })

  it('copes with no matchMedia at all (the smoke render, an old browser): anchored', () => {
    render(<Menu sheet onDismiss={vi.fn()} />)
    expect(screen.getByRole('menu').dataset.docked).toBe('false')
  })

  it('is dismissed the same way docked: Escape, and a press outside it', () => {
    viewport(true)
    const onDismiss = vi.fn()
    render(<Menu sheet onDismiss={onDismiss} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledTimes(1)
    // On the dim behind it — anywhere that is neither the trigger nor the panel.
    fireEvent.mouseDown(document.body)
    expect(onDismiss).toHaveBeenCalledTimes(2)
    // Not on the panel itself.
    fireEvent.mouseDown(screen.getByRole('menu'))
    expect(onDismiss).toHaveBeenCalledTimes(2)
  })
})
