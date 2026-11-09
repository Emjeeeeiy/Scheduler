/* The Focus page was a column that said things twice and hid its numbers behind
 * buttons: "Focus" five times over, a run-on line of five facts under the title,
 * a "Focus stats" button that opened a panel repeating them, the chosen task named
 * in the select and then again as a link, and three pictures of progress (the
 * digits, the dial, a bar). These pin the page it was cleaned up into, and that
 * the timer under it is still the timer:
 *
 * - the title is the phase; the round is pips, with the words beside them;
 * - the digits and the dial sit together, and the dial's rim — not a bar — carries
 *   how far through the round you are;
 * - the task is named once; Mark done and "Open task" work;
 * - the stats are a band that is always there, from the recorded sessions;
 * - Start / Pause / Resume / Reset, a finished round's alarm, and the lengths panel.
 *
 * The contexts are mocked — a real ScheduleContext needs Firebase. The clock is
 * pinned, and faked, because a countdown is the whole subject.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FocusMode } from '../src/components/views/FocusMode.jsx'

const TODAY = '2026-08-26' // a Wednesday: the week (Mon 24 - Sun 30) holds Monday and today
const EARLIER_THIS_WEEK = '2026-08-24'
const LAST_WEEK = '2026-08-12'

const state = { tasks: [], sessions: [], tags: [] }
const schedule = vi.hoisted(() => ({
  toggleDone: vi.fn(async () => {}),
  addFocusSession: vi.fn(async () => {}),
}))

vi.mock('../src/state/ScheduleContext.jsx', () => ({
  useSchedule: () => ({
    tasksOn: () => state.tasks,
    tags: state.tags,
    focusSessions: state.sessions,
    toggleDone: schedule.toggleDone,
    addFocusSession: schedule.addFocusSession,
  }),
}))
vi.mock('../src/state/SettingsContext.jsx', () => ({
  useSettings: () => ({ settings: { weekStartsOn: 1 } }),
}))
vi.mock('../src/state/ToastContext.jsx', () => ({
  useToast: () => ({ pushError: vi.fn() }),
}))

const task = (id, title, extra = {}) => ({ id, title, date: TODAY, startMin: null, done: false, tagId: null, ...extra })

const onEdit = vi.fn()
const audio = { play: vi.fn(() => Promise.resolve()), pause: vi.fn() }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`))
  localStorage.clear()
  state.tasks = []
  state.sessions = []
  state.tags = []
  onEdit.mockReset()
  schedule.toggleDone.mockClear()
  schedule.addFocusSession.mockClear()
  audio.play.mockClear()
  audio.pause.mockClear()
  // `new Audio()` yields whatever object the constructor returns.
  window.Audio = function Audio() {
    return audio
  }
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  delete window.Audio
})

const focus = () => render(<FocusMode onEdit={onEdit} />)
const clock = (container) => container.querySelector('.focus__clock').textContent
const advance = (ms) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })
const pips = (container) =>
  [...container.querySelectorAll('.focus__pip')].map((el) =>
    el.classList.contains('focus__pip--done') ? 'done' : el.classList.contains('focus__pip--current') ? 'current' : 'todo',
  )
/** The dial's rim arc, as the fraction of the circle it covers. */
const rim = (container) => {
  const [filled, whole] = container.querySelector('.focus__stopwatch-progress').getAttribute('stroke-dasharray').split(' ').map(Number)
  return filled / whole
}

describe('the header', () => {
  it('is the phase, with no "Focus mode", no "Focus stats" and no second phase label', () => {
    focus()
    expect(screen.getByRole('heading', { name: 'Focus session' })).toBeTruthy()
    expect(screen.queryByText('Focus mode')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Focus stats' })).toBeNull()
    expect(screen.queryByText(/FOCUS SESSION/)).toBeNull()
    expect(screen.getAllByText('Focus session')).toHaveLength(1)
  })

  it('says the round in words beside the pips, and not the old run-on line', () => {
    const { container } = focus()
    expect(container.querySelector('.focus__round-text').textContent).toBe('Round 1 of 4')
    expect(screen.queryByText(/completed this session/)).toBeNull()
    expect(screen.queryByText(/this week/i, { selector: '.focus__round-text, .section-head__sub' })).toBeNull()
  })

  it('has one header action, "Session lengths"', () => {
    const { container } = focus()
    expect(within(container.querySelector('.focus__head')).getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Session lengths' })).toBeTruthy()
  })
})

describe('the round pips', () => {
  it('start with one current and the rest to come, one for each round of the cycle', () => {
    const { container } = focus()
    expect(pips(container)).toEqual(['current', 'todo', 'todo', 'todo'])
  })

  it('mark a finished round done, and the next one current, once a short break begins', () => {
    const { container } = focus()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    advance(25 * 60 * 1000 + 500)
    expect(screen.getByRole('heading', { name: 'Short break' })).toBeTruthy()
    // Between rounds none is in progress.
    expect(pips(container)).toEqual(['done', 'todo', 'todo', 'todo'])
    expect(container.querySelector('.focus__round-text').textContent).toBe('Round 1 of 4')
  })

  it('follow the length of the cycle', () => {
    fireEvent.click(focus().container.ownerDocument.body.querySelector('.filter-chip'))
    fireEvent.change(screen.getByLabelText('Rounds before a long break'), { target: { value: '2' } })
    expect(document.querySelectorAll('.focus__pip')).toHaveLength(2)
  })
})

describe('the timer', () => {
  it('shows the length of a focus round, and counts down once started', () => {
    const { container } = focus()
    expect(clock(container)).toBe('25:00')
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    advance(5000)
    expect(clock(container)).toBe('24:55')
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy()
  })

  it('shows the running dot beside the phase only while it runs', () => {
    const { container } = focus()
    expect(container.querySelector('.focus__phase .now-next__dot')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(container.querySelector('.focus__phase .now-next__dot')).toBeTruthy()
  })

  it('freezes when paused, and resumes from where it stopped', () => {
    const { container } = focus()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    advance(10_000)
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    const paused = clock(container)
    advance(30_000)
    expect(clock(container)).toBe(paused)
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    advance(5000)
    expect(clock(container)).not.toBe(paused)
  })

  it('goes back to the full length on Reset', () => {
    const { container } = focus()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    advance(60_000)
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(clock(container)).toBe('25:00')
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
  })

  it('puts the time in the tab title while it runs', () => {
    focus()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    advance(1000)
    expect(document.title).toMatch(/^\d\d:\d\d - Focus$/)
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(document.title).toBe('Cadence')
  })

  it('records the session and rings the alarm when a focus round ends', () => {
    focus()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    advance(25 * 60 * 1000 + 500)
    expect(schedule.addFocusSession).toHaveBeenCalledTimes(1)
    expect(schedule.addFocusSession.mock.calls[0][0]).toMatchObject({ date: TODAY, minutes: 25 })
    expect(audio.play).toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: 'Focus session complete' })
    expect(within(dialog).getByText(/Time for a short break/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stop alarm' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(audio.pause).toHaveBeenCalled()
  })
})

describe('the dial', () => {
  it('sits beside the digits, in the same readout', () => {
    const { container } = focus()
    const readout = container.querySelector('.focus__readout')
    expect(readout.querySelector('.focus__clock')).toBeTruthy()
    expect(readout.querySelector('svg.focus__stopwatch')).toBeTruthy()
    expect(readout.querySelectorAll('.focus__stopwatch-tick')).toHaveLength(12)
  })

  it('has no progress bar under it any more — its rim carries that', () => {
    const { container } = focus()
    expect(container.querySelector('.focus__track')).toBeNull()
    expect(container.querySelector('.hero__load-track')).toBeNull()
    expect(container.querySelector('.focus__stopwatch-progress')).toBeTruthy()
  })

  it('starts with an empty rim, and fills it as the round goes', () => {
    const { container } = focus()
    expect(rim(container)).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    advance(5 * 60 * 1000) // a fifth of 25 minutes
    expect(rim(container)).toBeCloseTo(0.2, 1)
    advance(10 * 60 * 1000)
    expect(rim(container)).toBeCloseTo(0.6, 1)
  })

  it('moves the hand once a minute, and keeps it still while paused', () => {
    const { container } = focus()
    const hand = () => container.querySelector('.focus__stopwatch-hand').getAttribute('x2')
    const before = hand()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    advance(15_000)
    expect(hand()).not.toBe(before)
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    const frozen = hand()
    advance(20_000)
    expect(hand()).toBe(frozen)
  })
})

describe('the task', () => {
  it('is picked in one select, with nothing named a second time', () => {
    state.tasks = [task('a', 'Write the report'), task('b', 'Review notes')]
    const { container } = focus()
    const select = screen.getByLabelText('Focusing on')
    expect(select.tagName).toBe('SELECT')
    expect(screen.getByRole('option', { name: 'No task selected' })).toBeTruthy()
    fireEvent.change(select, { target: { value: 'a' } })
    // The title is in the select, and is not repeated as a link.
    expect(screen.getAllByText('Write the report')).toHaveLength(1)
    expect(container.querySelector('.focus__task-open').textContent).toBe('Open task')
  })

  it('says so when nothing is open today', () => {
    focus()
    expect(screen.getByRole('option', { name: 'Nothing open today' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mark done' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open task' })).toBeNull()
  })

  it('opens the task in its editor', () => {
    state.tasks = [task('a', 'Write the report')]
    focus()
    fireEvent.change(screen.getByLabelText('Focusing on'), { target: { value: 'a' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open task' }))
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
  })

  it('marks it done, and clears the picker', async () => {
    state.tasks = [task('a', 'Write the report')]
    focus()
    const select = screen.getByLabelText('Focusing on')
    fireEvent.change(select, { target: { value: 'a' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Mark done' }))
    })
    expect(schedule.toggleDone).toHaveBeenCalledWith('a')
    expect(select.value).toBe('')
    expect(screen.queryByRole('button', { name: 'Mark done' })).toBeNull()
  })

  it('records the session against the task selected when the round ended', () => {
    state.tasks = [task('a', 'Write the report', { tagId: 'work' })]
    state.tags = [{ id: 'work', name: 'Work', color: 'var(--color-tag-blue)' }]
    focus()
    fireEvent.change(screen.getByLabelText('Focusing on'), { target: { value: 'a' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    advance(25 * 60 * 1000 + 500)
    expect(schedule.addFocusSession.mock.calls[0][0]).toMatchObject({ taskId: 'a', tagId: 'work' })
  })
})

describe('the stats band', () => {
  const sessions = [
    { date: TODAY, minutes: 25, tagId: 'work' },
    { date: TODAY, minutes: 25, tagId: 'work' },
    { date: EARLIER_THIS_WEEK, minutes: 50, tagId: 'home' },
    { date: LAST_WEEK, minutes: 25, tagId: 'work' },
  ]
  const tags = [
    { id: 'work', name: 'Work', color: 'var(--color-tag-blue)' },
    { id: 'home', name: 'Home', color: 'var(--color-tag-orange)' },
  ]

  it('is always on the page — there is no button to open it', () => {
    state.sessions = sessions
    state.tags = tags
    const { container } = focus()
    expect(container.querySelector('.focus__stats')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /stats/i })).toBeNull()
  })

  it('adds up today, this week and the rounds done today from the recorded sessions', () => {
    state.sessions = sessions
    state.tags = tags
    const { container } = focus()
    const figures = Object.fromEntries(
      [...container.querySelectorAll('.focus__stats .figure')].map((el) => [el.querySelector('dt').textContent, el.querySelector('dd').textContent]),
    )
    // Today 25 + 25; this week adds Monday's 50 (last week's 25 is not in it).
    expect(figures).toEqual({ Today: '50m', 'This week': '1h 40m', 'Rounds today': '2' })
  })

  it('lists the time by tag, largest first', () => {
    state.sessions = sessions
    state.tags = tags
    const { container } = focus()
    const rows = [...container.querySelectorAll('.focus__tag-stats-row')].map((el) => el.textContent)
    expect(screen.getByText('By tag')).toBeTruthy()
    expect(rows).toEqual(['Work1h 15m · 3 rounds', 'Home50m · 1 round'])
  })

  it('shows only the top five tags', () => {
    state.tags = Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, name: `Tag ${i}`, color: 'var(--color-tag-blue)' }))
    state.sessions = state.tags.map((t, i) => ({ date: TODAY, minutes: 10 + i, tagId: t.id }))
    const { container } = focus()
    expect(container.querySelectorAll('.focus__tag-stats-row')).toHaveLength(5)
  })

  it('is one quiet line, not a row of zeros, when nothing has been recorded', () => {
    const { container } = focus()
    expect(screen.getByText('Finish a round and your focus time shows up here.')).toBeTruthy()
    expect(container.querySelector('.focus__stats .figures')).toBeNull()
    expect(screen.queryByText('By tag')).toBeNull()
  })
})

describe('session lengths', () => {
  const toggle = () => screen.getByRole('button', { name: 'Session lengths' })

  it('opens and closes under the header, and says so in its pressed state and aria-expanded', () => {
    const { container } = focus()
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector('.focus__settings')).toBeNull()
    fireEvent.click(toggle())
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    expect(toggle().classList.contains('filter-chip--on')).toBe(true)
    expect(toggle().textContent).toBe('Session lengths') // not "Close"
    expect(container.querySelector('.focus__timer .focus__settings')).toBeTruthy()
    fireEvent.click(toggle())
    expect(container.querySelector('.focus__settings')).toBeNull()
  })

  it('has the four lengths and auto-start', () => {
    focus()
    fireEvent.click(toggle())
    for (const label of ['Focus round', 'Short break', 'Long break', 'Rounds before a long break']) {
      expect(screen.getByLabelText(label)).toBeTruthy()
    }
    expect(screen.getByLabelText('Auto-start next round')).toBeTruthy()
  })

  it('changes an idle clock as a length is typed', () => {
    const { container } = focus()
    fireEvent.click(toggle())
    fireEvent.change(screen.getByLabelText('Focus round'), { target: { value: '40' } })
    expect(clock(container)).toBe('40:00')
  })

  it('does not change a clock that is already counting down', () => {
    const { container } = focus()
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    advance(2000)
    fireEvent.click(toggle())
    fireEvent.change(screen.getByLabelText('Focus round'), { target: { value: '40' } })
    expect(clock(container)).toBe('24:58')
  })

  it('remembers the lengths across a remount', () => {
    const first = focus()
    fireEvent.click(toggle())
    fireEvent.change(screen.getByLabelText('Focus round'), { target: { value: '30' } })
    first.unmount()
    const { container } = focus()
    expect(clock(container)).toBe('30:00')
  })
})
