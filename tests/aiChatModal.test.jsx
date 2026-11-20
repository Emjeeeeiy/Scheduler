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
// What is already on every day with a start time, for the clash notes; empty
// unless a test is about one.
let mockDayItems = []
// The AI route only serves confirmed addresses; most tests are about a
// confirmed account.
let mockEmailVerified = true
const resendVerification = vi.fn(async () => true)
// The account's display name (null: signed in with none), and the minute of the
// day "now" is — pinned, because the empty state greets by the time of day.
let mockDisplayName = null
let mockMin = 19 * 60

vi.mock('../src/state/AuthContext.jsx', () => ({
  useAuth: () => ({
    emailVerified: mockEmailVerified,
    resendVerification,
    user: mockDisplayName === null ? null : { displayName: mockDisplayName },
  }),
}))

// The real day key (the day labels in these tests are judged against it), with the
// minute pinned.
vi.mock('../src/lib/useNow.js', async () => {
  const { todayKey } = await import('@cadence/shared/date.js')
  return { useNow: () => ({ key: todayKey(), min: mockMin }) }
})

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
    tasksOn: () => mockDayItems,
    eventsOn: () => [],
  }),
}))

vi.mock('../src/lib/aiClient.js', () => ({
  aiScheduleAi: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockTasks = []
  mockDayItems = []
  mockEmailVerified = true
  mockDisplayName = null
  mockMin = 19 * 60
})

afterEach(() => {
  vi.restoreAllMocks()
})

const type = (value) => fireEvent.change(screen.getByPlaceholderText('Ask about your day…'), { target: { value } })
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Send' }))
const confirmRemoval = () =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
  })

describe('AiChatModal', () => {
  it('an "ask" reply shows the question and does nothing else', async () => {
    aiScheduleAi.mockResolvedValue({ status: 'reply', reply: 'Which day did you mean?', items: [] })
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
    aiScheduleAi.mockResolvedValue({ status: 'reply', reply: 'What time?', items: [] })
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
    aiScheduleAi.mockResolvedValue({ status: 'reply', reply: 'Which one?', items: [] })
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
      reply: null,
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
      reply: null,
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
      reply: null,
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
      reply: null,
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
      reply: null,
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
    aiScheduleAi.mockResolvedValue({ status: 'act', reply: null, items: [{ action: 'remove', taskId: 'task-1' }] })
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
      reply: null,
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
    expect(screen.getByText(/Ask me to add, move or clear tasks/)).toBeTruthy()
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

    expect(await screen.findByText("Sorry, I couldn't get an answer just now.")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(addTask).not.toHaveBeenCalled()
  })
})

describe('the chat layout', () => {
  const input = () => screen.getByRole('textbox', { name: 'Message' })

  it('opens on an empty state: a greeting, what it can do, and three examples', () => {
    const { container } = render(<AiChatModal onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Ask AI' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 3, name: 'Good evening' })).toBeTruthy()
    expect(
      screen.getByText(/Ask me to add, move or clear tasks — or for ideas when you're stuck\. I'll check before deleting anything\./),
    ).toBeTruthy()
    const examples = within(screen.getByRole('list', { name: 'Examples' })).getAllByRole('button')
    expect(examples.map((el) => el.textContent)).toEqual(['What should I do today?', 'Gym Monday 7am', 'Move dentist to 4pm'])
    // The paragraph, the field label and the placeholder used to say this three times.
    expect(screen.queryByText('What do you need?')).toBeNull()
    expect(container.querySelector('label')).toBeNull()
  })

  it('fills the composer from an example but does not send it — a message can change real tasks', () => {
    render(<AiChatModal onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Move dentist to 4pm' }))
    expect(input().value).toBe('Move dentist to 4pm')
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
    aiScheduleAi.mockResolvedValue({ status: 'reply', reply: 'What time?', items: [] })
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
    aiScheduleAi.mockResolvedValue({ status: 'reply', reply: 'Which day did you mean?', items: [] })
    const { container } = render(<AiChatModal onClose={vi.fn()} />)
    type('team meeting')
    await act(async () => {
      send()
    })
    expect(screen.queryByRole('heading', { name: 'Good evening' })).toBeNull()
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
      finish({ status: 'reply', reply: 'What time?', items: [] })
    })
    expect(screen.queryByRole('status')).toBeNull()
    expect(await screen.findByText('What time?')).toBeTruthy()
  })

  it('scrolls to the newest message', async () => {
    aiScheduleAi.mockResolvedValue({ status: 'reply', reply: 'What time?', items: [] })
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
    aiScheduleAi.mockResolvedValue({ status: 'reply', reply: 'What time?', items: [] })
    render(<AiChatModal onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'New chat' })).toBeNull()
    type('gym')
    await act(async () => {
      send()
    })
    await screen.findByText('What time?')
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    expect(screen.getByRole('heading', { name: 'Good evening' })).toBeTruthy()
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

/* What the reply says it did. The one-line "Done — created 2." gave no day, time
 * or tag and no word about a time that could not be used; now each change is a row
 * (aiChatChanges.js has the wording, tested on its own), and these pin that the
 * rows reach the screen, that a clash warns without stopping anything, and that
 * what the assistant did is what the model is told next turn. */
describe('what the reply reports', () => {
  const gym = {
    action: 'create',
    taskId: null,
    title: 'Gym',
    date: '2026-08-25',
    startMin: 420,
    durationMin: 60,
    tagId: 'health',
    notes: null,
    priority: 'normal',
    issues: [],
  }
  // Not called `act`: that is Testing Library's, used below to flush a send.
  const acts = (items, extra = {}) => ({ status: 'act', reply: null, items, skipped: 0, ...extra })
  const changes = () => screen.getByRole('list', { name: 'Changes' })
  const sendText = async (value, placeholder = 'Ask about your day…') => {
    fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } })
    await act(async () => {
      send()
    })
  }

  it('lists each change under the summary: what, when, how long, and the tag by name', async () => {
    aiScheduleAi.mockResolvedValue(acts([gym]))
    render(<AiChatModal onClose={vi.fn()} />)
    await sendText('gym monday 7am')

    const list = within(changes())
    expect(list.getByText('Added')).toBeTruthy()
    expect(list.getByText('Gym')).toBeTruthy()
    expect(list.getByText(/7:00–8:00 AM/)).toBeTruthy()
    expect(list.getByText(/1h/)).toBeTruthy()
    // A tag is never colour alone.
    expect(list.getByText('Health')).toBeTruthy()
    // …and the summary line is still there, once.
    expect(screen.getAllByText(/Done — created 1/)).toHaveLength(1)
  })

  it('shows what an update changed, from what the task was', async () => {
    mockTasks = [{ id: 'task-1', title: 'Gym', date: '2026-08-25', startMin: 420, durationMin: 60, tagId: 'health', done: false, createdAt: 1 }]
    aiScheduleAi.mockResolvedValue(acts([{ action: 'update', taskId: 'task-1', patch: { startMin: 480 }, issues: [] }]))
    render(<AiChatModal onClose={vi.fn()} />)
    await sendText('move gym to 8am')

    expect(within(changes()).getByText('Changed')).toBeTruthy()
    expect(within(changes()).getByText('Time: 7:00 AM → 8:00 AM')).toBeTruthy()
  })

  // The point of "keep the time": a clash is the person's call, and the chat says
  // so — the task is still made, at the time they gave.
  it('warns about an overlap, names what it overlaps, and still makes the task at that time', async () => {
    mockDayItems = [{ id: 'standup', title: 'Standup', startMin: 450, durationMin: 30 }]
    aiScheduleAi.mockResolvedValue(acts([gym]))
    render(<AiChatModal onClose={vi.fn()} />)
    await sendText('gym monday 7am')

    expect(within(changes()).getByText(/Overlaps “Standup” \(7:30–8:00 AM\) — kept at the time you gave\./)).toBeTruthy()
    expect(addTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Gym', startMin: 420 }))
  })

  it('says so when it could not read a time, instead of quietly showing no time', async () => {
    aiScheduleAi.mockResolvedValue(acts([{ ...gym, startMin: null, issues: ['time'] }]))
    render(<AiChatModal onClose={vi.fn()} />)
    await sendText('gym monday evening-ish')

    expect(within(changes()).getByText(/No time set/)).toBeTruthy()
    expect(within(changes()).getByText(/Couldn’t read a time from that, so it has no start time\./)).toBeTruthy()
  })

  it('says how many it left out, rather than reporting a long list as all done', async () => {
    aiScheduleAi.mockResolvedValue(acts([gym], { skipped: 2 }))
    render(<AiChatModal onClose={vi.fn()} />)
    await sendText('lots of things')

    expect(screen.getByText('2 more couldn’t be added — try them in another message.')).toBeTruthy()
  })

  it('shows what is about to go before asking, so the yes is to the list and not to a count', async () => {
    mockTasks = [{ id: 'task-1', title: 'Dentist', date: '2026-08-26', startMin: 900, durationMin: 30, tagId: null, done: false, createdAt: 1 }]
    aiScheduleAi.mockResolvedValue(acts([{ action: 'remove', taskId: 'task-1', issues: [] }, gym]))
    render(<AiChatModal onClose={vi.fn()} />)
    await sendText('cancel the dentist and add gym')

    const list = within(changes())
    expect(list.getByText('Removed')).toBeTruthy()
    expect(list.getByText('Dentist')).toBeTruthy()
    expect(list.getByText('Added')).toBeTruthy()
    expect(removeTask).not.toHaveBeenCalled()
    expect(addTask).not.toHaveBeenCalled()
  })

  it('keeps the list as a dimmed record once the batch is undone', async () => {
    aiScheduleAi.mockResolvedValue(acts([gym]))
    const { container } = render(<AiChatModal onClose={vi.fn()} />)
    await sendText('gym monday 7am')
    expect(container.querySelector('.ai-chat__changes--undone')).toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    })
    expect(container.querySelector('.ai-chat__changes--undone')).toBeTruthy()
    expect(screen.getByText('Undone.')).toBeTruthy()
  })

  it('lists only what actually landed when the batch stops part way', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    addTask.mockImplementationOnce(async (draft) => ({ id: `task-${draft.title}` }))
    addTask.mockRejectedValueOnce(new Error('offline'))
    aiScheduleAi.mockResolvedValue(acts([gym, { ...gym, title: 'Swim' }, { ...gym, title: 'Run' }]))
    render(<AiChatModal onClose={vi.fn()} />)
    await sendText('three things')

    const list = within(changes())
    expect(list.getByText('Gym')).toBeTruthy()
    expect(list.queryByText('Swim')).toBeNull()
    expect(list.queryByText('Run')).toBeNull()
  })

  describe('what the model is told next turn', () => {
    const second = async () => {
      aiScheduleAi.mockResolvedValue({ status: 'reply', reply: 'Sure.', items: [] })
      await sendText('make that 8pm instead', 'Reply…')
    }

    it('is words only, and says what the assistant did — not just that it did', async () => {
      aiScheduleAi.mockResolvedValueOnce(acts([gym]))
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('gym monday 7am')
      await second()

      const sent = aiScheduleAi.mock.calls[1][0].messages
      expect(sent).toEqual([
        { role: 'user', content: 'gym monday 7am' },
        { role: 'assistant', content: 'Done — created 1.\nCreated "Gym" on 2026-08-25 at 07:00 for 60 min.' },
        { role: 'user', content: 'make that 8pm instead' },
      ])
    })

    it('says so when what the assistant did has since been undone', async () => {
      aiScheduleAi.mockResolvedValueOnce(acts([gym]))
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('gym monday 7am')
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
      })
      await second()

      const assistant = aiScheduleAi.mock.calls[1][0].messages[1]
      expect(assistant.content).toMatch(/\(All of that was undone\.\)$/)
    })

    it('sends a plain question as it was asked', async () => {
      aiScheduleAi.mockResolvedValueOnce({ status: 'reply', reply: 'Which day?', items: [] })
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('gym')
      await second()
      expect(aiScheduleAi.mock.calls[1][0].messages[1]).toEqual({ role: 'assistant', content: 'Which day?' })
    })
  })

  describe('the box', () => {
    const box = () => screen.getByPlaceholderText('Ask about your day…')

    // Regression: the server used to clip a message at 2000 characters without a
    // word, so the end of a detailed message — often where the times are — never
    // reached the model. The box now stops where the server does.
    it('stops at the length the server keeps, so nothing is clipped unseen', () => {
      render(<AiChatModal onClose={vi.fn()} />)
      expect(box().maxLength).toBe(4000)
    })

    it('counts down only near the limit', () => {
      render(<AiChatModal onClose={vi.fn()} />)
      fireEvent.change(box(), { target: { value: 'x'.repeat(3000) } })
      expect(screen.queryByText(/characters? left/)).toBeNull()
      fireEvent.change(box(), { target: { value: 'x'.repeat(3750) } })
      expect(screen.getByText('250 characters left')).toBeTruthy()
      fireEvent.change(box(), { target: { value: 'x'.repeat(3999) } })
      expect(screen.getByText('1 character left')).toBeTruthy()
    })
  })
})

/* The chat as a companion: it greets by name, answers in words, offers ideas that
 * only become tasks on a tap, says what it did in its own sentence, and when no
 * answer comes back it says so kindly and offers to ask again — without that error
 * line ever being passed to the model as something the assistant said. */
describe('talking, suggesting and recovering', () => {
  const idea = (title, startMin) => ({
    action: 'create',
    taskId: null,
    title,
    date: '2026-08-25',
    startMin,
    durationMin: 30,
    tagId: null,
    notes: 'Quick and easy.',
    priority: 'normal',
    issues: [],
  })
  const offered = () => ({
    status: 'suggest',
    reply: 'Here are a few ideas.',
    items: [idea('Read', 540), idea('Tidy desk', 600), idea('Plan tomorrow', 660)],
    skipped: 0,
  })
  const sendText = async (value, placeholder = 'Ask about your day…') => {
    fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } })
    await act(async () => {
      send()
    })
  }
  const press = (name) =>
    act(async () => {
      fireEvent.click(screen.getByRole('button', { name }))
    })

  describe('the greeting', () => {
    it('is by the time of day, with the first name when the account has one', () => {
      mockDisplayName = 'Sam Rivera'
      const { unmount } = render(<AiChatModal onClose={vi.fn()} />)
      expect(screen.getByRole('heading', { level: 3, name: 'Good evening, Sam' })).toBeTruthy()
      expect(screen.queryByText(/Rivera/)).toBeNull()
      unmount()

      mockMin = 8 * 60
      render(<AiChatModal onClose={vi.fn()} />)
      expect(screen.getByRole('heading', { level: 3, name: 'Good morning, Sam' })).toBeTruthy()
    })

    it('is plain without a name, and "Hello" in the small hours', () => {
      mockMin = 2 * 60
      render(<AiChatModal onClose={vi.fn()} />)
      expect(screen.getByRole('heading', { level: 3, name: 'Hello' })).toBeTruthy()
    })

    it('never greets by an email address a display name was set to', () => {
      mockDisplayName = 'sam@example.com'
      render(<AiChatModal onClose={vi.fn()} />)
      expect(screen.getByRole('heading', { level: 3, name: 'Good evening' })).toBeTruthy()
    })
  })

  describe('what is sent about the person', () => {
    it('is the first word of the name, never the whole of it', async () => {
      mockDisplayName = 'Sam Rivera'
      aiScheduleAi.mockResolvedValue({ status: 'reply', reply: 'Hi Sam!', items: [] })
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('hi')

      const payload = aiScheduleAi.mock.calls[0][0]
      expect(payload.firstName).toBe('Sam')
      expect(JSON.stringify(payload)).not.toContain('Rivera')
    })

    it('is an empty name when the account has none', async () => {
      aiScheduleAi.mockResolvedValue({ status: 'reply', reply: 'Hi!', items: [] })
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('hi')
      expect(aiScheduleAi.mock.calls[0][0].firstName).toBe('')
    })
  })

  describe('a reply', () => {
    it('is words, and changes nothing', async () => {
      aiScheduleAi.mockResolvedValue({ status: 'reply', reply: 'Hi Sam! What shall we plan?', items: [] })
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('hi')

      expect(await screen.findByText('Hi Sam! What shall we plan?')).toBeTruthy()
      expect(addTask).not.toHaveBeenCalled()
      expect(updateTask).not.toHaveBeenCalled()
      expect(removeTask).not.toHaveBeenCalled()
      expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    })

    it('still shows the question an older server called "question"', async () => {
      aiScheduleAi.mockResolvedValue({ status: 'ask', question: 'Which day did you mean?', items: [] })
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('gym')
      expect(await screen.findByText('Which day did you mean?')).toBeTruthy()
    })

    it('with nothing to say is a failure with a way to try again, not an empty bubble', async () => {
      aiScheduleAi.mockResolvedValue({ status: 'reply', reply: '  ', items: [] })
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('hi')
      expect(await screen.findByRole('button', { name: 'Try again' })).toBeTruthy()
    })
  })

  describe('ideas', () => {
    it('are listed with an Add each, and nothing is created until one is tapped', async () => {
      aiScheduleAi.mockResolvedValue(offered())
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('anything you suggest')

      expect(screen.getByText('Here are a few ideas.')).toBeTruthy()
      const list = within(screen.getByRole('list', { name: 'Ideas' }))
      expect(list.getAllByText('Idea')).toHaveLength(3)
      expect(list.getByText('Read')).toBeTruthy()
      for (const title of ['Read', 'Tidy desk', 'Plan tomorrow']) {
        expect(list.getByRole('button', { name: `Add ${title}` })).toBeTruthy()
      }
      expect(screen.getByRole('button', { name: 'Add all' })).toBeTruthy()
      // Not shown a second time as a list of changes made.
      expect(screen.queryByRole('list', { name: 'Changes' })).toBeNull()
      expect(addTask).not.toHaveBeenCalled()
    })

    it('Add creates exactly that one, reports it with an Undo, and marks the row as added', async () => {
      aiScheduleAi.mockResolvedValue(offered())
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('anything you suggest')
      await press('Add Tidy desk')

      expect(addTask).toHaveBeenCalledTimes(1)
      expect(addTask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Tidy desk', startMin: 600, durationMin: 30 }))
      expect(screen.getByText('Added “Tidy desk”.')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()

      const list = within(screen.getByRole('list', { name: 'Ideas' }))
      expect(list.queryByRole('button', { name: 'Add Tidy desk' })).toBeNull()
      expect(list.getByText('Added')).toBeTruthy()
      // The others are still there to take.
      expect(list.getByRole('button', { name: 'Add Read' })).toBeTruthy()
      expect(list.getByRole('button', { name: 'Add Plan tomorrow' })).toBeTruthy()
    })

    it('Add all makes every one in one batch, with one Undo', async () => {
      aiScheduleAi.mockResolvedValue(offered())
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('give me a list')
      await press('Add all')

      expect(addTask).toHaveBeenCalledTimes(3)
      expect(screen.getAllByText('Done — created 3.')).toHaveLength(1)
      expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1)
      expect(screen.queryByRole('button', { name: 'Add all' })).toBeNull()
      expect(within(screen.getByRole('list', { name: 'Ideas' })).getAllByText('Added')).toHaveLength(3)
    })

    it('after one is added, the button takes only the rest', async () => {
      aiScheduleAi.mockResolvedValue(offered())
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('give me a list')
      await press('Add Read')
      expect(screen.getByRole('button', { name: 'Add the rest' })).toBeTruthy()

      await press('Add the rest')
      expect(addTask).toHaveBeenCalledTimes(3)
      expect(addTask.mock.calls.map(([draft]) => draft.title)).toEqual(['Read', 'Tidy desk', 'Plan tomorrow'])
    })

    it('stop offering "Add all" when only one is left to add', async () => {
      aiScheduleAi.mockResolvedValue(offered())
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('give me a list')
      await press('Add Read')
      await press('Add Tidy desk')
      expect(screen.queryByRole('button', { name: /Add (all|the rest)/ })).toBeNull()
    })

    it('can be taken again after the Add is undone', async () => {
      aiScheduleAi.mockResolvedValue(offered())
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('give me a list')
      await press('Add Read')
      expect(screen.queryByRole('button', { name: 'Add Read' })).toBeNull()

      await press('Undo')
      expect(removeTask).toHaveBeenCalledWith('task-Read')
      expect(screen.getByRole('button', { name: 'Add Read' })).toBeTruthy()
    })

    it('go back to the model as words, marked as not added yet', async () => {
      aiScheduleAi.mockResolvedValueOnce(offered())
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('give me a list')
      aiScheduleAi.mockResolvedValueOnce({ status: 'reply', reply: 'Sure.', items: [] })
      await sendText('hm, maybe', 'Reply…')

      expect(aiScheduleAi.mock.calls[1][0].messages[1]).toEqual({
        role: 'assistant',
        content: [
          'Here are a few ideas.',
          'Suggested "Read" on 2026-08-25 at 09:00 for 30 min (not added yet).',
          'Suggested "Tidy desk" on 2026-08-25 at 10:00 for 30 min (not added yet).',
          'Suggested "Plan tomorrow" on 2026-08-25 at 11:00 for 30 min (not added yet).',
        ].join('\n'),
      })
    })
  })

  describe('what it did, said in its own words', () => {
    const gym = {
      action: 'create',
      taskId: null,
      title: 'Gym',
      date: '2026-08-25',
      startMin: 420,
      durationMin: 60,
      tagId: null,
      notes: null,
      priority: 'normal',
      issues: [],
    }

    it('is its sentence when everything landed, with the same rows and Undo under it', async () => {
      aiScheduleAi.mockResolvedValue({ status: 'act', reply: 'Done! Gym is on your list for 7 AM.', items: [gym], skipped: 0 })
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('gym monday 7am')

      expect(screen.getByText('Done! Gym is on your list for 7 AM.')).toBeTruthy()
      expect(screen.queryByText('Done — created 1.')).toBeNull()
      expect(screen.getByRole('list', { name: 'Changes' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
    })

    it('is the plain count when there was no sentence', async () => {
      aiScheduleAi.mockResolvedValue({ status: 'act', reply: null, items: [gym], skipped: 0 })
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('gym monday 7am')
      expect(screen.getByText('Done — created 1.')).toBeTruthy()
    })

    it('is the count, not its sentence, when the batch stopped part way — the sentence was for all of it', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      addTask.mockImplementationOnce(async (draft) => ({ id: `task-${draft.title}` }))
      addTask.mockRejectedValueOnce(new Error('offline'))
      aiScheduleAi.mockResolvedValue({
        status: 'act',
        reply: 'All set, both are on your list!',
        items: [gym, { ...gym, title: 'Swim' }],
        skipped: 0,
      })
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('gym and swim')

      expect(screen.queryByText('All set, both are on your list!')).toBeNull()
      expect(screen.getByText('Done — created 1.')).toBeTruthy()
    })

    it("does not replace the question before a removal: that sentence is the app's own", async () => {
      mockTasks = [{ id: 'task-1', title: 'Dentist', date: '2026-08-26', startMin: 900, durationMin: 30, tagId: null, done: false, createdAt: 1 }]
      aiScheduleAi.mockResolvedValue({
        status: 'act',
        reply: 'Sure, gone!',
        items: [{ action: 'remove', taskId: 'task-1', issues: [] }],
        skipped: 0,
      })
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('cancel the dentist')

      expect(screen.getByText('Remove 1 task: “Dentist”?')).toBeTruthy()
      expect(screen.queryByText('Sure, gone!')).toBeNull()
      expect(removeTask).not.toHaveBeenCalled()
    })
  })

  describe('when no answer comes back', () => {
    it('says so kindly, and Try again asks the same thing a second time', async () => {
      aiScheduleAi.mockResolvedValueOnce(null)
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('give me a list')
      expect(await screen.findByText("Sorry, I couldn't get an answer just now.")).toBeTruthy()

      aiScheduleAi.mockResolvedValueOnce(offered())
      await press('Try again')

      expect(aiScheduleAi).toHaveBeenCalledTimes(2)
      expect(aiScheduleAi.mock.calls[1][0].messages).toEqual(aiScheduleAi.mock.calls[0][0].messages)
      expect(aiScheduleAi.mock.calls[1][0].messages).toEqual([{ role: 'user', content: 'give me a list' }])
      expect(await screen.findByText('Here are a few ideas.')).toBeTruthy()
      // Used once: the button does not linger under a failure that has been retried.
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    })

    it('never tells the model the failure line was something it said', async () => {
      aiScheduleAi.mockResolvedValueOnce(null)
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('anything you suggest')
      await screen.findByText("Sorry, I couldn't get an answer just now.")

      aiScheduleAi.mockResolvedValueOnce({ status: 'reply', reply: 'Sure.', items: [] })
      await sendText('hm?', 'Reply…')

      expect(aiScheduleAi.mock.calls[1][0].messages).toEqual([
        { role: 'user', content: 'anything you suggest' },
        { role: 'user', content: 'hm?' },
      ])
    })

    it('offers Try again only under the newest line', async () => {
      aiScheduleAi.mockResolvedValueOnce(null)
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('anything you suggest')
      await screen.findByRole('button', { name: 'Try again' })

      aiScheduleAi.mockResolvedValueOnce({ status: 'reply', reply: 'Sure.', items: [] })
      await sendText('hm?', 'Reply…')
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    })

    it('a second failure offers Try again again', async () => {
      aiScheduleAi.mockResolvedValue(null)
      render(<AiChatModal onClose={vi.fn()} />)
      await sendText('give me a list')
      await press('Try again')
      expect(screen.getAllByText("Sorry, I couldn't get an answer just now.")).toHaveLength(2)
      expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1)
    })
  })
})
