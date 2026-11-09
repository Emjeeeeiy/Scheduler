/* The Schedule page was crowded: three differently styled groups above the Day
 * grid, four lines on every Week column, a time, a load and a ring on every Month
 * cell, an instruction paragraph in the inbox. What is worth pinning is the
 * rearrangement — what moved where, and what is no longer there — rather than the
 * arithmetic behind any of it:
 *
 * - Day: one "All day" list for events and tasks; the "now" line sits under the
 *   title; the "6h planned of a 24h day" footer is gone (its heavy-day warning
 *   moved to the title's sub line); "Plan my day" lives in the Inbox it plans.
 * - Week: a column header is the weekday, the date and a bar (the hours are in its
 *   accessible name); the how-to line shows only for an empty week.
 * - Month: a chip is a dot and a title (its time is in the tooltip), no cell prints
 *   its load, and today is marked on the number.
 * - On a touch screen nothing in any of them is natively draggable.
 *
 * The contexts are mocked — a real ScheduleContext needs Firebase and nothing
 * here is about Firestore. The clock is pinned.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TodayView } from '../src/components/views/TodayView.jsx'
import { WeekGrid } from '../src/components/views/WeekGrid.jsx'
import { MonthCalendar } from '../src/components/views/MonthCalendar.jsx'
import { TaskInbox } from '../src/components/calendar/TaskInbox.jsx'

const TODAY = '2026-08-24' // a Monday
const TUESDAY = '2026-08-25'

const task = (id, title, date, extra = {}) => ({
  id,
  title,
  date,
  startMin: null,
  durationMin: null,
  done: false,
  tagId: null,
  recurrence: null,
  createdAt: Number(id.replace(/\D/g, '')) || 1,
  ...extra,
})

const state = { tasks: [], events: [], inbox: [] }

/* jsdom has no layout, so `scrollTop` is a plain value we can read back. */
const scrolled = []
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get() {
      return this.__scrollTop ?? 0
    },
    set(value) {
      this.__scrollTop = value
      scrolled.push({ element: this, value })
    },
  })
})
afterAll(() => {
  delete HTMLElement.prototype.scrollTop
})

vi.mock('../src/lib/aiClient.js', () => ({ planDayAi: vi.fn(async () => null) }))
vi.mock('../src/state/ScheduleContext.jsx', () => ({
  useSchedule: () => ({
    tasks: state.tasks,
    inbox: state.inbox,
    tasksOn: (key) => state.tasks.filter((t) => t.date === key),
    occurrencesOn: () => [],
    eventsOn: (key) => state.events.filter((e) => e.startDate <= key && key <= e.endDate),
    eventsInRange: (from, to) => state.events.filter((e) => e.startDate <= to && e.endDate >= from),
    getTag: () => null,
    addTask: vi.fn(),
    updateTask: vi.fn(),
    toggleDone: vi.fn(),
    scheduleTask: vi.fn(),
    unscheduleTask: vi.fn(),
    moveEvent: vi.fn(),
  }),
}))
vi.mock('../src/state/SettingsContext.jsx', () => ({
  useSettings: () => ({ settings: { weekStartsOn: 1, workingHours: null } }),
}))
vi.mock('../src/state/ToastContext.jsx', () => ({
  useToast: () => ({ pushError: vi.fn(), pushUndo: vi.fn() }),
}))

function stubMedia(coarse) {
  window.matchMedia = vi.fn((query) => ({
    matches: coarse && query === '(pointer: coarse)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`))
  stubMedia(false)
  state.tasks = []
  state.events = []
  state.inbox = []
  scrolled.length = 0
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete window.matchMedia
})

const noop = () => {}

describe('Day', () => {
  const day = () =>
    render(<TodayView focusKey={TODAY} onEdit={noop} onCreate={noop} onEditEvent={noop} onCreateEvent={noop} />)

  function busyDay() {
    state.tasks = [
      task('1', 'Call the bank', TODAY),
      task('2', 'Write report', TODAY, { startMin: 9 * 60, durationMin: 60 }),
    ]
    state.events = [{ id: 'e1', title: 'Team offsite', startDate: '2026-08-23', endDate: TUESDAY, startMin: null }]
    state.inbox = [task('3', 'Idea', null)]
  }

  it('keeps events and all-day tasks in one list under one label', () => {
    busyDay()
    const { container } = day()
    const lists = container.querySelectorAll('.all-day')
    expect(lists).toHaveLength(1)
    const list = lists[0].querySelector('.all-day__list')
    expect(within(list).getByText('Team offsite')).toBeTruthy()
    expect(within(list).getByText('Call the bank')).toBeTruthy()
    // Events first, then tasks.
    const rows = [...list.children]
    expect(rows[0].classList.contains('event-rail')).toBe(true)
    expect(rows[1].classList.contains('task-row')).toBe(true)
    expect(screen.getAllByText('All day', { selector: '.all-day__label' })).toHaveLength(1)
  })

  it('has no all-day group at all when the day has none', () => {
    state.tasks = [task('2', 'Write report', TODAY, { startMin: 9 * 60, durationMin: 60 })]
    const { container } = day()
    expect(container.querySelector('.all-day')).toBeNull()
  })

  it('puts the "now" line under the title, not above it', () => {
    state.tasks = [task('2', 'Write report', TODAY, { startMin: 11 * 60 + 30, durationMin: 60 })]
    const { container } = day()
    const panel = container.querySelector('.day-panel')
    const order = [...panel.children].map((el) => el.className.split(' ')[0])
    expect(order.indexOf('now-next')).toBeGreaterThan(order.indexOf('section-head'))
  })

  it('has no "planned of a 24h day" footer, and says "heavy day" in the sub line instead', () => {
    state.tasks = [
      task('1', 'Long block', TODAY, { startMin: 6 * 60, durationMin: 11 * 60 }),
    ]
    const { container } = day()
    expect(container.querySelector('.day-panel__foot')).toBeNull()
    expect(screen.queryByText(/of a 24h day/)).toBeNull()
    expect(container.querySelector('.section-head__sub .warn-text').textContent).toContain('heavy day')
  })

  it('offers "Plan my day" in the Inbox it plans, not beside the Grid / Agenda switch', () => {
    busyDay()
    const { container } = day()
    const inbox = container.querySelector('.inbox')
    expect(within(inbox).getByRole('button', { name: 'Plan my day' })).toBeTruthy()
    expect(within(container.querySelector('.day-panel__controls')).queryByText('Plan my day')).toBeNull()
  })

  it('does not offer it when nothing is waiting in the inbox', () => {
    state.inbox = []
    day()
    expect(screen.queryByRole('button', { name: 'Plan my day' })).toBeNull()
  })

  it('has no drag instructions in the inbox', () => {
    busyDay()
    day()
    expect(screen.queryByText(/Drag onto the grid/)).toBeNull()
  })
})

describe('the inbox', () => {
  it('shows "Plan my day" only for a caller that can plan, and only with something to plan', () => {
    state.inbox = [task('3', 'Idea', null)]
    const first = render(<TaskInbox focusKey={TODAY} onEdit={noop} onCreate={noop} />)
    expect(screen.queryByRole('button', { name: 'Plan my day' })).toBeNull()
    first.unmount()

    const onPlanDay = vi.fn()
    const second = render(<TaskInbox focusKey={TODAY} onEdit={noop} onCreate={noop} onPlanDay={onPlanDay} planOpen />)
    const button = screen.getByRole('button', { name: 'Plan my day' })
    expect(button.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(button)
    expect(onPlanDay).toHaveBeenCalledTimes(1)
    second.unmount()

    state.inbox = []
    render(<TaskInbox focusKey={TODAY} onEdit={noop} onCreate={noop} onPlanDay={onPlanDay} />)
    expect(screen.queryByRole('button', { name: 'Plan my day' })).toBeNull()
  })

  it('keeps its "Add" button quiet, and the done toggle at the foot', () => {
    state.inbox = [task('3', 'Idea', null), task('4', 'Old', null, { done: true })]
    const { container } = render(<TaskInbox focusKey={TODAY} onEdit={noop} onCreate={noop} />)
    const add = screen.getByRole('button', { name: 'Add' })
    expect(add.classList.contains('ghost-button')).toBe(true)
    expect(add.classList.contains('primary-button')).toBe(false)
    const foot = container.querySelector('.inbox__foot')
    expect(within(foot).getByRole('button', { name: 'Show done (1)' })).toBeTruthy()
    fireEvent.click(within(foot).getByRole('button', { name: 'Show done (1)' }))
    expect(screen.getByText('Old')).toBeTruthy()
  })

  it('does not let a long press pick a row up on a touch screen', () => {
    state.inbox = [task('3', 'Idea', null)]
    stubMedia(true)
    const { container } = render(<TaskInbox focusKey={TODAY} onEdit={noop} onCreate={noop} />)
    expect(container.querySelector('.inbox-item').getAttribute('draggable')).toBe('false')
  })

  it('keeps rows draggable with a mouse', () => {
    state.inbox = [task('3', 'Idea', null)]
    const { container } = render(<TaskInbox focusKey={TODAY} onEdit={noop} onCreate={noop} />)
    expect(container.querySelector('.inbox-item').getAttribute('draggable')).toBe('true')
  })
})

describe('Week', () => {
  const week = () =>
    render(<WeekGrid focusKey={TODAY} onEdit={noop} onCreate={noop} onEditEvent={noop} onCreateEvent={noop} onFocusDay={noop} />)

  it('gives each column a weekday, a date and a bar — and says the hours to anyone who asks', () => {
    state.tasks = [task('2', 'Write report', TODAY, { startMin: 9 * 60, durationMin: 90 })]
    state.events = [{ id: 'e1', title: 'Offsite', startDate: TODAY, endDate: TODAY, startMin: null }]
    const { container } = week()
    expect(container.querySelector('.week__load')).toBeNull()
    const mondayHeader = container.querySelector('.week__day')
    expect(mondayHeader.getAttribute('aria-label')).toBe('Mon 24, 1h 30m planned, 1 event')
    expect(mondayHeader.querySelector('.week__load-track')).toBeTruthy()
    // A day with nothing planned has no bar at all.
    expect(container.querySelectorAll('.week__day')[1].querySelector('.week__load-track')).toBeNull()
  })

  it('shows its how-to line only while the week is empty', () => {
    const first = week()
    expect(first.container.querySelector('.week__hint').textContent).toContain('Drag down an empty column')
    first.unmount()

    state.tasks = [task('2', 'Write report', TODAY, { startMin: 9 * 60, durationMin: 60 })]
    const second = week()
    expect(second.container.querySelector('.week__hint')).toBeNull()
  })

  it('says how to edit on a touch screen, in its own words, while empty', () => {
    stubMedia(true)
    const { container } = week()
    expect(container.querySelector('.week__hint').textContent).toContain('Hold a block')
  })

  it('does not make an all-day chip natively draggable on a touch screen', () => {
    state.tasks = [task('1', 'Call the bank', TODAY)]
    stubMedia(true)
    const { container } = week()
    expect(container.querySelector('.week__allday .chip').getAttribute('draggable')).toBe('false')
  })
})

describe('Month', () => {
  const month = () =>
    render(<MonthCalendar focusKey={TODAY} onFocusDay={noop} onCreate={noop} onEdit={noop} onEditEvent={noop} />)

  const cellFor = (container, dayNumber) =>
    [...container.querySelectorAll('.month__cell:not(.month__cell--outside)')].find(
      (cell) => cell.querySelector('.month__daynum').textContent === String(dayNumber),
    )

  it('draws a chip as a dot and a title, with the time in its tooltip', () => {
    state.tasks = [task('2', 'Write report', TUESDAY, { startMin: 9 * 60, durationMin: 60 })]
    const { container } = month()
    const chip = cellFor(container, 25).querySelector('.chip')
    expect(chip.textContent).toBe('Write report')
    expect(chip.querySelector('.chip__time')).toBeNull()
    expect(chip.getAttribute('title')).toContain('9:00 AM')
  })

  it('prints no load in a cell, and says it in the day number’s name instead', () => {
    state.tasks = [task('2', 'Write report', TUESDAY, { startMin: 9 * 60, durationMin: 60 })]
    const { container } = month()
    expect(container.querySelector('.month__load')).toBeNull()
    const number = cellFor(container, 25).querySelector('.month__daynum')
    expect(number.getAttribute('aria-label')).toBe('Open 2026-08-25, 1h planned')
    // The strip along the cell's top is still the visible load.
    expect(cellFor(container, 25).querySelector('.month__load-strip')).toBeTruthy()
  })

  it('marks today on its number', () => {
    const { container } = month()
    const today = container.querySelector('.month__cell--today')
    expect(today.querySelector('.month__daynum').textContent).toBe('24')
    expect(container.querySelectorAll('.month__cell--today')).toHaveLength(1)
  })

  it('does not make a chip or an event bar natively draggable on a touch screen', () => {
    state.tasks = [task('2', 'Write report', TUESDAY, { startMin: 9 * 60, durationMin: 60 })]
    state.events = [{ id: 'e1', title: 'Offsite', startDate: TODAY, endDate: TUESDAY, startMin: null }]
    stubMedia(true)
    const { container } = month()
    expect(container.querySelector('.month__chips .chip').getAttribute('draggable')).toBe('false')
    expect(container.querySelector('.month__bar').getAttribute('draggable')).toBe('false')
  })

  it('keeps them draggable with a mouse', () => {
    state.tasks = [task('2', 'Write report', TUESDAY, { startMin: 9 * 60, durationMin: 60 })]
    const { container } = month()
    expect(container.querySelector('.month__chips .chip').getAttribute('draggable')).toBe('true')
  })
})

describe('the whole day', () => {
  const day = (key = TODAY) =>
    render(<TodayView focusKey={key} onEdit={noop} onCreate={noop} onEditEvent={noop} onCreateEvent={noop} />)
  const week = () =>
    render(<WeekGrid focusKey={TODAY} onEdit={noop} onCreate={noop} onEditEvent={noop} onCreateEvent={noop} onFocusDay={noop} />)
  const labels = (container) => [...container.querySelectorAll('.gutter__mark')].map((el) => el.textContent)
  const hourPx = (hours) => Math.round(hours * 52)

  it('labels every hour from 12 AM to 11 PM in the Day grid, with nothing cropped', () => {
    const { container } = day()
    const all = labels(container)
    expect(all).toHaveLength(24)
    expect(all[0]).toBe('12 AM')
    expect(all[11]).toBe('11 AM')
    expect(all[12]).toBe('12 PM')
    expect(all[23]).toBe('11 PM')
  })

  it('does the same in the Week grid, with its headers outside the scroll area', () => {
    const { container } = week()
    expect(labels(container)).toHaveLength(24)
    expect(container.querySelector('.week__scroll .grid-body')).toBeTruthy()
    expect(container.querySelector('.week__scroll .week__head')).toBeNull()
    expect(container.querySelector('.week__scroll .week__allday')).toBeNull()
  })

  it('opens today at the current time, an hour of context above it', () => {
    day() // 12:00 now, so 11:00 is eleven hours down a grid of 52px hours
    const grid = scrolled.find((s) => s.element.classList.contains('grid-scroll'))
    expect(grid.value).toBe(hourPx(11))
  })

  it('opens another day at its first task', () => {
    state.tasks = [
      task('1', 'Later', TUESDAY, { startMin: 14 * 60, durationMin: 60 }),
      task('2', 'First', TUESDAY, { startMin: 9 * 60 + 30, durationMin: 30 }),
    ]
    day(TUESDAY)
    const grid = scrolled.find((s) => s.element.classList.contains('grid-scroll'))
    expect(grid.value).toBe(hourPx(8.5))
  })

  it('opens an empty day at the start of a normal one, 7 AM', () => {
    day(TUESDAY)
    const grid = scrolled.find((s) => s.element.classList.contains('grid-scroll'))
    expect(grid.value).toBe(hourPx(6))
  })

  it('opens the Week at the current time when the week is this one', () => {
    week()
    const body = scrolled.find((s) => s.element.classList.contains('week__scroll'))
    expect(body.value).toBe(hourPx(11))
  })

  it('does not move the grid again when the page re-renders', () => {
    const { rerender } = day()
    const first = scrolled.length
    rerender(<TodayView focusKey={TODAY} onEdit={noop} onCreate={noop} onEditEvent={noop} onCreateEvent={noop} />)
    expect(scrolled.length).toBe(first)
  })

  it('moves it when the day changes', () => {
    const { rerender } = day()
    const first = scrolled.length
    rerender(<TodayView focusKey={TUESDAY} onEdit={noop} onCreate={noop} onEditEvent={noop} onCreateEvent={noop} />)
    expect(scrolled.length).toBeGreaterThan(first)
  })

  it('still offers free time inside a normal day - never at 3 AM', () => {
    const { container } = day()
    const slots = [...container.querySelectorAll('.free-slots__when')].map((el) => el.textContent)
    expect(slots).toEqual(['7:00 AM \u2013 10:00 PM'])
  })
})
