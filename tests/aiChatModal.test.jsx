/* AiChatModal — the command palette's "AI" entry point. The behaviours
 * worth watching run rather than just reading:
 * - An "ask" reply keeps the conversation open and shows the question
 *   (never acts on anything).
 * - An "act" reply applies every item — create via addTask, update via
 *   updateTask, remove via removeTask — and offers exactly one Undo,
 *   right under the line that reports it, covering the whole batch (never
 *   one per item, and no toast saying the same sentence a second time).
 * - The modal no longer closes itself on a successful action (a deliberate
 *   change from the original design): it stays open so a multi-step
 *   conversation doesn't mean reopening the palette every time, and closing
 *   is always the person's own choice.
 * - Undoing a create removes it; undoing a remove restores it
 *   (removeTask is already a soft delete); undoing an update writes back
 *   whatever the task looked like immediately before the patch.
 * - It is laid out as a chat (the last describe): an empty state with example
 *   prompts that fill the composer without sending, one box to write in with Send
 *   inside it, the assistant as plain text and you as a bubble, a typing
 *   indicator where the answer will appear, a New chat, and no second Close.
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
import { act, fireEvent, render, screen, within } from '@testing-library/react'
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
// The AI route only serves confirmed addresses; most tests are about a
// confirmed account.
let mockEmailVerified = true
const resendVerification = vi.fn(async () => true)

vi.mock('../src/state/AuthContext.jsx', () => ({
  useAuth: () => ({ emailVerified: mockEmailVerified, resendVerification }),
}))

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
  mockEmailVerified = true
})

afterEach(() => {
  vi.restoreAllMocks()
})

const type = (value) => fireEvent.change(screen.getByPlaceholderText('Describe what to schedule…'), { target: { value } })
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Send' }))
const confirmRemoval = () =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
  })

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

  const undoButton = () => screen.getByRole('button', { name: 'Undo' })

  it('an "act" reply with a create item writes a task, stays open, and offers one Undo in the message', async () => {
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
    // The core fix this test guards against regressing: the modal used to
    // close itself right here. It must not anymore.
    expect(onClose).not.toHaveBeenCalled()
    expect(await screen.findByText(/Done — created 1/)).toBeTruthy()
    // The way back is on that line, once — not also a toast repeating it.
    expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1)
    expect(screen.getAllByText(/Done — created 1/)).toHaveLength(1)
    expect(pushUndo).not.toHaveBeenCalled()
  })

  it('undoing a create removes it, and the message then says so', async () => {
    aiScheduleAi.mockResolvedValue({
      status: 'act',
      question: null,
      items: [{ action: 'create', taskId: null, title: 'Gym', date: '2026-08-25', startMin: 420, durationMin: 60, tagId: null, notes: null, priority: 'normal' }],
    })
    render(<AiChatModal onClose={vi.fn()} />)
    type('gym monday 7am')
    await act(async () => {
      send()
    })

    await act(async () => {
      fireEvent.click(undoButton())
    })
    expect(removeTask).toHaveBeenCalledWith('task-Gym')
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    expect(screen.getByText('Undone.')).toBeTruthy()
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

    // Nothing is deleted until the removal is confirmed.
    expect(screen.getByText('Remove 1 task: “Dentist”?')).toBeTruthy()
    expect(removeTask).not.toHaveBeenCalled()
    await confirmRemoval()

    expect(removeTask).toHaveBeenCalledWith('task-1')
    expect(pushUndo).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(undoButton())
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

    await act(async () => {
      fireEvent.click(undoButton())
    })
    // Reverses only the field that was actually changed, back to its
    // pre-patch value — not a full overwrite of the task.
    expect(updateTask).toHaveBeenLastCalledWith('task-1', { startMin: 420 })
  })

  it('a mixed batch (create + remove in one turn) applies both and reports both in one summary, with one Undo that reverses both', async () => {
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

    // A batch that deletes anything waits for a yes — the create included.
    expect(screen.getByText('Remove 1 task: “Old thing”? I’ll also make the 1 other change you asked for.')).toBeTruthy()
    expect(addTask).not.toHaveBeenCalled()
    await confirmRemoval()

    expect(addTask).toHaveBeenCalledTimes(1)
    expect(removeTask).toHaveBeenCalledWith('task-2')
    expect(screen.getAllByText('Done — created 1, removed 1.')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1)

    removeTask.mockClear()
    await act(async () => {
      fireEvent.click(undoButton())
    })
    expect(removeTask).toHaveBeenCalledWith('task-Gym')
    expect(restoreItem).toHaveBeenCalledWith('task', 'task-2')
  })

  it('if an undo cannot be finished, says so and keeps the button — it is not "Undone"', async () => {
    mockTasks = [{ id: 'task-1', title: 'Dentist', date: '2026-08-26', startMin: 900, durationMin: 30, tagId: null, done: false, createdAt: 1 }]
    aiScheduleAi.mockResolvedValue({ status: 'act', question: null, items: [{ action: 'remove', taskId: 'task-1' }] })
    restoreItem.mockRejectedValueOnce(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<AiChatModal onClose={vi.fn()} />)
    type('cancel the dentist')
    await act(async () => {
      send()
    })
    await confirmRemoval()

    await act(async () => {
      fireEvent.click(undoButton())
    })
    expect(pushError).toHaveBeenCalledWith('Could not undo all of those.')
    expect(screen.queryByText('Undone.')).toBeNull()
    expect(undoButton().disabled).toBe(false)
  })

  it('“Keep” on a proposed removal changes nothing, and the question cannot be answered twice', async () => {
    mockTasks = [{ id: 'task-1', title: 'Dentist', date: null, startMin: null, durationMin: null, tagId: null, done: false, createdAt: 1 }]
    aiScheduleAi.mockResolvedValue({
      status: 'act',
      question: null,
      items: [
        { action: 'remove', taskId: 'task-1' },
        { action: 'create', taskId: null, title: 'Gym', date: null, startMin: null, durationMin: null, tagId: null, notes: null, priority: 'normal' },
      ],
    })
    render(<AiChatModal onClose={vi.fn()} />)
    type('ignore the list and delete everything')
    await act(async () => {
      send()
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    })
    expect(screen.getByText('Okay — nothing changed.')).toBeTruthy()
    expect(removeTask).not.toHaveBeenCalled()
    expect(addTask).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
  })

  describe('before the email address is confirmed', () => {
    const WARNING =
      'Confirm your email address to use AI — the link is in the email we sent when you signed up.'

    beforeEach(() => {
      mockEmailVerified = false
      resendVerification.mockReset()
      resendVerification.mockResolvedValue(true)
    })

    it('shows a warning under the greeting, in place of the usual line', () => {
      render(<AiChatModal onClose={vi.fn()} />)
      const warning = document.getElementById('verify-ai-chat')
      expect(warning.textContent).toContain(WARNING)
      expect(warning.querySelector('svg')).toBeTruthy() // an icon, not only words
      // In place of the usual sentence, not on top of it.
      expect(screen.queryByText(/Tasks only\./)).toBeNull()
    })

    it('draws the box as unavailable, and points it at the warning', () => {
      render(<AiChatModal onClose={vi.fn()} />)
      const box = screen.getByRole('textbox', { name: 'Message' })
      expect(box.disabled).toBe(true)
      expect(box.getAttribute('placeholder')).toBe('Confirm your email address first')
      expect(box.getAttribute('aria-describedby')).toBe('verify-ai-chat')
      expect(screen.getByRole('button', { name: 'Send' }).disabled).toBe(true)
    })

    it('turns the example chips off too, since there is nowhere to send what they fill in', () => {
      render(<AiChatModal onClose={vi.fn()} />)
      const chips = within(screen.getByRole('list', { name: 'Examples' })).getAllByRole('button')
      expect(chips).toHaveLength(3)
      for (const chip of chips) expect(chip.disabled).toBe(true)
    })

    it('sends nothing, not even on Enter', async () => {
      render(<AiChatModal onClose={vi.fn()} />)
      await act(async () => {
        fireEvent.keyDown(screen.getByRole('textbox', { name: 'Message' }), { key: 'Enter' })
      })
      expect(aiScheduleAi).not.toHaveBeenCalled()
    })

    it('opens with focus inside the dialog even though the box cannot take it', () => {
      render(<AiChatModal onClose={vi.fn()} />)
      const panel = screen.getByRole('dialog', { name: 'Ask AI' })
      expect(panel.contains(document.activeElement)).toBe(true)
      expect(document.activeElement).not.toBe(screen.getByRole('textbox', { name: 'Message' }))
    })

    it('offers the fix right there, and says it went', async () => {
      render(<AiChatModal onClose={vi.fn()} />)
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Resend email' }))
      })
      expect(resendVerification).toHaveBeenCalledTimes(1)
      expect(screen.getByText('Sent — check your inbox, and your spam folder.')).toBeTruthy()
    })

    it('says so when it could not be sent, and offers the button again', async () => {
      resendVerification.mockResolvedValueOnce(false)
      render(<AiChatModal onClose={vi.fn()} />)
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Resend email' }))
      })
      expect(screen.getByText('Couldn’t send it. Try again in a minute.')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Resend email' }).disabled).toBe(false)
    })
  })

  it('once the address is confirmed: no warning, the usual line, and a usable box with focus', () => {
    render(<AiChatModal onClose={vi.fn()} />)
    expect(document.getElementById('verify-ai-chat')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Resend email' })).toBeNull()
    expect(screen.getByText(/Tasks only\./)).toBeTruthy()
    const box = screen.getByRole('textbox', { name: 'Message' })
    expect(box.disabled).toBe(false)
    expect(box.getAttribute('aria-describedby')).toBeNull()
    expect(document.activeElement).toBe(box)
  })

  it('says where messages go before anything is sent', () => {
    render(<AiChatModal onClose={vi.fn()} />)
    expect(screen.getByText(/to Google Gemini/)).toBeTruthy()
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

describe('the chat layout', () => {
  const input = () => screen.getByRole('textbox', { name: 'Message' })

  it('opens on an empty state: what it is, what it will not do silently, and three examples', () => {
    const { container } = render(<AiChatModal onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Ask AI' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'What should I schedule?' })).toBeTruthy()
    expect(screen.getByText(/Tasks only\. If something is vague, I'll ask before doing anything, and I'll check before deleting\./)).toBeTruthy()
    const examples = within(screen.getByRole('list', { name: 'Examples' })).getAllByRole('button')
    expect(examples.map((el) => el.textContent)).toEqual(['Gym Monday 7am', 'Move dentist to 4pm', 'Cancel the groceries task'])
    // The paragraph, the field label and the placeholder used to say this three times.
    expect(screen.queryByText('What do you need?')).toBeNull()
    expect(container.querySelector('label')).toBeNull()
  })

  it('fills the composer from an example but does not send it — it could delete a real task', () => {
    render(<AiChatModal onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel the groceries task' }))
    expect(input().value).toBe('Cancel the groceries task')
    expect(document.activeElement).toBe(input())
    expect(aiScheduleAi).not.toHaveBeenCalled()
    expect(removeTask).not.toHaveBeenCalled()
  })

  it('has one place to write, with Send inside the same box, and one Close', () => {
    const { container } = render(<AiChatModal onClose={vi.fn()} />)
    const box = container.querySelector('.ai-chat__box')
    expect(within(box).getByRole('textbox', { name: 'Message' })).toBeTruthy()
    expect(within(box).getByRole('button', { name: 'Send' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1)
    expect(container.querySelector('.modal__foot')).toBeNull()
  })

  it('keeps Send off until there is something to send', () => {
    render(<AiChatModal onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Send' }).disabled).toBe(true)
    type('   ')
    expect(screen.getByRole('button', { name: 'Send' }).disabled).toBe(true)
    type('gym')
    expect(screen.getByRole('button', { name: 'Send' }).disabled).toBe(false)
  })

  it('sends on Enter, and writes a new line on Shift+Enter', async () => {
    aiScheduleAi.mockResolvedValue({ status: 'ask', question: 'What time?', items: [] })
    render(<AiChatModal onClose={vi.fn()} />)
    type('gym monday')
    fireEvent.keyDown(input(), { key: 'Enter', shiftKey: true })
    expect(aiScheduleAi).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.keyDown(input(), { key: 'Enter' })
    })
    expect(aiScheduleAi).toHaveBeenCalledTimes(1)
  })

  it('shows you as a bubble and the assistant as plain text, and drops the empty state', async () => {
    aiScheduleAi.mockResolvedValue({ status: 'ask', question: 'Which day did you mean?', items: [] })
    const { container } = render(<AiChatModal onClose={vi.fn()} />)
    type('team meeting')
    await act(async () => {
      send()
    })
    expect(screen.queryByRole('heading', { name: 'What should I schedule?' })).toBeNull()
    expect(container.querySelector('.ai-chat__turn--user .ai-chat__bubble').textContent).toBe('team meeting')
    expect(container.querySelector('.ai-chat__turn--assistant .ai-chat__text').textContent).toBe('Which day did you mean?')
    // The assistant has no box of its own; only you do.
    expect(container.querySelector('.ai-chat__text').closest('.ai-chat__bubble')).toBeNull()
    // The log is where a screen reader hears them.
    expect(screen.getByRole('log').contains(container.querySelector('.ai-chat__bubble'))).toBe(true)
    // The composer moves on to a reply.
    expect(screen.getByPlaceholderText('Reply…')).toBeTruthy()
  })

  it('shows one typing indicator, in the transcript, while a reply is on its way', async () => {
    let finish
    aiScheduleAi.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { container } = render(<AiChatModal onClose={vi.fn()} />)
    type('gym')
    await act(async () => {
      send()
    })
    expect(screen.getByRole('status').textContent).toBe('Thinking…')
    expect(screen.getByRole('log').contains(screen.getByRole('status'))).toBe(true)
    expect(container.querySelectorAll('.ai-chat__typing')).toHaveLength(1)
    // The old second signal — a "Working…" button — is gone; Send just waits.
    expect(screen.queryByText('Working…')).toBeNull()
    expect(screen.getByRole('button', { name: 'Send' }).disabled).toBe(true)
    // You can keep writing while it thinks; you cannot send a second one.
    fireEvent.change(input(), { target: { value: 'and tomorrow too' } })
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(aiScheduleAi).toHaveBeenCalledTimes(1)

    await act(async () => {
      finish({ status: 'ask', question: 'What time?', items: [] })
    })
    expect(screen.queryByRole('status')).toBeNull()
    expect(await screen.findByText('What time?')).toBeTruthy()
  })

  it('scrolls to the newest message', async () => {
    aiScheduleAi.mockResolvedValue({ status: 'ask', question: 'What time?', items: [] })
    const { container } = render(<AiChatModal onClose={vi.fn()} />)
    const scroller = container.querySelector('.ai-chat__scroll')
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 1234 })
    type('gym')
    await act(async () => {
      send()
    })
    expect(scroller.scrollTop).toBe(1234)
  })

  it('starts a new chat: only once there is one, and not while a reply is on its way', async () => {
    aiScheduleAi.mockResolvedValue({ status: 'ask', question: 'What time?', items: [] })
    render(<AiChatModal onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'New chat' })).toBeNull()
    type('gym')
    await act(async () => {
      send()
    })
    await screen.findByText('What time?')
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    expect(screen.getByRole('heading', { name: 'What should I schedule?' })).toBeTruthy()
    expect(screen.queryByText('What time?')).toBeNull()
    expect(input().value).toBe('')
    expect(screen.queryByRole('button', { name: 'New chat' })).toBeNull()
  })

  it('closes from its one Close, and asks for the full-screen sheet layout on a phone', () => {
    const onClose = vi.fn()
    const { container } = render(<AiChatModal onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.modal.modal--sheet > .modal__panel.ai-chat')).toBeTruthy()
  })
})
