/* DOM behaviour for useModalA11y — the one hook in this app that genuinely
 * needs a browser-shaped environment to prove anything (focus and Tab order
 * do not exist in a pure-logic test, and don't run at all under the SSR
 * smoke render, since effects never fire there). Kept narrow and separate
 * from `npm test` on purpose — see vitest.config.js.
 */
import { useRef, useState } from 'react'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useModalA11y } from '../src/lib/useModalA11y.js'

function TestPanel({ onClose, initialFocusRef, escapeDisabled }) {
  const panelRef = useRef(null)
  useModalA11y(panelRef, { onClose, initialFocusRef, escapeDisabled })
  return (
    <div ref={panelRef} role="dialog">
      <button>First</button>
      <button>Middle</button>
      <button>Last</button>
    </div>
  )
}

describe('useModalA11y', () => {
  it('focuses the first focusable element on mount', async () => {
    render(<TestPanel onClose={vi.fn()} />)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByText('First')))
  })

  it('focuses a given initialFocusRef instead of the first element', async () => {
    function Wrapper() {
      const panelRef = useRef(null)
      const middleRef = useRef(null)
      useModalA11y(panelRef, { onClose: vi.fn(), initialFocusRef: middleRef })
      return (
        <div ref={panelRef}>
          <button>First</button>
          <button ref={middleRef}>Middle</button>
          <button>Last</button>
        </div>
      )
    }
    render(<Wrapper />)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByText('Middle')))
  })

  it('wraps Tab from the last element back to the first', async () => {
    render(<TestPanel onClose={vi.fn()} />)
    const first = screen.getByText('First')
    const last = screen.getByText('Last')
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
  })

  it('wraps Shift+Tab from the first element back to the last', async () => {
    render(<TestPanel onClose={vi.fn()} />)
    const first = screen.getByText('First')
    const last = screen.getByText('Last')
    first.focus()
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(<TestPanel onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores Escape while escapeDisabled is true', async () => {
    const onClose = vi.fn()
    render(<TestPanel onClose={onClose} escapeDisabled />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('restores focus to the trigger element once the dialog closes', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <div>
          <button onClick={() => setOpen(true)}>Open</button>
          {open && <TestPanel onClose={() => setOpen(false)} />}
        </div>
      )
    }
    render(<Harness />)
    const opener = screen.getByText('Open')
    opener.focus()
    expect(document.activeElement).toBe(opener)

    fireEvent.click(opener)
    // Wait for the dialog's own initial-focus effect to actually land before
    // closing it — the hook only restores focus if it finds itself still
    // holding it at the moment the dialog unmounts.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByText('First')))

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })
})
