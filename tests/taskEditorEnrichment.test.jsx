/* TaskEditor's AI enrichment panel — the one behaviour worth watching run
 * rather than just reading: that "Apply all" fills in whatever Gemini
 * suggested for a field that was genuinely empty, while a field the person
 * had already typed into themselves (Notes, here) is never touched. That
 * "only fill empty fields" promise is the entire point of Phase 8's design
 * — see the plan's decision record — so a bug that silently overwrote a
 * real answer would be far worse than the debounce or the network call
 * failing outright.
 *
 * ScheduleContext/SettingsContext/ToastContext are mocked rather than
 * provided for real, the same reasoning itemDetail.test.jsx already uses:
 * a real ScheduleContext needs Firebase, and this file has nothing to prove
 * about Firestore — only about what TaskEditor does with a Gemini answer
 * once it has one. enrichTaskAi is mocked directly rather than mocking
 * fetch underneath it — aiClient.test.jsx already covers that contract.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskEditor } from '../src/components/editors/TaskEditor.jsx'
import { enrichTaskAi } from '../src/lib/aiClient.js'

vi.mock('../src/state/ToastContext.jsx', () => ({
  useToast: () => ({ pushError: vi.fn(), pushSuccess: vi.fn(), pushUndo: vi.fn() }),
}))

vi.mock('../src/state/SettingsContext.jsx', () => ({
  useSettings: () => ({ settings: { workingHours: null } }),
}))

vi.mock('../src/state/ScheduleContext.jsx', () => ({
  DEFAULT_DURATION_MIN: 30,
  useSchedule: () => ({
    addTask: vi.fn(),
    updateTask: vi.fn(),
    removeTask: vi.fn(),
    restoreItem: vi.fn(),
    addTemplate: vi.fn(),
    tags: [],
    tasks: [],
    getSeries: () => null,
    tasksOn: () => [],
    eventsOn: () => [],
  }),
}))

vi.mock('../src/lib/aiClient.js', () => ({
  enrichTaskAi: vi.fn(),
}))

const AI_RESULT = {
  tagId: null,
  durationMin: 45,
  startMin: 9 * 60,
  subtasks: ['Clear the counters', 'Wipe the fridge'],
  // Included on purpose even though Notes will already be filled in this
  // test — proving the panel (not just Apply) already knows to ignore it.
  notes: 'AI note that must never appear',
}

beforeEach(() => {
  // A fixed, safe mid-minute instant: useNow() schedules its own tick off
  // the real minute boundary, and pinning the clock here keeps this test's
  // 500ms debounce advance from ever racing that unrelated timer.
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-15T09:00:00'))
  enrichTaskAi.mockResolvedValue(AI_RESULT)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('TaskEditor — AI enrichment', () => {
  it('offers only the fields still empty, and Apply all never touches one already filled in', async () => {
    render(<TaskEditor editor={{ mode: 'create', draft: {} }} onClose={vi.fn()} />)

    // Filled in by hand, before the AI answer ever arrives.
    fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'My own note' } })
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Deep clean kitchen' } })

    // Fires the debounce timer, then lets the mocked promise and the
    // resulting state update settle — all inside one act() so there is
    // nothing left to poll for afterward.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(screen.getByText('AI suggestions')).toBeTruthy()
    expect(screen.getByText('2 items')).toBeTruthy()
    // The whole point: Notes already had a real value, so it is not offered
    // as something to apply, even though the mocked response included one.
    expect(screen.queryByText('AI note that must never appear')).toBeNull()

    fireEvent.click(screen.getByText('Apply all'))

    expect(screen.getByLabelText('Notes').value).toBe('My own note')
    // Regex, not an exact string: this field's label wraps a trailing hint
    // span too ("Empty means all day"/"Time block"), so its full computed
    // accessible name is longer than just "Start time".
    expect(screen.getByLabelText(/Start time/).value).toBe('09:00')
    expect(screen.getByText('Clear the counters')).toBeTruthy()
    expect(screen.getByText('Wipe the fridge')).toBeTruthy()
  })

  it('shows a thinking indicator while the request is in flight, then swaps it for the panel', async () => {
    let resolveEnrich
    enrichTaskAi.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveEnrich = resolve
        }),
    )
    render(<TaskEditor editor={{ mode: 'create', draft: {} }} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Deep clean kitchen' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(screen.getByText('Checking for AI suggestions…')).toBeTruthy()
    expect(screen.queryByText('AI suggestions')).toBeNull()

    await act(async () => {
      resolveEnrich(AI_RESULT)
      await Promise.resolve()
    })

    expect(screen.queryByText('Checking for AI suggestions…')).toBeNull()
    expect(screen.getByText('AI suggestions')).toBeTruthy()
  })

  it('shows nothing at all when the account is offline and enrichTaskAi resolves null', async () => {
    enrichTaskAi.mockResolvedValue(null)
    render(<TaskEditor editor={{ mode: 'create', draft: {} }} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Deep clean kitchen' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(screen.queryByText('AI suggestions')).toBeNull()
  })
})
