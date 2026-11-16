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
import { formatFullDayLabel, todayKey } from '@cadence/shared/date.js'
import { JournalView } from '../src/components/views/JournalView.jsx'
import { ThemeProvider } from '../src/state/ThemeContext.jsx'
import { addMockDayNote, resetMockJournal } from './smoke/mockJournal.js'
import { installProseMirrorDom } from './helpers/prosemirrorDom.js'

const toast = vi.hoisted(() => ({
  pushError: vi.fn(),
  pushSuccess: vi.fn(),
  pushWarning: vi.fn(),
  pushUndo: vi.fn(),
}))
// What the schedule holds for the days under test, and whether the Journal's
// list is still waiting for its first snapshot.
const schedule = vi.hoisted(() => ({
  tasks: {},
  events: {},
  toggleDone: vi.fn(),
  addTask: vi.fn(),
  removeTask: vi.fn(),
  scheduleTask: vi.fn(),
}))
const journalState = vi.hoisted(() => ({ loading: false }))

vi.mock('../src/state/useJournal.js', async () => {
  const store = await import('./smoke/mockJournal.js')
  return {
    ...store,
    // The store answers at once; this holds the list in "first snapshot not here yet".
    useJournalNotes: () => {
      const result = store.useJournalNotes()
      return journalState.loading ? { ...result, loading: true, notes: [], trashed: [] } : result
    },
  }
})
vi.mock('../src/state/ScheduleContext.jsx', () => ({
  useSchedule: () => ({
    tasksOn: (key) => schedule.tasks[key] ?? [],
    eventsOn: (key) => schedule.events[key] ?? [],
    getTag: () => null,
    toggleDone: schedule.toggleDone,
    addTask: schedule.addTask,
    removeTask: schedule.removeTask,
    scheduleTask: schedule.scheduleTask,
  }),
}))
// The open note's schedule tools (Plan it) read the account and may ask the AI;
// neither is what this file is about.
vi.mock('../src/state/AuthContext.jsx', () => ({
  useAuth: () => ({
    emailVerified: true,
    resendVerification: vi.fn(async () => true),
    checkVerification: vi.fn(async () => false),
  }),
}))
vi.mock('../src/lib/aiClient.js', () => ({ notePlanAi: vi.fn(async () => null) }))
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
  toast.pushWarning.mockReset()
  toast.pushUndo.mockReset()
  schedule.tasks = {}
  schedule.events = {}
  schedule.toggleDone.mockReset()
  schedule.addTask.mockReset()
  schedule.removeTask.mockReset()
  schedule.scheduleTask.mockReset()
  journalState.loading = false
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

const view = (props) => (
  <ThemeProvider>
    <JournalView {...props} />
  </ThemeProvider>
)
const page = (props) => render(view(props))

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

/* A note belongs to a day by its dayKey — the Journal's link to the schedule.
   The calendar's "Open journal" buttons arrive as an intent naming a day; a day
   note shows that day back, with the way to it. */
describe('day notes', () => {
  const DAY = '2026-03-02'
  const openRows = (container) => rowTitles(container).filter((title) => title === formatFullDayLabel(DAY))

  it('Today opens the note the day already has, and starts no second one', async () => {
    const key = todayKey()
    addMockDayNote(key, { title: 'My Monday' })
    const { container } = page()
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    await waitFor(() => expect(container.querySelector('input.note-title').value).toBe('My Monday'))
    expect(rowTitles(container).filter((title) => title === formatFullDayLabel(key))).toEqual([])
  })

  it('Today starts a note titled with the date when the day has none', async () => {
    const { container } = page()
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    await waitFor(() => expect(container.querySelector('input.note-title').value).toBe(formatFullDayLabel(todayKey())))
  })

  it('Today pressed before the list has loaded waits, and starts exactly one note', async () => {
    journalState.loading = true
    const { container, rerender } = page()
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    // Nothing is made while the list is unknown: an empty list would say "no note
    // for today" and start a second one beside the one that is about to arrive.
    expect(container.querySelector('.note-head')).toBeNull()

    addMockDayNote(todayKey(), { title: 'Already there' })
    journalState.loading = false
    rerender(view())
    await waitFor(() => expect(container.querySelector('input.note-title').value).toBe('Already there'))
    expect(rowTitles(container).filter((title) => title === formatFullDayLabel(todayKey()))).toEqual([])
  })

  describe('asked for from the schedule', () => {
    it('opens the note a day has', async () => {
      addMockDayNote(DAY, { title: 'Moving day' })
      const onIntentHandled = vi.fn()
      const { container } = page({ intent: { kind: 'day', dayKey: DAY }, onIntentHandled })
      await waitFor(() => expect(container.querySelector('input.note-title').value).toBe('Moving day'))
      expect(onIntentHandled).toHaveBeenCalledTimes(1)
      expect(openRows(container)).toEqual([])
    })

    it('starts one, titled with the date and linked to it, when the day has none', async () => {
      const onIntentHandled = vi.fn()
      const { container } = page({ intent: { kind: 'day', dayKey: DAY }, onIntentHandled })
      await waitFor(() => expect(container.querySelector('input.note-title').value).toBe(formatFullDayLabel(DAY)))
      expect(onIntentHandled).toHaveBeenCalledTimes(1)
      // Linked by day, so it is the one the next ask finds — and it has its band.
      expect(container.querySelector('.note-day')).toBeTruthy()
      expect(openRows(container)).toHaveLength(1)
    })

    it('waits for the list to load before deciding', async () => {
      journalState.loading = true
      addMockDayNote(DAY, { title: 'Moving day' })
      const onIntentHandled = vi.fn()
      const { container, rerender } = page({ intent: { kind: 'day', dayKey: DAY }, onIntentHandled })
      expect(container.querySelector('.note-head')).toBeNull()
      expect(onIntentHandled).not.toHaveBeenCalled()

      journalState.loading = false
      rerender(view({ intent: { kind: 'day', dayKey: DAY }, onIntentHandled }))
      await waitFor(() => expect(container.querySelector('input.note-title').value).toBe('Moving day'))
      expect(openRows(container)).toEqual([])
    })

    it('ignores a day that is not a date, and still clears the intent', async () => {
      const onIntentHandled = vi.fn()
      const { container } = page({ intent: { kind: 'day', dayKey: 'someday' }, onIntentHandled })
      await waitFor(() => expect(onIntentHandled).toHaveBeenCalledTimes(1))
      expect(container.querySelector('.note-head')).toBeNull()
      expect(rowTitles(container)).toEqual(['Trip to Cebu', 'Untitled', 'Reading list'])
    })
  })

  describe('the band under a day note’s header', () => {
    const water = { id: 't1', title: 'Water the plants', startMin: 540, durationMin: 30, done: false, tagId: null }
    const standup = { id: 't2', title: 'Stand-up', startMin: 600, durationMin: 15, done: true, tagId: null }
    const dentist = { id: 'e1', title: 'Dentist', startMin: 900, tagId: null }

    async function openDayNote(props = {}) {
      addMockDayNote(DAY, { title: 'Moving day' })
      const view = page({ intent: { kind: 'day', dayKey: DAY }, onIntentHandled: vi.fn(), ...props })
      await waitFor(() => expect(view.container.querySelector('input.note-title').value).toBe('Moving day'))
      return view
    }

    it('is not there on a note that belongs to no day', async () => {
      const { container } = page()
      await open(container, 'Trip to Cebu')
      expect(container.querySelector('.note-day')).toBeNull()
    })

    it('sits right under the header, above the toolbar, with the day and a summary', async () => {
      schedule.tasks[DAY] = [water, standup]
      schedule.events[DAY] = [dentist]
      const { container } = await openDayNote()
      const band = container.querySelector('.note-day')
      const order = [...container.querySelector('.note-surface').children].map((el) => el.className.split(' ')[0])
      expect(order.indexOf('note-day')).toBe(order.indexOf('note-head') + 1)
      expect(order.indexOf('note-day')).toBeLessThan(order.indexOf('journal-toolbar'))
      expect(band.textContent).toContain(formatFullDayLabel(DAY))
      expect(band.textContent).toContain('2 tasks, 1 done · 1 event')
    })

    it('says so when the day is empty', async () => {
      const { container } = await openDayNote()
      expect(container.querySelector('.note-day').textContent).toContain('Nothing scheduled')
    })

    it('is one quiet line until it is opened, and remembers that it was', async () => {
      schedule.tasks[DAY] = [water]
      const first = await openDayNote()
      const toggle = first.container.querySelector('.note-day__toggle')
      expect(toggle.getAttribute('aria-expanded')).toBe('false')
      expect(first.container.querySelector('.note-day__list').hidden).toBe(true)
      expect(screen.queryByText('Water the plants')).toBeNull()

      fireEvent.click(toggle)
      expect(toggle.getAttribute('aria-expanded')).toBe('true')
      expect(first.container.querySelector('.note-day__list').hidden).toBe(false)
      expect(screen.getByText('Water the plants')).toBeTruthy()
      first.unmount()

      // Opened on the next visit too, as the list's own toggle is.
      const again = await openDayNote()
      expect(again.container.querySelector('.note-day__toggle').getAttribute('aria-expanded')).toBe('true')
    })

    it('ticks the real task when its box is ticked', async () => {
      schedule.tasks[DAY] = [water]
      const { container } = await openDayNote()
      fireEvent.click(container.querySelector('.note-day__toggle'))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Mark "Water the plants" done' }))
      await waitFor(() => expect(schedule.toggleDone).toHaveBeenCalledExactlyOnceWith('t1'))
      expect(toast.pushError).not.toHaveBeenCalled()
    })

    it('says so when ticking a task does not work', async () => {
      schedule.toggleDone.mockRejectedValue(new Error('permission-denied'))
      schedule.tasks[DAY] = [water]
      const { container } = await openDayNote()
      fireEvent.click(container.querySelector('.note-day__toggle'))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Mark "Water the plants" done' }))
      await waitFor(() => expect(toast.pushError).toHaveBeenCalledWith('Could not update the task.'))
    })

    it('opens a task or an event over the note, and goes back to the day', async () => {
      schedule.tasks[DAY] = [water]
      schedule.events[DAY] = [dentist]
      const onEdit = vi.fn()
      const onEditEvent = vi.fn()
      const onFocusDay = vi.fn()
      const { container } = await openDayNote({ onEdit, onEditEvent, onFocusDay })
      const band = within(container.querySelector('.note-day'))
      fireEvent.click(container.querySelector('.note-day__toggle'))

      fireEvent.click(band.getByRole('button', { name: /Water the plants/ }))
      expect(onEdit).toHaveBeenCalledExactlyOnceWith(water)
      fireEvent.click(band.getByRole('button', { name: /Dentist/ }))
      expect(onEditEvent).toHaveBeenCalledExactlyOnceWith(dentist)

      fireEvent.click(band.getByRole('button', { name: 'Open day' }))
      expect(onFocusDay).toHaveBeenCalledExactlyOnceWith(DAY)
    })
  })
})
