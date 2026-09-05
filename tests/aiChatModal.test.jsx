/* AiChatModal — the command palette's "AI" entry point. The behaviours
 * worth watching run rather than just reading:
 * - An "ask" reply keeps the conversation open and shows the question
 *   (never acts on anything).
 * - An "act" reply applies every item — create via addTask, update via
 *   updateTask, remove via removeTask — and fires exactly one undo toast
 *   covering the whole batch, never one per item.
 * - The modal no longer closes itself on a successful action (a deliberate
 *   change from the original design): it stays open so a multi-step
 *   conversation doesn't mean reopening the palette every time, and closing
 *   is always the person's own choice.
 * - Undoing a create removes it; undoing a remove restores it
 *   (removeTask is already a soft delete); undoing an update writes back
 *   whatever the task looked like immediately before the patch.
 *
 * Tasks only — see api/ai-schedule.js's own comment on why events were
 * dropped from this route entirely.
 *
 * ScheduleContext/ToastContext are mocked rather than provided for real, the
 * same reasoning taskEditorEnrichment.test.jsx already uses: a real
 * ScheduleContext needs Firebase, and this file has nothing to prove about
 * Firestore — only about what the modal does with an AI answer once it has
 * one. aiScheduleAi is mocked directly rather than mocking fetch underneath
 * it — aiClient.test.jsx already covers that contract.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiChatModal } from '../src/components/shell/AiChatModal.jsx'
import { aiScheduleAi } from '../src/lib/aiClient.js'

const addTask = vi.fn(async (draft) => ({ id: `task-${draft.title}` }))
const updateTask = vi.fn(async () => {})
const removeTask = vi.fn(async () => {})
const restoreItem = vi.fn(async () => {})
const pushUndo = vi.fn()
const pushError = vi.fn()

// A mutable binding inside the mock factory, the same pattern
// aiClient.test.jsx uses for mockCurrentUser: lets one test set real task
// fixtures (for history, or as an update/remove target with real "before"
// values to undo back to), while every other test gets an empty list with
// no setup of its own.
let mockTasks = []

vi.mock('../src/state/ToastContext.jsx', () => ({
  useToast: () => ({ pushUndo, pushError, pushSuccess: vi.fn(), dismiss: vi.fn() }),
}))

vi.mock('../src/state/ScheduleContext.jsx', () => ({
  useSchedule: () => ({
    addTask,
    updateTask,
    removeTask,
    restoreItem,
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
  it('an "ask" reply shows the question and does nothing else', async () => {
    aiScheduleAi.mockResolvedValue({ status: 'ask', question: 'Which day did you mean?', items: [] })
    render(<AiChatModal onClose={vi.fn()} />)

    type('team meeting')
    await act(async () => {
      send()
    })

    expect(await screen.findByText('Which day did you mean?')).toBeTruthy()
    expect(addTask).not.toHaveBeenCalled()
    expect(updateTask).not.toHaveBeenCalled()
    expect(removeTask).not.toHaveBeenCalled()
    expect(pushUndo).not.toHaveBeenCalled()
  })

  it('sends recent task history, most recent first, so the model can learn this account\'s own tagging pattern', async () => {
    mockTasks = [
      { id: 'a', title: 'Old gym session', tagId: 'health', durationMin: 45, startMin: 420, createdAt: 100, done: false, date: null },
      { id: 'b', title: 'Recent gym session', tagId: 'health', durationMin: 60, startMin: 450, createdAt: 200, done: false, date: null },
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

  it('sends only open (not done) tasks as update/remove targets', async () => {
    mockTasks = [
      { id: 'open-1', title: 'Gym', date: '2026-08-25', startMin: 420, durationMin: 60, tagId: 'health', done: false, createdAt: 1 },
      { id: 'done-1', title: 'Old finished thing', date: '2026-08-20', startMin: null, durationMin: 30, tagId: null, done: true, createdAt: 1 },
    ]
    aiScheduleAi.mockResolvedValue({ status: 'ask', question: 'Which one?', items: [] })
    render(<AiChatModal onClose={vi.fn()} />)

    type('cancel the gym thing')
    await act(async () => {
      send()
    })

    const sent = aiScheduleAi.mock.calls[0][0].existingTasks
    expect(sent).toHaveLength(1)
    expect(sent[0]).toEqual({ id: 'open-1', title: 'Gym', date: '2026-08-25', startMin: 420, durationMin: 60, tagId: 'health' })
  })

  it('an "act" reply with a create item writes a task, stays open, and fires one undo toast', async () => {
    aiScheduleAi.mockResolvedValue({
      status: 'act',
      question: null,
      items: [
        {
          action: 'create',
          taskId: null,
          title: 'Gym',
          date: '2026-08-25',
          startMin: 420,
          durationMin: 60,
          tagId: 'health',
          notes: null,
          priority: 'normal',
        },
      ],
    })
    const onClose = vi.fn()
    render(<AiChatModal onClose={onClose} />)

    type('gym monday 7am')
    await act(async () => {
      send()
    })

    expect(addTask).toHaveBeenCalledTimes(1)
    expect(addTask).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Gym', date: '2026-08-25', startMin: 420, durationMin: 60, tagId: 'health' }),
    )
    expect(pushUndo).toHaveBeenCalledTimes(1)
    // The core fix this test guards against regressing: the modal used to
    // close itself right here. It must not anymore.
    expect(onClose).not.toHaveBeenCalled()
    expect(await screen.findByText(/Done — created 1/)).toBeTruthy()
  })

  it('a remove item soft-deletes via removeTask, and undo restores it', async () => {
    mockTasks = [{ id: 'task-1', title: 'Dentist', date: '2026-08-26', startMin: 900, durationMin: 30, tagId: null, done: false, createdAt: 1 }]
    aiScheduleAi.mockResolvedValue({
      status: 'act',
      question: null,
      items: [{ action: 'remove', taskId: 'task-1' }],
    })
    render(<AiChatModal onClose={vi.fn()} />)

    type('cancel the dentist appointment')
    await act(async () => {
      send()
    })

    expect(removeTask).toHaveBeenCalledWith('task-1')
    expect(pushUndo).toHaveBeenCalledTimes(1)

    const undo = pushUndo.mock.calls[0][1]
    await act(async () => {
      await undo()
    })
    expect(restoreItem).toHaveBeenCalledWith('task', 'task-1')
  })

  it('an update item patches via updateTask, and undo writes back the pre-patch values', async () => {
    mockTasks = [{ id: 'task-1', title: 'Gym', date: '2026-08-25', startMin: 420, durationMin: 60, tagId: 'health', done: false, createdAt: 1 }]
    aiScheduleAi.mockResolvedValue({
      status: 'act',
      question: null,
      // The server (api/ai-schedule.js's sanitizeUpdate) returns an
      // already-built patch of only the fields actually changing, not the
      // raw flat fields a create item carries — this is what the client
      // actually receives, so it's what the mock should return too.
      items: [{ action: 'update', taskId: 'task-1', patch: { startMin: 480 } }],
    })
    render(<AiChatModal onClose={vi.fn()} />)

    type('move gym to 8am')
    await act(async () => {
      send()
    })

    expect(updateTask).toHaveBeenCalledWith('task-1', { startMin: 480 })
    expect(pushUndo).toHaveBeenCalledTimes(1)

    const undo = pushUndo.mock.calls[0][1]
    await act(async () => {
      await undo()
    })
    // Reverses only the field that was actually changed, back to its
    // pre-patch value — not a full overwrite of the task.
    expect(updateTask).toHaveBeenLastCalledWith('task-1', { startMin: 420 })
  })

  it('a mixed batch (create + remove in one turn) applies both and reports both in one summary', async () => {
    mockTasks = [{ id: 'task-2', title: 'Old thing', date: null, startMin: null, durationMin: null, tagId: null, done: false, createdAt: 1 }]
    aiScheduleAi.mockResolvedValue({
      status: 'act',
      question: null,
      items: [
        {
          action: 'create',
          taskId: null,
          title: 'Gym',
          date: '2026-08-25',
          startMin: 420,
          durationMin: 60,
          tagId: 'health',
          notes: null,
          priority: 'normal',
        },
        { action: 'remove', taskId: 'task-2' },
      ],
    })
    render(<AiChatModal onClose={vi.fn()} />)

    type('add gym monday 7am and remove the old thing')
    await act(async () => {
      send()
    })

    expect(addTask).toHaveBeenCalledTimes(1)
    expect(removeTask).toHaveBeenCalledWith('task-2')
    expect(pushUndo).toHaveBeenCalledTimes(1)
    expect(pushUndo.mock.calls[0][0]).toBe('Done — created 1, removed 1.')
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
