/* AgendaModal backs the three "what's on" command-palette entries (Today /
 * This week / This month) added alongside it. The behaviour worth watching
 * run rather than just reading:
 * - It always reads the real current date, not whatever day the app's own
 *   cursor happens to be pointed at.
 * - Week and month group by day and silently drop any day with nothing
 *   scheduled — a wall of "Nothing scheduled" rows for every empty day would
 *   bury the ones that matter.
 * - Clicking a row closes the modal AND opens the right editor for its kind
 *   (task vs event); clicking a day's "Open day" closes the modal and hands
 *   back that day's key.
 *
 * ScheduleContext/SettingsContext are mocked rather than provided for real —
 * a real ScheduleContext needs Firebase, and this file has nothing to prove
 * about Firestore, only about what the modal does with the day/week/month it
 * is handed. The system clock is pinned so "today" is deterministic.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgendaModal } from '../src/components/calendar/AgendaModal.jsx'
import { monthGrid, monthOf, weekKeys } from '../src/lib/date.js'

const TODAY = '2026-08-24'
const WEEK_STARTS_ON = 1

// Derived from the real date helpers rather than hand-picked, so this file
// never has to know or guess which weekday TODAY happens to fall on.
const weekOfToday = weekKeys(TODAY, WEEK_STARTS_ON)
const laterInWeek = weekOfToday.find((key) => key !== TODAY)
const monthOfToday = monthGrid(TODAY, WEEK_STARTS_ON).filter((key) => monthOf(key) === monthOf(TODAY))
const laterInMonth = monthOfToday.find((key) => key !== TODAY && key !== laterInWeek)

const mockTasksByDate = {
  [TODAY]: [
    { id: 't-timed', title: 'Standup', tagId: null, startMin: 540, durationMin: 30, done: false },
    { id: 't-allday', title: 'Passport renewal', tagId: null, startMin: null, durationMin: null, done: false },
  ],
  [laterInWeek]: [
    { id: 't-week', title: 'Dentist', tagId: null, startMin: 600, durationMin: 60, done: false },
  ],
  [laterInMonth]: [
    { id: 't-month', title: 'Pay rent', tagId: null, startMin: null, durationMin: null, done: false },
  ],
}
const mockEventsByDate = {
  [TODAY]: [{ id: 'e-today', title: 'Team sync', tagId: null, startMin: 900 }],
}

const onEdit = vi.fn()
const onEditEvent = vi.fn()
const onFocusDay = vi.fn()
const onClose = vi.fn()
const toggleDone = vi.fn()

vi.mock('../src/state/ScheduleContext.jsx', () => ({
  useSchedule: () => ({
    tasksOn: (key) => mockTasksByDate[key] ?? [],
    eventsOn: (key) => mockEventsByDate[key] ?? [],
    getTag: () => null,
    toggleDone,
  }),
}))

vi.mock('../src/state/SettingsContext.jsx', () => ({
  useSettings: () => ({ settings: { weekStartsOn: WEEK_STARTS_ON } }),
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`))
  onEdit.mockClear()
  onEditEvent.mockClear()
  onFocusDay.mockClear()
  onClose.mockClear()
  toggleDone.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AgendaModal — today', () => {
  it('lists today’s event and both its timed and all-day tasks', () => {
    render(
      <AgendaModal
        range="today"
        onClose={onClose}
        onEdit={onEdit}
        onEditEvent={onEditEvent}
        onFocusDay={onFocusDay}
      />,
    )
    expect(screen.getByText('Team sync')).toBeTruthy()
    expect(screen.getByText('Standup')).toBeTruthy()
    expect(screen.getByText('Passport renewal')).toBeTruthy()
    // Nothing from another day leaks into "today".
    expect(screen.queryByText('Dentist')).toBeNull()
  })

  it('opens the event editor and closes itself on a click', () => {
    render(
      <AgendaModal
        range="today"
        onClose={onClose}
        onEdit={onEdit}
        onEditEvent={onEditEvent}
        onFocusDay={onFocusDay}
      />,
    )
    fireEvent.click(screen.getByText('Team sync'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onEditEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'e-today' }))
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('checking a task off toggles done without opening the editor or closing', () => {
    render(
      <AgendaModal
        range="today"
        onClose={onClose}
        onEdit={onEdit}
        onEditEvent={onEditEvent}
        onFocusDay={onFocusDay}
      />,
    )
    fireEvent.click(screen.getByLabelText('Mark "Standup" done'))
    expect(toggleDone).toHaveBeenCalledWith('t-timed')
    expect(onEdit).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('opens the task editor on a task click', () => {
    render(
      <AgendaModal
        range="today"
        onClose={onClose}
        onEdit={onEdit}
        onEditEvent={onEditEvent}
        onFocusDay={onFocusDay}
      />,
    )
    fireEvent.click(screen.getByText('Standup'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 't-timed' }))
  })
})

describe('AgendaModal — week', () => {
  it('groups by day and drops every day with nothing scheduled', () => {
    render(
      <AgendaModal
        range="week"
        onClose={onClose}
        onEdit={onEdit}
        onEditEvent={onEditEvent}
        onFocusDay={onFocusDay}
      />,
    )
    expect(screen.getByText('Standup')).toBeTruthy()
    expect(screen.getByText('Dentist')).toBeTruthy()
    // Every other day in the week has no fixture data — none of the "Open
    // day" buttons in a 7-day week should render for an empty day, so there
    // are exactly as many as there are days with something on them.
    expect(screen.getAllByText('Open day')).toHaveLength(
      weekOfToday.filter((key) => (mockTasksByDate[key] ?? []).length > 0).length,
    )
  })

  it('closes and hands back the clicked day’s key from "Open day"', () => {
    render(
      <AgendaModal
        range="week"
        onClose={onClose}
        onEdit={onEdit}
        onEditEvent={onEditEvent}
        onFocusDay={onFocusDay}
      />,
    )
    fireEvent.click(screen.getAllByText('Open day')[0])
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onFocusDay).toHaveBeenCalledWith(TODAY)
  })
})

describe('AgendaModal — month', () => {
  it('includes a day outside the current week as long as it is in the month', () => {
    render(
      <AgendaModal
        range="month"
        onClose={onClose}
        onEdit={onEdit}
        onEditEvent={onEditEvent}
        onFocusDay={onFocusDay}
      />,
    )
    expect(screen.getByText('Standup')).toBeTruthy()
    expect(screen.getByText('Dentist')).toBeTruthy()
    expect(screen.getByText('Pay rent')).toBeTruthy()
  })
})

describe('AgendaModal — "Open today"', () => {
  it('always jumps to the real today, regardless of range', () => {
    render(
      <AgendaModal
        range="month"
        onClose={onClose}
        onEdit={onEdit}
        onEditEvent={onEditEvent}
        onFocusDay={onFocusDay}
      />,
    )
    fireEvent.click(screen.getByText('Open today'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onFocusDay).toHaveBeenCalledWith(TODAY)
  })
})
