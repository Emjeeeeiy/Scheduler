/* The bottom bar's centre + opens this: the four things you start from nothing.
 * Worth pinning: that each row starts the right thing, that choosing one closes
 * the sheet first (the action usually opens another dialog, and two modals up at
 * once would put two Escape handlers on the window), and that Ask AI is still
 * offered — with the reason — before the email is confirmed, since the chat is
 * where the fix is. How it LOOKS (a bottom sheet) is modals.css, checked by eye.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreateSheet } from '../src/components/shell/CreateSheet.jsx'

afterEach(cleanup)

function mount(props = {}) {
  const on = {
    onClose: vi.fn(),
    onNewTask: vi.fn(),
    onNewEvent: vi.fn(),
    onNewNote: vi.fn(),
    onAskAi: vi.fn(),
  }
  render(<CreateSheet {...on} emailVerified {...props} />)
  return on
}

const rowNames = () =>
  screen
    .getAllByRole('button')
    .map((button) => button.querySelector('.create-sheet__label')?.textContent)
    .filter(Boolean)

describe('CreateSheet', () => {
  it('is a dialog named Create, with its own Close', () => {
    const on = mount()
    expect(screen.getByRole('dialog', { name: 'Create' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(on.onClose).toHaveBeenCalledTimes(1)
  })

  it('offers a task, an event, a note and Ask AI, in that order', () => {
    mount()
    expect(rowNames()).toEqual(['New task', 'New event', 'New note', 'Ask AI'])
  })

  it.each([
    ['New task', 'onNewTask'],
    ['New event', 'onNewEvent'],
    ['New note', 'onNewNote'],
    ['Ask AI', 'onAskAi'],
  ])('%s starts that, and closes the sheet first', (name, handler) => {
    const calls = []
    const on = mount({
      onClose: vi.fn(() => calls.push('close')),
      [handler]: vi.fn(() => calls.push(handler)),
    })
    const row = screen.getAllByRole('button').find((b) => b.querySelector('.create-sheet__label')?.textContent === name)
    fireEvent.click(row)
    expect(calls).toEqual(['close', handler])
    // And nothing else was started.
    for (const other of ['onNewTask', 'onNewEvent', 'onNewNote', 'onAskAi'].filter((key) => key !== handler)) {
      expect(on[other]).not.toHaveBeenCalled()
    }
  })

  it('closes when the dim behind it is pressed, and not when the sheet itself is', () => {
    const on = mount()
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(on.onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(screen.getByRole('presentation'))
    expect(on.onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape, like every dialog', () => {
    const on = mount()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(on.onClose).toHaveBeenCalledTimes(1)
  })

  describe('before the email address is confirmed', () => {
    it('still offers Ask AI, and says why it is not ready', () => {
      const on = mount({ emailVerified: false })
      expect(screen.getByText('Confirm your email to use')).toBeTruthy()
      fireEvent.click(screen.getByText('Ask AI'))
      // The chat is where the explanation and the "Resend email" button are.
      expect(on.onAskAi).toHaveBeenCalledTimes(1)
    })

    it('says the usual thing once it is confirmed', () => {
      mount({ emailVerified: true })
      expect(screen.getByText('Describe it, AI schedules it')).toBeTruthy()
      expect(screen.queryByText('Confirm your email to use')).toBeNull()
    })
  })
})
