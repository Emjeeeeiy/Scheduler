/* What a finger can do on the Journal's list of notes, and — as important — what it
 * can't do by accident. A thumb is also what scrolls the page, so:
 *
 * - swiping a row left shows a trash button at its right, swiping it right shows a
 *   pin button at its left; the swipe only SHOWS the button, so a slip deletes
 *   nothing, and a short swipe springs shut;
 * - a scroll (mostly vertical travel) is left to the browser and does nothing here;
 * - the release that ends a swipe or a hold does not also open the note;
 * - one row is open at a time, and a tap anywhere else shuts it;
 * - holding a row for about half a second starts choosing several: boxes appear,
 *   the header becomes Cancel / a count / Pin / Delete, and the same gestures are
 *   off until it ends;
 * - a mouse is untouched: it clicks, nothing more.
 *
 * NoteList is pure presentation (every action is a callback), so it is rendered
 * bare. The gestures are driven with pointer events the way the grid's touch tests
 * drive them; the hold is the fake clock moving, not a wait.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeNote, sortNotes } from '@cadence/shared/journal.js'
import { NoteList } from '../src/components/journal/NoteList.jsx'

const NOW = Date.UTC(2026, 10, 6, 7, 0, 0)
const HOUR = 3_600_000

// Distinct edit times, so the list order is the order they are written in.
const note = (id, fields = {}) =>
  normalizeNote(id, {
    title: id,
    excerpt: `About ${id}`,
    createdAt: NOW - 48 * HOUR,
    updatedAt: NOW - { Alpha: 1, Bravo: 2, Charlie: 3 }[id] * HOUR,
    deletedAt: null,
    ...fields,
  })

const handlers = () => ({
  onSelect: vi.fn(),
  onNew: vi.fn(),
  onToday: vi.fn(),
  onPin: vi.fn(),
  onTrash: vi.fn(),
  onPinMany: vi.fn(),
  onTrashMany: vi.fn(),
  onRestore: vi.fn(),
  onPurge: vi.fn(),
  onEmptyTrash: vi.fn(),
})

function mount({ notes = [note('Alpha'), note('Bravo'), note('Charlie')], trashed = [] } = {}) {
  const calls = handlers()
  const view = render(
    <NoteList notes={sortNotes(notes)} trashed={trashed} selectedId={null} loading={false} error={null} {...calls} />,
  )
  return { ...view, calls }
}

const touch = (type, element, init = {}) =>
  fireEvent[type](element, { pointerType: 'touch', pointerId: 1, isPrimary: true, button: 0, ...init })
const mouse = (type, element, init = {}) =>
  fireEvent[type](element, { pointerType: 'mouse', pointerId: 1, button: 0, ...init })

const rows = (container) => [...container.querySelectorAll('.note-row__open')]
const wait = (ms) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
/** Long enough for a row that was shut to finish sliding home. */
const settle = () => wait(400)

/** A finger down, across `dx` / `dy` px, and up — one move, which is all a swipe needs. */
function swipe(row, dx, dy = 0) {
  touch('pointerDown', row, { clientX: 200, clientY: 100 })
  touch('pointerMove', row, { clientX: 200 + dx, clientY: 100 + dy })
  touch('pointerUp', row, { clientX: 200 + dx, clientY: 100 + dy })
}

/** A finger down and still, for `ms`. Not released — see `release`. */
function press(row, ms = 500) {
  touch('pointerDown', row, { clientX: 200, clientY: 100 })
  wait(ms)
}

/** The lift and the click a browser sends after it. */
function release(row) {
  touch('pointerUp', row, { clientX: 200, clientY: 100 })
  fireEvent.click(row)
}

const revealButtons = (container) => [...container.querySelectorAll('.note-row__reveal-button')]
const chosen = (container) =>
  rows(container).filter((row) => row.getAttribute('aria-checked') === 'true').map((row) => row.textContent)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(NOW))
  Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), configurable: true, writable: true })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('swiping a row', () => {
  it('left shows a trash button at the right, and the button — not the swipe — deletes', () => {
    const { container, calls } = mount()
    swipe(rows(container)[0], -60)

    const button = screen.getByRole('button', { name: 'Delete “Alpha”' })
    expect(container.querySelector('.note-row__reveal--trash')).toBeTruthy()
    expect(rows(container)[0].style.getPropertyValue('--swipe')).toBe('-72px')
    // Nothing is deleted by the swipe itself.
    expect(calls.onTrash).not.toHaveBeenCalled()

    fireEvent.click(button)
    expect(calls.onTrash).toHaveBeenCalledTimes(1)
    expect(calls.onTrash.mock.calls[0][0].id).toBe('Alpha')
  })

  it('right shows a pin button at the left, and says Unpin for a note that is pinned', () => {
    const { container, calls } = mount({ notes: [note('Alpha'), note('Bravo', { pinned: true })] })
    // Bravo is pinned, so it sorts first.
    const [pinned, plain] = rows(container)

    swipe(plain, 60)
    expect(container.querySelector('.note-row__reveal--pin')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pin “Alpha”' }))
    expect(calls.onPin.mock.calls[0][0].id).toBe('Alpha')

    settle()
    swipe(pinned, 60)
    expect(screen.getByRole('button', { name: 'Unpin “Bravo”' })).toBeTruthy()
  })

  it('follows the finger while it is down, and gives only a little past the action', () => {
    const { container } = mount()
    const row = rows(container)[0]
    touch('pointerDown', row, { clientX: 200, clientY: 100 })
    touch('pointerMove', row, { clientX: 150, clientY: 100 })
    expect(row.style.getPropertyValue('--swipe')).toBe('-50px')
    expect(container.querySelector('.note-row--dragging')).toBeTruthy()

    touch('pointerMove', row, { clientX: -400, clientY: 100 })
    expect(parseFloat(row.style.getPropertyValue('--swipe'))).toBeCloseTo(-86.4, 5) // 72 * 1.2
  })

  it('springs shut when it was not pulled far enough, and shows nothing once home', () => {
    const { container } = mount()
    swipe(rows(container)[0], -20)
    settle()
    expect(revealButtons(container)).toHaveLength(0)
    expect(rows(container)[0].style.getPropertyValue('--swipe')).toBe('')
  })

  it('keeps the action under the row while it slides home, so nothing blinks', () => {
    const { container } = mount()
    swipe(rows(container)[0], -20) // opened a little, then let go
    expect(container.querySelector('.note-row__reveal')).toBeTruthy()
    settle()
    expect(container.querySelector('.note-row__reveal')).toBeNull()
  })

  it('is a scroll, and does nothing, when the finger travels mostly up or down', () => {
    const { container } = mount()
    swipe(rows(container)[0], 8, 60)
    settle()
    expect(revealButtons(container)).toHaveLength(0)
    wait(600) // and it never turns into a hold either
    expect(container.querySelector('.note-row--picking')).toBeNull()
  })

  it('does not open the note when the finger lifts, however the browser reports it', () => {
    const { container, calls } = mount()
    swipe(rows(container)[0], -20)
    fireEvent.click(rows(container)[0]) // the click some browsers still send
    expect(calls.onSelect).not.toHaveBeenCalled()

    settle()
    fireEvent.click(rows(container)[0]) // a real tap, a moment later
    expect(calls.onSelect).toHaveBeenCalledTimes(1)
  })

  it('shuts an open row on a tap rather than opening the note from under its action', () => {
    const { container, calls } = mount()
    swipe(rows(container)[0], -60)
    settle() // past the click guard
    fireEvent.click(rows(container)[0])
    expect(calls.onSelect).not.toHaveBeenCalled()
    settle()
    expect(revealButtons(container)).toHaveLength(0)
  })

  it('has one row open at a time', () => {
    const { container } = mount()
    swipe(rows(container)[0], -60)
    swipe(rows(container)[1], 60)
    settle()
    expect(revealButtons(container)).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Pin “Bravo”' })).toBeTruthy()
  })

  it('shuts an open row on a press anywhere else', () => {
    const { container } = mount()
    swipe(rows(container)[0], -60)
    expect(revealButtons(container)).toHaveLength(1)
    fireEvent.pointerDown(document.body, { pointerType: 'touch', pointerId: 2 })
    settle()
    expect(revealButtons(container)).toHaveLength(0)
  })

  it('does nothing for a mouse — it clicks, as it always did', () => {
    const { container, calls } = mount()
    const row = rows(container)[0]
    mouse('pointerDown', row, { clientX: 200, clientY: 100 })
    mouse('pointerMove', row, { clientX: 80, clientY: 100 })
    mouse('pointerUp', row, { clientX: 80, clientY: 100 })
    wait(800)
    expect(revealButtons(container)).toHaveLength(0)
    expect(container.querySelector('.note-row--picking')).toBeNull()
    fireEvent.click(row)
    expect(calls.onSelect).toHaveBeenCalledTimes(1)
  })

  it('is not offered on the trash, whose rows have their own buttons', () => {
    const { container } = mount({ notes: [note('Alpha')], trashed: [note('Gone', { deletedAt: NOW })] })
    fireEvent.click(screen.getByRole('button', { name: 'Trash · 1' }))
    const trashRow = container.querySelector('.note-row--trash .note-row__open')
    swipe(trashRow, -80)
    expect(revealButtons(container)).toHaveLength(0)
  })
})

describe('holding a row', () => {
  it('starts choosing: a box on every row, the held one chosen, and a buzz', () => {
    const { container } = mount()
    press(rows(container)[1])

    expect(rows(container).every((row) => row.getAttribute('role') === 'checkbox')).toBe(true)
    expect(chosen(container)).toHaveLength(1)
    expect(chosen(container)[0]).toContain('Bravo')
    expect(navigator.vibrate).toHaveBeenCalledTimes(1)
    expect(container.querySelectorAll('.note-row__check')).toHaveLength(3)
  })

  it('does not open the note when the finger lifts after the hold', () => {
    const { container, calls } = mount()
    const row = rows(container)[0]
    press(row)
    release(row)
    expect(calls.onSelect).not.toHaveBeenCalled()
    expect(chosen(container)).toHaveLength(1) // and the lift did not unchoose it either
  })

  it('is a tap, not a hold, when the finger lifts early', () => {
    const { container, calls } = mount()
    const row = rows(container)[0]
    press(row, 300)
    release(row)
    expect(container.querySelector('.note-row--picking')).toBeNull()
    expect(calls.onSelect).toHaveBeenCalledTimes(1)
  })

  it('is cancelled by travel — a scroll that began on a row never selects it', () => {
    const { container } = mount()
    const row = rows(container)[0]
    touch('pointerDown', row, { clientX: 200, clientY: 100 })
    touch('pointerMove', row, { clientX: 202, clientY: 140 })
    wait(800)
    expect(container.querySelector('.note-row--picking')).toBeNull()
  })

  it('swaps the header for Cancel, how many, and the two things to do with them', () => {
    const { container } = mount()
    press(rows(container)[0])

    const head = container.querySelector('.note-list__head--picking')
    expect(within(head).getByText('1 selected')).toBeTruthy()
    for (const name of ['Cancel', 'Pin', 'Delete']) expect(within(head).getByRole('button', { name })).toBeTruthy()
    // The row of "start a note" buttons gives way, rather than sitting beside these.
    expect(screen.queryByRole('button', { name: /New note/ })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Notes' })).toBeNull()
  })

  it('lets rows be chosen and unchosen by tapping, and ends when the last is unchosen', () => {
    const { container, calls } = mount()
    press(rows(container)[0])
    release(rows(container)[0])
    wait(400) // a person's next tap comes later than the click guard

    fireEvent.click(rows(container)[1])
    fireEvent.click(rows(container)[2])
    expect(screen.getByText('3 selected')).toBeTruthy()
    expect(calls.onSelect).not.toHaveBeenCalled() // tapping chooses; it does not open

    fireEvent.click(rows(container)[1])
    expect(screen.getByText('2 selected')).toBeTruthy()

    fireEvent.click(rows(container)[0])
    fireEvent.click(rows(container)[2])
    expect(container.querySelector('.note-row--picking')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeTruthy()
  })

  it('pins what is chosen, in list order, and ends', () => {
    const { container, calls } = mount()
    press(rows(container)[2])
    release(rows(container)[2])
    fireEvent.click(rows(container)[0])

    fireEvent.click(screen.getByRole('button', { name: 'Pin' }))
    expect(calls.onPinMany).toHaveBeenCalledTimes(1)
    expect(calls.onPinMany.mock.calls[0][0].map((n) => n.id)).toEqual(['Alpha', 'Charlie'])
    expect(container.querySelector('.note-row--picking')).toBeNull()
  })

  it('offers Unpin when everything chosen is pinned already', () => {
    const { container } = mount({ notes: [note('Alpha', { pinned: true }), note('Bravo', { pinned: true }), note('Charlie')] })
    press(rows(container)[0])
    release(rows(container)[0])
    fireEvent.click(rows(container)[1])
    expect(screen.getByRole('button', { name: 'Unpin' })).toBeTruthy()

    fireEvent.click(rows(container)[2]) // a note that is not pinned joins the set
    expect(screen.getByRole('button', { name: 'Pin' })).toBeTruthy()
  })

  it('deletes what is chosen, in list order, and ends', () => {
    const { container, calls } = mount()
    press(rows(container)[1])
    release(rows(container)[1])
    fireEvent.click(rows(container)[0])

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(calls.onTrashMany).toHaveBeenCalledTimes(1)
    expect(calls.onTrashMany.mock.calls[0][0].map((n) => n.id)).toEqual(['Alpha', 'Bravo'])
    expect(container.querySelector('.note-row--picking')).toBeNull()
  })

  it('ends with Cancel, or with Escape, and changes nothing', () => {
    const { container, calls } = mount()
    press(rows(container)[0])
    release(rows(container)[0])
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(container.querySelector('.note-row--picking')).toBeNull()

    wait(400)
    press(rows(container)[0])
    release(rows(container)[0])
    expect(container.querySelector('.note-row--picking')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(container.querySelector('.note-row--picking')).toBeNull()

    for (const name of ['onPinMany', 'onTrashMany', 'onPin', 'onTrash', 'onSelect']) expect(calls[name]).not.toHaveBeenCalled()
  })

  it('turns swiping off while choosing', () => {
    const { container } = mount()
    press(rows(container)[0])
    release(rows(container)[0])
    swipe(rows(container)[1], -80)
    settle()
    expect(revealButtons(container)).toHaveLength(0)
  })

  it('shuts a row that was open when choosing begins', () => {
    const { container } = mount()
    swipe(rows(container)[0], -60)
    settle()
    press(rows(container)[1])
    settle()
    expect(revealButtons(container)).toHaveLength(0)
    expect(chosen(container)[0]).toContain('Bravo')
  })

  it('ignores a second finger laid down beside the first', () => {
    const { container } = mount()
    const row = rows(container)[0]
    touch('pointerDown', row, { pointerId: 1, clientX: 200, clientY: 100 })
    touch('pointerDown', row, { pointerId: 2, isPrimary: false, clientX: 240, clientY: 100 })
    wait(600)
    expect(chosen(container)).toHaveLength(1) // the first finger's hold, once, not two
    expect(navigator.vibrate).toHaveBeenCalledTimes(1)
  })

  it('is not wedged by a lift that never arrived: the next touch starts fresh', () => {
    const { container } = mount()
    press(rows(container)[0]) // held, and the finger's release is lost
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(container.querySelector('.note-row--picking')).toBeNull()

    press(rows(container)[1])
    expect(chosen(container)[0]).toContain('Bravo')
  })

  it('is left when the trash is opened', () => {
    const { container } = mount({ trashed: [note('Gone', { deletedAt: NOW })] })
    press(rows(container)[0])
    release(rows(container)[0])
    // The trash link lives in the list's foot, which choosing leaves in place.
    fireEvent.click(screen.getByRole('button', { name: 'Trash · 1' }))
    expect(container.querySelector('.note-row--picking')).toBeNull()
  })
})
