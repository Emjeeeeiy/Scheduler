/* AiChatModal — the command palette's "AI" entry point. The one behaviour
 * worth watching run rather than just reading: an "ask" reply keeps the
 * conversation open and shows the question (never creates anything), while
 * a "create" reply writes every item through addTask and closes with
 * exactly one undo toast covering the whole batch — never one toast per
 * item, and never a silent success with no way back. Tasks only — see
 * api/ai-schedule.js's own comment on why events were dropped from this
 * route entirely.
 *
 * ScheduleContext/SettingsContext/ToastContext are mocked rather than
 * provided for real, the same reasoning taskEditorEnrichment.test.jsx
 * already uses: a real ScheduleContext needs Firebase, and this file has
 * nothing to prove about Firestore — only about what the modal does with
 * an AI answer once it has one. aiScheduleAi is mocked directly rather than
 * mocking fetch underneath it — aiClient.test.jsx already covers that
 * contract.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiChatModal } from '../src/components/shell/AiChatModal.jsx'
import { aiScheduleAi } from '../src/lib/aiClient.js'

const addTask = vi.fn(async (draft) => ({ id: `task-${draft.title}` }))
const removeTask = vi.fn(async () => {})
const pushUndo = vi.fn()
const pushError = vi.fn()

// A mutable binding inside the mock factory, the same pattern
// aiClient.test.jsx uses for mockCurrentUser: lets one test set real task
// fixtures to prove history is actually built and sent, while every other
// test gets an empty history with no setup of its own.
let mockTasks = []

vi.mock('../src/state/ToastContext.jsx', () => ({
  useToast: () => ({ pushUndo, pushError, pushSuccess: vi.fn(), dismiss: vi.fn() }),
}))

vi.mock('../src/state/SettingsContext.jsx', () => ({
  useSettings: () => ({ settings: { workingHours: null } }),
}))

vi.mock('../src/state/ScheduleContext.jsx', () => ({
  useSchedule: () => ({
    addTask,
    removeTask,
    tags: [{ id: 'health', name: 'Health' }],
    get tasks() {
      return mockTasks
    },
    tasksOn: () => [],
    eventsOn: () => [],
  }),
}))

vi.mock('../src/lib/aiClient.js', () => ({
  aiScheduleAi: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockTasks = []
})

afterEach(() => {
  vi.restoreAllMocks()
})

const type = (value) => fireEvent.change(screen.getByPlaceholderText('Describe what to schedule…'), { target: { value } })
const send = () => fireEvent.click(screen.getByText('Send'))

describe('AiChatModal', () => {
  it('an "ask" reply shows the question and creates nothing', async () => {
    aiScheduleAi.mockResolvedValue({ status: 'ask', question: 'Which day did you mean?', items: [] })
    render(<AiChatModal onClose={vi.fn()} />)

    type('team meeting')
    await act(async () => {
      send()
    })

    expect(await screen.findByText('Which day did you mean?')).toBeTruthy()
    expect(addTask).not.toHaveBeenCalled()
    expect(pushUndo).not.toHaveBeenCalled()
  })

  it('sends recent task history, most recent first, so the model can learn this account\'s own tagging pattern', async () => {
    mockTasks = [
      { title: 'Old gym session', tagId: 'health', durationMin: 45, startMin: 420, createdAt: 100 },
      { title: 'Recent gym session', tagId: 'health', durationMin: 60, startMin: 450, createdAt: 200 },
    ]
    aiScheduleAi.mockResolvedValue({ status: 'ask', question: 'What time?', items: [] })
    render(<AiChatModal onClose={vi.fn()} />)

    type('gym')
    await act(async () => {
      send()
    })

    expect(aiScheduleAi).toHaveBeenCalledTimes(1)
    expect(aiScheduleAi.mock.calls[0][0].history).toEqual([
      { title: 'Recent gym session', tagId: 'health', durationMin: 60, startMin: 450 },
      { title: 'Old gym session', tagId: 'health', durationMin: 45, startMin: 420 },
    ])
  })

  it('a "create" reply writes every item as a task and fires exactly one undo toast for the whole batch', async () => {
    aiScheduleAi.mockResolvedValue({
      status: 'create',
      question: null,
      items: [
        {
          title: 'Gym',
          date: '2026-08-25',
          startMin: 420,
          durationMin: 60,
          tagId: 'health',
          notes: null,
          priority: 'normal',
        },
        {
          title: 'Dentist',
          date: '2026-08-26',
          startMin: 900,
          durationMin: 30,
          tagId: null,
          notes: null,
          priority: 'normal',
        },
      ],
    })
    const onClose = vi.fn()
    render(<AiChatModal onClose={onClose} />)

    type('gym monday 7am, dentist tuesday 3pm')
    await act(async () => {
      send()
    })

    expect(addTask).toHaveBeenCalledTimes(2)
    expect(addTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Gym', date: '2026-08-25', startMin: 420, durationMin: 60, tagId: 'health' }),
    )
    expect(addTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Dentist', date: '2026-08-26', startMin: 900, durationMin: 30 }),
    )

    // One toast for the whole batch, not one per item.
    expect(pushUndo).toHaveBeenCalledTimes(1)
    expect(pushUndo.mock.calls[0][0]).toBe('Created 2 tasks.')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('undo removes every task the batch created', async () => {
    aiScheduleAi.mockResolvedValue({
      status: 'create',
      question: null,
      items: [{ title: 'Gym', date: null, startMin: null, durationMin: null, tagId: null, notes: null, priority: 'normal' }],
    })
    render(<AiChatModal onClose={vi.fn()} />)

    type('gym sometime')
    await act(async () => {
      send()
    })
    expect(pushUndo).toHaveBeenCalledTimes(1)

    const undo = pushUndo.mock.calls[0][1]
    await act(async () => {
      await undo()
    })
    expect(removeTask).toHaveBeenCalledWith('task-Gym')
  })

  it('when AI cannot be reached, says so in the transcript rather than failing silently or throwing', async () => {
    aiScheduleAi.mockResolvedValue(null)
    render(<AiChatModal onClose={vi.fn()} />)

    type('gym monday')
    await act(async () => {
      send()
    })

    expect(await screen.findByText(/Couldn't reach AI/)).toBeTruthy()
    expect(addTask).not.toHaveBeenCalled()
  })
})
