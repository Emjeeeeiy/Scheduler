/* The Dashboard is three bands — Today, Up next, Trends — and the things that
 * used to be tiles of their own now live where they belong. What is worth
 * holding to account here is that rearrangement, not the arithmetic behind it
 * (stats.test.js owns that):
 * - today's open / done / left are in the hero, and there are no stat tiles;
 * - the queues are one row: Next up always, Overdue and Pinned only when there
 *   is something in them, Overdue capped at three rows with the full count kept;
 * - the inbox count sits beside Next up and disappears when the inbox is empty;
 * - Trends is one block whose takeaway, figures and tag list follow the range;
 * - the tag breakdown folds past `maxRows` rather than growing the column.
 *
 * ScheduleContext and friends are mocked rather than provided for real — a real
 * one needs Firebase, and nothing here is about Firestore. The clock is pinned so
 * "today", "overdue" and "last 7 days" are deterministic.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, durationLabel } from '@cadence/shared/date.js'
import { Dashboard } from '../src/components/views/Dashboard.jsx'
import { TagBars } from '../src/components/stats/TagBars.jsx'

const TODAY = '2026-08-24' // a Monday
const WORK = { id: 'work', name: 'Work', color: 'var(--color-tag-blue)', parentId: null, goalMinutes: 600 }

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

const state = { tasks: [], inbox: [], tags: [WORK] }

vi.mock('../src/state/ScheduleContext.jsx', () => ({
  useSchedule: () => ({
    tasks: state.tasks,
    tags: state.tags,
    inbox: state.inbox,
    tasksOn: (key) => state.tasks.filter((t) => t.date === key),
    occurrencesOn: () => [],
    eventsOn: () => [],
    getTag: (id) => state.tags.find((t) => t.id === id) ?? null,
    toggleDone: vi.fn(),
    scheduleTask: vi.fn(),
  }),
}))
vi.mock('../src/state/SettingsContext.jsx', () => ({
  useSettings: () => ({ settings: { weekStartsOn: 1 } }),
}))
vi.mock('../src/state/ToastContext.jsx', () => ({
  useToast: () => ({ pushError: vi.fn() }),
}))

/** A day with something done, something open and something all-day, plus a pile
    of four overdue tasks, one pinned task far ahead, and an older finished block
    that only the 30-day range reaches. */
function busyWeek() {
  state.tasks = [
    task('1', 'Write report', TODAY, { startMin: 540, durationMin: 60, done: true, tagId: 'work' }),
    task('2', 'Review notes', TODAY, { startMin: 780, durationMin: 90, tagId: 'work' }),
    task('3', 'Call the bank', TODAY),
    task('4', 'Overdue one', addDays(TODAY, -1)),
    task('5', 'Overdue two', addDays(TODAY, -2)),
    task('6', 'Overdue three', addDays(TODAY, -3)),
    task('7', 'Overdue four', addDays(TODAY, -4)),
    task('8', 'Renew passport', addDays(TODAY, 20), { pinned: true }),
    task('9', 'Old finished block', addDays(TODAY, -15), {
      startMin: 600,
      durationMin: 120,
      done: true,
      tagId: 'work',
    }),
  ]
  state.inbox = [{ id: 'i1', done: false }, { id: 'i2', done: false }, { id: 'i3', done: true }]
}

function renderDashboard() {
  return render(<Dashboard onFocusDay={vi.fn()} onFocusMonth={vi.fn()} onEdit={vi.fn()} onCreate={vi.fn()} />)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`))
  // jsdom has no matchMedia; the hero's PixelType reads it on mount.
  window.matchMedia = vi.fn((query) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  state.tasks = []
  state.inbox = []
  state.tags = [WORK]
  // The queue and chart choices are remembered per device; a test's must not leak.
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete window.matchMedia
})

describe('the bands', () => {
  it('is three bands: today, the queues, and trends', () => {
    busyWeek()
    const { container } = renderDashboard()
    const bands = [...container.querySelector('.dashboard').children]
    const name = (el) =>
      el.matches('.dashboard__top')
        ? 'today'
        : el.matches('.queue-row')
          ? 'queues'
          : el.matches('.trends')
            ? 'trends'
            : el.matches('.pane-tabs-band')
              ? 'queue tabs'
              : '?'
    // The tab row is the phone's way to pick a queue: it is in the document so
    // there is one DOM at every width, but the stylesheet draws it only below 900px.
    expect(bands.map(name)).toEqual(['today', 'queue tabs', 'queues', 'trends'])
  })

  it('has no stat tiles — what they said lives in the hero, the queues and the figures', () => {
    busyWeek()
    const { container } = renderDashboard()
    expect(container.querySelector('.stat-tile')).toBeNull()
    expect(container.querySelector('.tile-row')).toBeNull()
  })
})

describe('the hero', () => {
  it('states today’s open, done and left as a label over a figure each', () => {
    busyWeek()
    const { container } = renderDashboard()
    const facts = [...container.querySelectorAll('.hero__fact')].map((el) => [
      el.querySelector('dt').textContent,
      el.querySelector('dd').textContent,
    ])
    // Three tasks today, one done; 150 minutes planned, 60 of them done.
    expect(facts).toEqual([
      ['Open', '2'],
      ['Done', '1'],
      ['Left', durationLabel(90)],
    ])
  })

  it('says so when nothing is scheduled today, instead of three zeros', () => {
    const { container } = renderDashboard()
    expect(container.querySelector('.hero__facts')).toBeNull()
    expect(screen.getByText('Nothing on the books yet.')).toBeTruthy()
  })

  it('keeps one primary action', () => {
    busyWeek()
    const { container } = renderDashboard()
    expect(container.querySelectorAll('.hero .primary-button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Plan something for today' })).toBeTruthy()
  })
})

/* On a phone the queues are a tab row over one list. Which list shows is the
 * stylesheet's job (a `data-pane` on the row, checked by eye); what is worth
 * pinning here is the row itself: which tabs there are, what they count, that
 * choosing one is remembered, and that a choice that has since emptied falls back
 * rather than showing nothing. */
describe('the queues as tabs, on a phone', () => {
  const tabs = () => screen.queryAllByRole('tab')
  const names = () => tabs().map((tab) => tab.textContent)
  const pane = (container) => container.querySelector('.queue-row').dataset.pane

  it('is a tab for each queue with something in it, each carrying its count', () => {
    busyWeek()
    renderDashboard()
    expect(screen.getByRole('tablist', { name: 'Queues' })).toBeTruthy()
    expect(names()).toEqual(['Next up', 'Overdue4', 'Pinned1'])
  })

  it('opens on Next up', () => {
    busyWeek()
    const { container } = renderDashboard()
    expect(pane(container)).toBe('next')
    expect(screen.getByRole('tab', { name: /^Next up/ }).getAttribute('aria-selected')).toBe('true')
  })

  it('switches the queue that shows, and says which tab is selected', () => {
    busyWeek()
    const { container } = renderDashboard()
    fireEvent.click(screen.getByRole('tab', { name: /^Overdue/ }))
    expect(pane(container)).toBe('overdue')
    expect(screen.getByRole('tab', { name: /^Overdue/ }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: /^Next up/ }).getAttribute('aria-selected')).toBe('false')
  })

  it('points each tab at the list it switches', () => {
    busyWeek()
    renderDashboard()
    for (const tab of tabs()) {
      expect(document.getElementById(tab.getAttribute('aria-controls'))).toBeTruthy()
    }
  })

  it('moves between tabs with the arrow keys, wrapping, and keeps only the selected one in the tab order', () => {
    busyWeek()
    const { container } = renderDashboard()
    const next = screen.getByRole('tab', { name: /^Next up/ })
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([0, -1, -1])
    fireEvent.keyDown(next, { key: 'ArrowRight' })
    expect(pane(container)).toBe('overdue')
    fireEvent.keyDown(screen.getByRole('tab', { name: /^Overdue/ }), { key: 'End' })
    expect(pane(container)).toBe('pinned')
    fireEvent.keyDown(screen.getByRole('tab', { name: /^Pinned/ }), { key: 'ArrowRight' })
    expect(pane(container)).toBe('next')
    fireEvent.keyDown(screen.getByRole('tab', { name: /^Next up/ }), { key: 'ArrowLeft' })
    expect(pane(container)).toBe('pinned')
  })

  it('remembers the choice for next time', () => {
    busyWeek()
    renderDashboard().unmount()
    cleanup()
    const first = renderDashboard()
    fireEvent.click(screen.getByRole('tab', { name: /^Pinned/ }))
    first.unmount()

    const { container } = renderDashboard()
    expect(pane(container)).toBe('pinned')
  })

  // Regression guard: the remembered queue can be one that has since emptied.
  // Showing it would be a blank page under a row of tabs that do not include it.
  it('shows Next up when the remembered queue is empty now', () => {
    localStorage.setItem('cadence-app:dash-queue', JSON.stringify('overdue'))
    state.tasks = [task('1', 'Write report', TODAY, { startMin: 780, durationMin: 60 }), task('2', 'Pinned thing', addDays(TODAY, 9), { pinned: true })]
    const { container } = renderDashboard()
    expect(pane(container)).toBe('next')
  })

  it('ignores a remembered value it does not recognise', () => {
    localStorage.setItem('cadence-app:dash-queue', JSON.stringify('timeline'))
    busyWeek()
    const { container } = renderDashboard()
    expect(pane(container)).toBe('next')
  })

  it('has no tab row at all when there is only one queue — one is no choice', () => {
    state.tasks = [task('1', 'Write report', TODAY, { startMin: 780, durationMin: 60 })]
    const { container } = renderDashboard()
    expect(tabs()).toHaveLength(0)
    expect(container.querySelector('.pane-tabs-band')).toBeNull()
  })
})

describe('the queues', () => {
  it('shows Next up, Overdue and Pinned side by side when all three have something', () => {
    busyWeek()
    renderDashboard()
    expect(screen.getByRole('region', { name: 'Next up' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Overdue' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Pinned' })).toBeTruthy()
  })

  it('caps Overdue at three rows but keeps the whole count', () => {
    busyWeek()
    renderDashboard()
    const overdue = screen.getByRole('region', { name: 'Overdue' })
    expect(overdue.querySelectorAll('.task-row')).toHaveLength(3)
    expect(overdue.querySelector('.count-pill').textContent).toBe('4')
    // The rest is one click away.
    expect(within(overdue).getByRole('button', { name: /^Go to / })).toBeTruthy()
  })

  it('drops the Overdue and Pinned columns entirely when they are empty', () => {
    state.tasks = [task('1', 'Write report', TODAY, { startMin: 780, durationMin: 60 })]
    const { container } = renderDashboard()
    expect(screen.queryByRole('region', { name: 'Overdue' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Pinned' })).toBeNull()
    expect(container.querySelector('.queue-row').children).toHaveLength(1)
  })

  it('shows the inbox count beside Next up, and nothing when the inbox is empty', () => {
    busyWeek()
    const first = renderDashboard()
    expect(within(screen.getByRole('region', { name: 'Next up' })).getByText('2 in the inbox')).toBeTruthy()
    first.unmount()

    state.inbox = []
    const second = renderDashboard()
    expect(second.container.querySelector('.section-head__meta')).toBeNull()
  })
})

describe('trends', () => {
  const figures = (container) =>
    Object.fromEntries(
      [...container.querySelectorAll('.figure')].map((el) => [
        el.querySelector('dt').textContent,
        el.querySelector('dd').textContent,
      ]),
    )

  it('is one block: a takeaway, four figures, the chart and the tag breakdown', () => {
    busyWeek()
    const { container } = renderDashboard()
    const trends = container.querySelector('.trends')
    expect(trends.querySelectorAll('.figure')).toHaveLength(4)
    expect(Object.keys(figures(container))).toEqual(['Planned', 'Completed', 'Tasks done', 'Completion rate'])
    expect(trends.querySelector('.chart__columns')).toBeTruthy()
    expect(within(trends).getByText('Time by tag')).toBeTruthy()
  })

  // On a phone the chart and the tag breakdown fold behind a toggle — the answer
  // (the takeaway and four figures) first, the detail a tap away. The folding is
  // the stylesheet's (`data-chart`); the button and its memory are what is pinned.
  describe('the chart toggle, on a phone', () => {
    const toggle = () => screen.getByRole('button', { name: /(Show|Hide) chart/ })
    const chartState = (container) => container.querySelector('.trends').dataset.chart

    it('starts folded, and says what it will do', () => {
      busyWeek()
      const { container } = renderDashboard()
      expect(chartState(container)).toBe('closed')
      expect(toggle().textContent).toBe('Show chart')
      expect(toggle().getAttribute('aria-expanded')).toBe('false')
    })

    it('unfolds and folds again, and points at the chart it controls', () => {
      busyWeek()
      const { container } = renderDashboard()
      fireEvent.click(toggle())
      expect(chartState(container)).toBe('open')
      expect(toggle().textContent).toBe('Hide chart')
      expect(toggle().getAttribute('aria-expanded')).toBe('true')
      expect(document.getElementById(toggle().getAttribute('aria-controls'))).toBe(container.querySelector('.trends__body'))
      fireEvent.click(toggle())
      expect(chartState(container)).toBe('closed')
    })

    it('keeps the chart in the document either way: a desktop shows it, and the toggle is not there', () => {
      busyWeek()
      const { container } = renderDashboard()
      expect(container.querySelector('.trends .chart__columns')).toBeTruthy()
    })

    it('remembers being unfolded', () => {
      busyWeek()
      const first = renderDashboard()
      fireEvent.click(toggle())
      first.unmount()
      const { container } = renderDashboard()
      expect(chartState(container)).toBe('open')
    })

    it('has no toggle when there is nothing to fold', () => {
      // Nothing scheduled in the range: the takeaway says so and there is no chart.
      renderDashboard()
      expect(screen.queryByRole('button', { name: /(Show|Hide) chart/ })).toBeNull()
    })
  })

  it('says in one sentence what the range holds', () => {
    busyWeek()
    const { container } = renderDashboard()
    const takeaway = container.querySelector('.trends__takeaway').textContent
    expect(takeaway).toContain(`You planned ${durationLabel(150)} and completed ${durationLabel(60)}`)
    expect(takeaway).toContain('is where you follow through most')
  })

  it('has a gentle sentence and nothing else when nothing is scheduled', () => {
    const { container } = renderDashboard()
    expect(container.querySelector('.trends__takeaway').textContent).toBe('Schedule a few tasks and this fills in.')
    // No row of zeros, and no two empty panels, repeating what that line says.
    expect(container.querySelector('.figures')).toBeNull()
    expect(container.querySelector('.trends__body')).toBeNull()
    // The range switch stays, so the first scheduled task lands in a window you chose.
    expect(screen.getByRole('button', { name: 'Last 7 days' })).toBeTruthy()
  })

  it('moves the figures, the takeaway and the pressed chip together with the range', () => {
    busyWeek()
    const { container } = renderDashboard()
    const week = screen.getByRole('button', { name: 'Last 7 days' })
    const month = screen.getByRole('button', { name: 'Last 30 days' })
    expect(week.getAttribute('aria-pressed')).toBe('true')
    expect(figures(container).Planned).toBe('2.5h')

    fireEvent.click(month)
    expect(month.getAttribute('aria-pressed')).toBe('true')
    expect(week.getAttribute('aria-pressed')).toBe('false')
    // The old finished block adds two hours planned and two completed.
    expect(figures(container).Planned).toBe('4.5h')
    expect(container.querySelector('.trends__takeaway').textContent).toContain(
      `You planned ${durationLabel(270)} and completed ${durationLabel(180)}`,
    )
  })

  it('shows tasks done against the scheduled total, and the rate with its unit', () => {
    busyWeek()
    const { container } = renderDashboard()
    // Seven days: 3 today + 4 overdue = 7 scheduled, 1 done.
    expect(figures(container)['Tasks done']).toBe('1/ 7')
    expect(figures(container)['Completion rate']).toBe('14%')
  })

  it('lists weekly goals under the chart when a tag has one, measured on this week', () => {
    busyWeek()
    renderDashboard()
    const goals = screen.getByText('Weekly goals — this week').closest('figure')
    expect(within(goals).getByText('Work')).toBeTruthy()
    // 150 minutes planned today against a 10-hour goal.
    expect(within(goals).getByText('2.5h / 10h')).toBeTruthy()
  })

  it('has no goals block when no tag sets one', () => {
    busyWeek()
    state.tags = [{ ...WORK, goalMinutes: null }]
    renderDashboard()
    expect(screen.queryByText('Weekly goals — this week')).toBeNull()
  })
})

describe('TagBars maxRows', () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({
    id: `t${i}`,
    tag: { id: `t${i}`, name: `Tag ${i}`, color: 'var(--color-tag-blue)' },
    plannedMin: 600 - i * 30,
    completedMin: 0,
    count: 1,
  }))

  it('folds the tail into "Other" past seven rows by default', () => {
    const { container } = render(<TagBars rows={rows} label="Time by tag" />)
    expect(container.querySelectorAll('.tag-bars__row')).toHaveLength(8)
    expect(screen.getByText('Other (1)')).toBeTruthy()
  })

  it('folds earlier when the column asks for fewer rows', () => {
    const { container } = render(<TagBars rows={rows} label="Time by tag" maxRows={5} />)
    expect(container.querySelectorAll('.tag-bars__row')).toHaveLength(6)
    expect(screen.getByText('Other (3)')).toBeTruthy()
  })
})
