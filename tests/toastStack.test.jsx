/* ToastStack — real ToastProvider + ToastStack together, not mocked (every
 * other test touching toasts mocks useToast entirely, so nothing else
 * exercises this rendering logic at all). The one behaviour worth watching
 * run: each tone gets its OWN full-color surface, not just an icon tint —
 * error red, warning amber, success/undo green — so the three read apart
 * from across the room. See ToastStack.jsx's TONE map and shell.css's
 * .toast--success/.toast--warning/.banner--error for the actual colors.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ToastProvider, useToast } from '../src/state/ToastContext.jsx'
import { ToastStack } from '../src/components/shell/ToastStack.jsx'

function Trigger() {
  const { pushError, pushWarning, pushSuccess, pushUndo } = useToast()
  return (
    <>
      <button type="button" onClick={() => pushError('Something failed.')}>
        Fire error
      </button>
      <button type="button" onClick={() => pushWarning('Partly worked.')}>
        Fire warning
      </button>
      <button type="button" onClick={() => pushSuccess('Saved.')}>
        Fire success
      </button>
      <button type="button" onClick={() => pushUndo('Removed.', () => {})}>
        Fire undo
      </button>
    </>
  )
}

function renderStack() {
  render(
    <ToastProvider>
      <Trigger />
      <ToastStack />
    </ToastProvider>,
  )
}

describe('ToastStack', () => {
  it('an error toast gets the red banner surface and an alert role', () => {
    renderStack()
    fireEvent.click(screen.getByText('Fire error'))

    const toast = screen.getByRole('alert')
    expect(toast.className).toContain('banner--error')
    expect(screen.getByText('Something failed.')).toBeTruthy()
  })

  it('a warning toast gets its own amber surface, distinct from error', () => {
    renderStack()
    fireEvent.click(screen.getByText('Fire warning'))

    const toast = screen.getByText('Partly worked.').closest('p')
    expect(toast.className).toContain('toast--warning')
    expect(toast.className).not.toContain('banner--error')
  })

  it('a success toast gets its own green surface', () => {
    renderStack()
    fireEvent.click(screen.getByText('Fire success'))

    const toast = screen.getByText('Saved.').closest('p')
    expect(toast.className).toContain('toast--success')
  })

  it('an undo toast shares the success (green) surface, plus its action button', () => {
    renderStack()
    fireEvent.click(screen.getByText('Fire undo'))

    const toast = screen.getByText('Removed.').closest('p')
    expect(toast.className).toContain('toast--success')
    expect(screen.getByText('Undo')).toBeTruthy()
  })
})
