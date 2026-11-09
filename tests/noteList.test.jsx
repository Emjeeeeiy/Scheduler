/* The list of notes was crowded and said everything twice: "Journal" beside a
 * count under it and a count on a chip, a row of All / Pinned / Trash chips for
 * what is really a group and a place, a pin button on every row beside the pin in
 * the note's own header, and New note / Today offered again in the empty state.
 * These pin the cleaned-up list:
 *
 * - a header (the name, Today, New note), a search field, the notes, and a quiet
 *   way into the trash at the foot — and none of the old furniture;
 * - "Pinned" and "Notes" groups only when there are pinned notes to set apart;
 * - the trash is a place with a way back, not a filter, and it empties out the
 *   way a place does: when its last note leaves, the list is the notes again.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeNote, sortNotes } from '@cadence/shared/journal.js'
import { NoteList } from '../src/components/journal/NoteList.jsx'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 6, 7, 0, 0)

const note = (id, fields = {}) =>
  normalizeNote(id, {
    title: id,
    excerpt: `About ${id}`,
    createdAt: NOW - DAY,
    updatedAt: NOW - 3_600_000,
    deletedAt: null,
    ...fields,
  })

const handlers = () => ({
  onSelect: vi.fn(),
  onNew: vi.fn(),
  onToday: vi.fn(),
  onRestore: vi.fn(),
  onPurge: vi.fn(),
  onEmptyTrash: vi.fn(),
})

function mount({ notes = [], trashed = [], selectedId = null, loading = false, error = null, ...rest } = {}) {
  const calls = handlers()
  const props = { notes: sortNotes(notes), trashed, selectedId, loading, error, ...calls, ...rest }
  const view = render(<NoteList {...props} />)
  return { ...view, calls, update: (next) => view.rerender(<NoteList {...props} {...next} />) }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(NOW))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const rowTitles = (container) => [...container.querySelectorAll('.note-row__name')].map((el) => el.textContent)
const labels = (container) => [...container.querySelectorAll('.note-list__label')].map((el) => el.textContent)

describe('the header', () => {
  it('names the list and offers the two ways to start a note — once', () => {
    const { calls } = mount({ notes: [note('Alpha')] })
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /New note/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(calls.onNew).toHaveBeenCalledTimes(1)
    expect(calls.onToday).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('button', { name: /New note/ })).toHaveLength(1)
  })

  it('has no count under the title and no row of filter chips', () => {
    const { container } = mount({ notes: [note('A'), note('B'), note('C')], trashed: [note('D', { deletedAt: NOW })] })
    expect(screen.queryByText(/3 notes/)).toBeNull()
    expect(container.querySelector('.filter-row')).toBeNull()
    expect(container.querySelector('.filter-chip')).toBeNull()
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Pinned/ })).toBeNull()
  })

  it('keeps "New note" the one primary button', () => {
    const { container } = mount({ notes: [note('Alpha')] })
    expect(container.querySelectorAll('.primary-button')).toHaveLength(1)
  })
})

describe('the notes', () => {
  it('lists them with no group labels when none is pinned', () => {
    const { container } = mount({ notes: [note('Alpha'), note('Beta', { updatedAt: NOW - 2 * DAY })] })
    expect(labels(container)).toEqual([])
    expect(rowTitles(container)).toEqual(['Alpha', 'Beta'])
  })

  it('sets the pinned ones apart under a "Pinned" label, and the rest under "Recent"', () => {
    const { container } = mount({
      notes: [note('Alpha'), note('Beta', { pinned: true, updatedAt: NOW - 5 * DAY }), note('Gamma', { updatedAt: NOW - 2 * DAY })],
    })
    expect(labels(container)).toEqual(['Pinned', 'Recent'])
    const [pinned, others] = [...container.querySelectorAll('.note-list__group')]
    expect(rowTitles(pinned)).toEqual(['Beta'])
    expect(rowTitles(others)).toEqual(['Alpha', 'Gamma'])
  })

  it('has no "Recent" label when everything is pinned', () => {
    const { container } = mount({ notes: [note('Alpha', { pinned: true })] })
    expect(labels(container)).toEqual(['Pinned'])
  })

  it('marks a pinned row with a pin, and no row with a pin button', () => {
    const { container } = mount({ notes: [note('Alpha', { pinned: true }), note('Beta')] })
    const rows = container.querySelectorAll('.note-row')
    expect(rows[0].querySelector('.note-row__pin-mark')).toBeTruthy()
    expect(rows[0].textContent).toContain('Pinned')
    expect(rows[1].querySelector('.note-row__pin-mark')).toBeNull()
    expect(screen.queryByRole('button', { name: /^(Un)?[Pp]in / })).toBeNull()
    expect(container.querySelector('.note-row__pin')).toBeNull()
  })

  it('shows the title, the time it was edited and a line of excerpt on a row', () => {
    const { container } = mount({ notes: [note('Alpha', { excerpt: 'First line of the note' })] })
    const row = container.querySelector('.note-row')
    expect(row.querySelector('.note-row__name').textContent).toBe('Alpha')
    expect(row.querySelector('.note-row__time').textContent).not.toBe('')
    expect(row.querySelector('.note-row__excerpt').textContent).toBe('First line of the note')
  })

  it('says so for a note with no text, and gives an unnamed one its placeholder name', () => {
    const { container } = mount({ notes: [note('x1', { title: '', excerpt: '' })] })
    expect(container.querySelector('.note-row__excerpt').textContent).toBe('No text yet')
    expect(container.querySelector('.note-row__name').textContent).toBe('Untitled')
  })

  it('marks a note that holds a drawing', () => {
    const { container } = mount({ notes: [note('Sketch', { hasDrawing: true })] })
    expect(container.querySelector('.note-row__glyph')).toBeTruthy()
    expect(screen.getByText('Contains a drawing')).toBeTruthy()
  })

  it('opens a note on a click, and marks the open one', () => {
    const { container, calls } = mount({ notes: [note('Alpha'), note('Beta')], selectedId: 'Beta' })
    const rows = container.querySelectorAll('.note-row__open')
    expect(rows[1].getAttribute('aria-current')).toBe('true')
    expect(rows[0].getAttribute('aria-current')).toBeNull()
    fireEvent.click(rows[0])
    expect(calls.onSelect).toHaveBeenCalledWith('Alpha')
  })

  it('says there are no notes yet, once it has finished loading', () => {
    mount({ notes: [] })
    expect(screen.getByText(/No notes yet/)).toBeTruthy()
  })

  it('does not say so while it is still loading', () => {
    mount({ notes: [], loading: true })
    expect(screen.queryByText(/No notes yet/)).toBeNull()
  })

  it('shows a load error', () => {
    mount({ notes: [], error: 'Could not load your notes.' })
    expect(screen.getByRole('alert').textContent).toContain('Could not load')
  })
})

describe('search', () => {
  const notes = [note('Alpha', { excerpt: 'groceries' }), note('Beta', { pinned: true, excerpt: 'travel plans' })]

  it('narrows the list, and drops the group labels while it does', () => {
    const { container } = mount({ notes })
    expect(labels(container)).toEqual(['Pinned', 'Recent'])
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'grocer' } })
    expect(rowTitles(container)).toEqual(['Alpha'])
    expect(labels(container)).toEqual([])
  })

  it('says when nothing matches', () => {
    mount({ notes })
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } })
    expect(screen.getByText('No notes match that search.')).toBeTruthy()
  })
})

describe('the trash', () => {
  const gone = [note('Old draft', { deletedAt: NOW - 3_600_000 }), note('Older', { deletedAt: NOW - 2 * DAY })]

  it('is a quiet line at the foot of the list, with its count — and only when there is something in it', () => {
    const first = mount({ notes: [note('Alpha')], trashed: gone })
    expect(screen.getByRole('button', { name: 'Trash · 2' })).toBeTruthy()
    first.unmount()

    mount({ notes: [note('Alpha')], trashed: [] })
    expect(screen.queryByText(/^Trash/)).toBeNull()
  })

  it('opens as a place with a way back, and no longer offers New note there', () => {
    const { container } = mount({ notes: [note('Alpha')], trashed: gone })
    fireEvent.click(screen.getByRole('button', { name: 'Trash · 2' }))
    expect(rowTitles(container)).toEqual(['Old draft', 'Older'])
    expect(screen.getByRole('button', { name: /Notes/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /New note/ })).toBeNull()
    expect(screen.getByText(/stay here until you delete them forever/)).toBeTruthy()
    // And back again.
    fireEvent.click(screen.getByRole('button', { name: /Notes/ }))
    expect(rowTitles(container)).toEqual(['Alpha'])
  })

  it('restores a note', () => {
    const { calls } = mount({ notes: [], trashed: gone })
    fireEvent.click(screen.getByRole('button', { name: 'Trash · 2' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[0])
    expect(calls.onRestore).toHaveBeenCalledWith(expect.objectContaining({ id: 'Old draft' }))
  })

  it('asks before deleting for good, and can be talked out of it', () => {
    const { calls } = mount({ notes: [], trashed: gone })
    fireEvent.click(screen.getByRole('button', { name: 'Trash · 2' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete…' })[0])
    expect(calls.onPurge).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getAllByRole('button', { name: 'Delete…' })).toHaveLength(2)

    fireEvent.click(screen.getAllByRole('button', { name: 'Delete…' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }))
    expect(calls.onPurge).toHaveBeenCalledTimes(1)
  })

  it('asks before emptying it', () => {
    const { calls } = mount({ notes: [], trashed: gone })
    fireEvent.click(screen.getByRole('button', { name: 'Trash · 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Empty trash…' }))
    expect(calls.onEmptyTrash).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete all forever' }))
    expect(calls.onEmptyTrash).toHaveBeenCalledTimes(1)
  })

  it('searches the trash, not the notes', () => {
    const { container } = mount({ notes: [note('Alpha')], trashed: gone })
    fireEvent.click(screen.getByRole('button', { name: 'Trash · 2' }))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'older' } })
    expect(rowTitles(container)).toEqual(['Older'])
  })

  it('goes back to the notes by itself when its last note leaves', () => {
    const only = [note('Old draft', { deletedAt: NOW })]
    const { container, update } = mount({ notes: [note('Alpha')], trashed: only })
    fireEvent.click(screen.getByRole('button', { name: 'Trash · 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    update({ notes: sortNotes([note('Alpha'), note('Old draft')]), trashed: [] })
    expect(within(container).getByRole('heading', { name: 'Notes' })).toBeTruthy()
    expect(rowTitles(container)).toEqual(['Alpha', 'Old draft'])
  })

  it('does not spring open the next time something is thrown away', () => {
    const only = [note('Old draft', { deletedAt: NOW })]
    const { container, update } = mount({ notes: [note('Alpha')], trashed: only })
    fireEvent.click(screen.getByRole('button', { name: 'Trash · 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    update({ notes: sortNotes([note('Alpha'), note('Old draft')]), trashed: [] })
    // A note is thrown away somewhere else — the list is still the notes.
    update({ notes: [note('Alpha')], trashed: [note('Old draft', { deletedAt: NOW })] })
    expect(within(container).getByRole('heading', { name: 'Notes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Trash · 1' })).toBeTruthy()
  })
})
