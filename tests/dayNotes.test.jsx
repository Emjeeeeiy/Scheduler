/* The link between a day in the schedule and that day's Journal note.
 *
 * A note belongs to a day by its `dayKey`, so the schedule side only needs to
 * know which days have a live note (DayNotesProvider), and every view says so the
 * same way: the "Open journal" / "Write in journal" button where a day is the
 * subject, and a small mark inside the day buttons the calendars already have.
 * What is worth pinning:
 *
 * - the index follows the Journal live, leaves out the trashed, and never claims
 *   "no note" before the first snapshot has landed;
 * - the button says what it will do (and nothing, without a handler to run);
 * - a marked day says so in WORDS as well as a glyph — shape is never the whole
 *   signal — and an unmarked day's name is untouched;
 * - the agenda modal closes before it leaves for the Journal, as it does for
 *   "Open day".
 *
 * The contexts the views read are mocked (a real ScheduleContext needs Firebase);
 * the Journal's store is the in-memory one the smoke build uses. The clock is
 * pinned.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DayNotesProvider, useDayNote } from '../src/state/DayNotesContext.jsx'
import { DayNoteButton } from '../src/components/calendar/DayNoteButton.jsx'
import { AgendaModal } from '../src/components/calendar/AgendaModal.jsx'
import { MiniCalendar } from '../src/components/calendar/MiniCalendar.jsx'
import { WeekGrid } from '../src/components/views/WeekGrid.jsx'
import { MonthCalendar } from '../src/components/views/MonthCalendar.jsx'
import { addMockDayNote, resetMockJournal } from './smoke/mockJournal.js'

const TODAY = '2026-08-24' // a Monday
const TUESDAY = '2026-08-25'

vi.mock('../src/state/useJournal.js', async () => import('./smoke/mockJournal.js'))
vi.mock('../src/state/ScheduleContext.jsx', () => ({
  useSchedule: () => ({
    tasks: [],
    inbox: [],
    tasksOn: () => [],
    occurrencesOn: () => [],
    eventsOn: () => [],
    eventsInRange: () => [],
    getTag: () => null,
    toggleDone: vi.fn(),
    updateTask: vi.fn(),
    scheduleTask: vi.fn(),
    moveEvent: vi.fn(),
  }),
}))
vi.mock('../src/state/SettingsContext.jsx', () => ({
  useSettings: () => ({ settings: { weekStartsOn: 1, workingHours: null } }),
}))
vi.mock('../src/state/ToastContext.jsx', () => ({
  useToast: () => ({ pushError: vi.fn(), pushUndo: vi.fn() }),
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`))
  window.matchMedia = vi.fn((query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  resetMockJournal()
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete window.matchMedia
})

const noop = () => {}
const withNotes = (ui) => <DayNotesProvider>{ui}</DayNotesProvider>

function Probe({ dayKey }) {
  const { loading, note } = useDayNote(dayKey)
  return <p data-testid="probe">{loading ? 'loading' : note ? note.id : 'none'}</p>
}

describe('DayNotesProvider', () => {
  it('says "loading", never "none", where nothing is providing the index', () => {
    render(<Probe dayKey={TODAY} />)
    expect(screen.getByTestId('probe').textContent).toBe('loading')
  })

  it('finds the note a day has, and says "none" for a day without one', () => {
    const id = addMockDayNote(TODAY)
    render(
      withNotes(
        <>
          <Probe dayKey={TODAY} />
          <Probe dayKey={TUESDAY} />
        </>,
      ),
    )
    const [today, tuesday] = screen.getAllByTestId('probe')
    expect(today.textContent).toBe(id)
    expect(tuesday.textContent).toBe('none')
  })

  it('follows the Journal live', () => {
    render(withNotes(<Probe dayKey={TUESDAY} />))
    expect(screen.getByTestId('probe').textContent).toBe('none')
    let id
    act(() => {
      id = addMockDayNote(TUESDAY)
    })
    expect(screen.getByTestId('probe').textContent).toBe(id)
  })

  it('leaves out a note in the trash', () => {
    addMockDayNote(TODAY, { deletedAt: Date.now() })
    render(withNotes(<Probe dayKey={TODAY} />))
    expect(screen.getByTestId('probe').textContent).toBe('none')
  })

  it('opens the same note for a day as the Journal does when there are two', () => {
    // The seeded notes are older than these; the newer one (edited last) leads
    // the sorted list, which is the one findNoteForDay would open.
    addMockDayNote(TODAY, { updatedAt: 1_000 })
    const newer = addMockDayNote(TODAY, { updatedAt: 9_000_000_000_000 })
    render(withNotes(<Probe dayKey={TODAY} />))
    expect(screen.getByTestId('probe').textContent).toBe(newer)
  })
})

describe('DayNoteButton', () => {
  it('renders nothing when there is nothing for it to open', () => {
    const { container } = render(withNotes(<DayNoteButton dayKey={TODAY} />))
    expect(container.querySelector('button')).toBeNull()
  })

  it('says only "Journal" until it knows whether the day has a note', () => {
    render(<DayNoteButton dayKey={TODAY} onOpen={noop} />)
    expect(screen.getByRole('button', { name: /^Journal, / }).textContent).toBe('Journal')
  })

  it('offers to write one when the day has none', () => {
    render(withNotes(<DayNoteButton dayKey={TODAY} onOpen={noop} />))
    const button = screen.getByRole('button', { name: /^Write in journal, / })
    expect(button.textContent).toBe('Write in journal')
  })

  it('offers to open the note a day has, and previews it in the tooltip', () => {
    addMockDayNote(TODAY, { title: 'Dentist day', excerpt: 'Floss more' })
    render(withNotes(<DayNoteButton dayKey={TODAY} onOpen={noop} />))
    const button = screen.getByRole('button', { name: /^Open journal, / })
    expect(button.textContent).toBe('Open journal')
    expect(button.getAttribute('title')).toBe('Dentist day — Floss more')
  })

  it('names the day, starting with the words on the button', () => {
    render(withNotes(<DayNoteButton dayKey={TODAY} onOpen={noop} />))
    // Label in name: someone using voice control says what they see.
    expect(screen.getByRole('button').getAttribute('aria-label')).toMatch(/^Write in journal, \S+/)
  })

  it('hands back the day it is for', () => {
    const onOpen = vi.fn()
    render(withNotes(<DayNoteButton dayKey={TUESDAY} onOpen={onOpen} />))
    fireEvent.click(screen.getByRole('button'))
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(TUESDAY)
  })

  it('is just the icon when compact, and still says everything in its name', () => {
    addMockDayNote(TODAY)
    render(withNotes(<DayNoteButton compact dayKey={TODAY} onOpen={noop} />))
    const button = screen.getByRole('button', { name: /^Open journal, / })
    expect(button.textContent).toBe('')
    expect(button.querySelector('svg')).toBeTruthy()
  })
})

describe('the marks', () => {
  const markIn = (element) => element.querySelector('.day-note-mark')

  it('mark a day on the mini calendar, in words as well as a glyph', () => {
    addMockDayNote(TODAY)
    const { container } = render(withNotes(<MiniCalendar onFocusDay={noop} onFocusMonth={noop} />))
    const marked = container.querySelector(`[title^="${TODAY}"]`)
    expect(markIn(marked)).toBeTruthy()
    expect(marked.getAttribute('title')).toContain('journal note')
    expect(within(marked).getByText(/journal note/).classList.contains('visually-hidden')).toBe(true)
    // The glyph is decoration; the words carry it.
    expect(markIn(marked).getAttribute('aria-hidden')).toBe('true')
    // A day without a note is exactly what it was.
    const plain = container.querySelector(`[title^="${TUESDAY}"]`)
    expect(markIn(plain)).toBeNull()
    expect(plain.getAttribute('title')).not.toContain('journal note')
  })

  it('mark a week column, and add the words to its name', () => {
    addMockDayNote(TODAY)
    const { container } = render(
      withNotes(
        <WeekGrid
          focusKey={TODAY}
          onEdit={noop}
          onCreate={noop}
          onEditEvent={noop}
          onCreateEvent={noop}
          onFocusDay={noop}
        />,
      ),
    )
    const [monday, tuesday] = container.querySelectorAll('.week__day')
    expect(markIn(monday)).toBeTruthy()
    expect(monday.getAttribute('aria-label')).toBe('Mon 24, journal note')
    expect(markIn(tuesday)).toBeNull()
    expect(tuesday.getAttribute('aria-label')).toBe('Tue 25')
  })

  it('mark a month day, and add the words to its number’s name', () => {
    addMockDayNote(TODAY)
    const { container } = render(
      withNotes(
        <MonthCalendar focusKey={TODAY} onFocusDay={noop} onCreate={noop} onEdit={noop} onEditEvent={noop} />,
      ),
    )
    const heads = [...container.querySelectorAll('.month__cell-head')]
    const monday = heads.find((head) => head.querySelector('.month__daynum').textContent === '24')
    const tuesday = heads.find((head) => head.querySelector('.month__daynum').textContent === '25')
    expect(markIn(monday)).toBeTruthy()
    expect(monday.querySelector('.month__daynum').getAttribute('aria-label')).toBe('Open 2026-08-24, journal note')
    expect(markIn(tuesday)).toBeNull()
    expect(tuesday.querySelector('.month__daynum').getAttribute('aria-label')).toBe('Open 2026-08-25')
  })

  it('draw nothing before the index has loaded, or without any note', () => {
    const { container } = render(
      <WeekGrid
        focusKey={TODAY}
        onEdit={noop}
        onCreate={noop}
        onEditEvent={noop}
        onCreateEvent={noop}
        onFocusDay={noop}
      />,
    )
    expect(container.querySelector('.day-note-mark')).toBeNull()
  })
})

describe('AgendaModal', () => {
  const modal = (props = {}) =>
    render(
      withNotes(
        <AgendaModal
          range="today"
          onClose={props.onClose ?? noop}
          onEdit={noop}
          onEditEvent={noop}
          onFocusDay={noop}
          onOpenDayNote={props.onOpenDayNote}
        />,
      ),
    )

  it('closes itself, then opens today’s journal note', () => {
    const calls = []
    modal({ onClose: () => calls.push('close'), onOpenDayNote: (key) => calls.push(`open ${key}`) })
    fireEvent.click(screen.getByRole('button', { name: /^Write in journal, / }))
    expect(calls).toEqual(['close', `open ${TODAY}`])
  })

  it('has no journal button when nobody is listening for one', () => {
    modal()
    expect(screen.queryByRole('button', { name: /journal/i })).toBeNull()
  })
})
