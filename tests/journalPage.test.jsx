/* The Journal page as a whole, on the in-memory store the smoke build uses: the
 * list beside the open note. What is worth pinning is the arrangement the page
 * was cleaned up into —
 *
 * - the list is there until the writer hides it (it used to hide itself on any
 *   screen under 1500px, leaving no visible way to move between notes);
 * - the empty state is one line: the list beside it already has New note and Today;
 * - an open note has one header row — title, short status, list toggle, Pin,
 *   Trash — and its details (edited, word count) under the sheet, not above it;
 * - a note is pinned from its header, and the list regroups.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { JournalView } from '../src/components/views/JournalView.jsx'
import { ThemeProvider } from '../src/state/ThemeContext.jsx'
import { resetMockJournal } from './smoke/mockJournal.js'
import { installProseMirrorDom } from './helpers/prosemirrorDom.js'

const toast = vi.hoisted(() => ({ pushError: vi.fn(), pushSuccess: vi.fn(), pushUndo: vi.fn() }))

vi.mock('../src/state/useJournal.js', async () => import('./smoke/mockJournal.js'))
vi.mock('../src/state/ToastContext.jsx', () => ({ useToast: () => toast }))
vi.mock('../src/state/SettingsContext.jsx', () => ({
  useSettings: () => ({ settings: { journalPaper: null }, updateSetting: vi.fn() }),
}))
vi.mock('../src/lib/journalFonts.js', async (importOriginal) => ({
  ...(await importOriginal()),
  loadJournalFonts: vi.fn(),
}))

beforeAll(installProseMirrorDom)
beforeEach(() => {
  resetMockJournal()
  localStorage.clear()
  toast.pushError.mockReset()
  toast.pushSuccess.mockReset()
  toast.pushUndo.mockReset()
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

const page = () =>
  render(
    <ThemeProvider>
      <JournalView />
    </ThemeProvider>,
  )

const rowTitles = (container) => [...container.querySelectorAll('.note-row__name')].map((el) => el.textContent)

async function open(container, title) {
  const row = [...container.querySelectorAll('.note-row__open')].find((el) => el.textContent.includes(title))
  fireEvent.click(row)
  await waitFor(() => expect(container.querySelector('.note-head')).toBeTruthy())
}

describe('the page', () => {
  it('keeps the list beside the note until the writer hides it, whatever the window width', () => {
    window.innerWidth = 1300 // under the old 1500px "step aside" rule
    const { container } = page()
    expect(container.querySelector('.journal').getAttribute('data-list-hidden')).toBe('false')
  })

  it('has a one-line empty state, with no second title and no second pair of buttons', () => {
    const { container } = page()
    expect(screen.getByText('Select a note, or start a new one.')).toBeTruthy()
    expect(screen.queryByText('Your journal')).toBeNull()
    expect(screen.getAllByRole('button', { name: /New note/ })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Today' })).toHaveLength(1)
    expect(container.querySelector('.journal__main .primary-button')).toBeNull()
    expect(container.querySelector('.journal__main button')).toBeNull()
  })

  it('names the list "Notes" and does not repeat "Journal" or count them', () => {
    page()
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Journal' })).toBeNull()
    expect(screen.queryByText(/\d+ notes?$/)).toBeNull()
  })

  it('groups the pinned note, and leads the list with it', () => {
    const { container } = page()
    expect(rowTitles(container)).toEqual(['Trip to Cebu', 'Untitled', 'Reading list'])
    expect([...container.querySelectorAll('.note-list__label')].map((el) => el.textContent)).toEqual(['Pinned', 'Recent'])
  })
})

describe('an open note', () => {
  it('has one header row: the title, a short status, and Pin and Trash', async () => {
    const { container } = page()
    await open(container, 'Trip to Cebu')
    const head = container.querySelector('.note-head')
    expect(head.querySelector('input.note-title').value).toBe('Trip to Cebu')
    expect(head.querySelector('.note-head__status').textContent).toBe('Saved')
    expect(within(head).getByRole('button', { name: 'Unpin note' })).toBeTruthy() // it is pinned
    expect(within(head).getByRole('button', { name: 'Move note to trash' })).toBeTruthy()
    expect(within(head).getByRole('button', { name: 'Hide note list' })).toBeTruthy()
    expect(within(head).getByRole('button', { name: 'Back to all notes' })).toBeTruthy()
    expect(within(head).getByRole('button', { name: 'Exit note' })).toBeTruthy()
  })

  it('has no details line above the sheet — it is under it', async () => {
    const { container } = page()
    await open(container, 'Trip to Cebu')
    expect(container.querySelector('.note-meta')).toBeNull()
    const foot = container.querySelector('.note-foot')
    expect(foot).toBeTruthy()
    expect(foot.textContent).toMatch(/Edited/)
    await waitFor(() => expect(foot.textContent).toMatch(/\d+ words?/))
    // Under the sheet, not between the title and the toolbar.
    const surface = container.querySelector('.note-surface')
    const order = [...surface.children].map((el) => el.className.split(' ')[0])
    expect(order.indexOf('note-foot')).toBeGreaterThan(order.indexOf('note-sheet-wrap'))
    expect(order.indexOf('note-head')).toBeLessThan(order.indexOf('journal-toolbar'))
  })

  it('hides and shows the list from its header', async () => {
    const { container } = page()
    await open(container, 'Trip to Cebu')
    const journal = container.querySelector('.journal')
    fireEvent.click(screen.getByRole('button', { name: 'Hide note list' }))
    expect(journal.getAttribute('data-list-hidden')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Show note list' }))
    expect(journal.getAttribute('data-list-hidden')).toBe('false')
  })

  it('is pinned from its header, and the list regroups', async () => {
    const { container } = page()
    await open(container, 'Reading list')
    fireEvent.click(within(container.querySelector('.note-head')).getByRole('button', { name: 'Pin note' }))
    await waitFor(() => {
      const [pinned] = [...container.querySelectorAll('.note-list__group')]
      expect(rowTitles(pinned).sort()).toEqual(['Reading list', 'Trip to Cebu'])
    })
  })

  it('goes to the trash from its header, with a way to undo it, and leaves the list', async () => {
    const { container } = page()
    await open(container, 'Reading list')
    await act(async () => {
      fireEvent.click(within(container.querySelector('.note-head')).getByRole('button', { name: 'Move note to trash' }))
    })
    expect(toast.pushUndo).toHaveBeenCalledTimes(1)
    expect(toast.pushUndo.mock.calls[0][0]).toContain('Reading list')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Trash · 2' })).toBeTruthy())
    expect(rowTitles(container)).not.toContain('Reading list')
  })
})
