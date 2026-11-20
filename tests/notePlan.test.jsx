/* The Journal's side of the schedule: "Plan it", "Send to schedule", and what a
 * day note's band can DO (add a task, carry the day on, copy it into the note).
 *
 * What is worth pinning is the contract, not the layout:
 *
 * - Plan it shows a note's checklist lines at once, with no network, and only
 *   then — if the account may use AI and there is a connection — lets AI add to
 *   them. Nothing is sent otherwise, and what is sent is the note's text as plain
 *   lines (never a ticked item, never an image or drawing);
 * - a proposal writes nothing until it is accepted, and then writes exactly the
 *   ticked rows, field by field, with ONE Undo for the batch;
 * - an answer that arrives after Dismiss is for a plan nobody is looking at;
 * - Send to schedule exists only while the caret is in a checklist line;
 * - the band's tools put things where they were asked and can be undone.
 *
 * The planning day is the note's day when that is still ahead, so these notes are
 * for a day five days out: nothing before "now" can leak into a time.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, todayKey } from '@cadence/shared/date.js'
import { JournalView } from '../src/components/views/JournalView.jsx'
import { ThemeProvider } from '../src/state/ThemeContext.jsx'
import { addMockDayNote, resetMockJournal } from './smoke/mockJournal.js'
import { installProseMirrorDom } from './helpers/prosemirrorDom.js'

const toast = vi.hoisted(() => ({
  pushError: vi.fn(),
  pushSuccess: vi.fn(),
  pushWarning: vi.fn(),
  pushUndo: vi.fn(),
}))
const schedule = vi.hoisted(() => ({
  tasks: {},
  events: {},
  toggleDone: vi.fn(),
  addTask: vi.fn(),
  removeTask: vi.fn(),
  scheduleTask: vi.fn(),
}))
const auth = vi.hoisted(() => ({ emailVerified: true }))
const ai = vi.hoisted(() => ({ notePlanAi: vi.fn() }))

vi.mock('../src/state/useJournal.js', async () => import('./smoke/mockJournal.js'))
vi.mock('../src/state/ScheduleContext.jsx', () => ({
  useSchedule: () => ({
    tasksOn: (key) => schedule.tasks[key] ?? [],
    eventsOn: (key) => schedule.events[key] ?? [],
    getTag: () => null,
    toggleDone: schedule.toggleDone,
    addTask: schedule.addTask,
    removeTask: schedule.removeTask,
    scheduleTask: schedule.scheduleTask,
  }),
}))
vi.mock('../src/state/AuthContext.jsx', () => ({
  useAuth: () => ({
    emailVerified: auth.emailVerified,
    resendVerification: vi.fn(async () => true),
    checkVerification: vi.fn(async () => false),
  }),
}))
vi.mock('../src/lib/aiClient.js', () => ({ notePlanAi: ai.notePlanAi }))
vi.mock('../src/state/ToastContext.jsx', () => ({ useToast: () => toast }))
vi.mock('../src/state/SettingsContext.jsx', () => ({
  useSettings: () => ({ settings: { journalPaper: null, workingHours: null }, updateSetting: vi.fn() }),
}))
vi.mock('../src/lib/journalFonts.js', async (importOriginal) => ({
  ...(await importOriginal()),
  loadJournalFonts: vi.fn(),
}))

const TODAY = todayKey()
const FUTURE = addDays(TODAY, 5) // the note's day, and so the planning day
const AFTER = addDays(FUTURE, 1) // "tomorrow", as the note reads it
const PAST = '2026-03-02'

beforeAll(installProseMirrorDom)
beforeEach(() => {
  resetMockJournal()
  localStorage.clear()
  for (const fn of Object.values(toast)) fn.mockReset()
  schedule.tasks = {}
  schedule.events = {}
  for (const key of ['toggleDone', 'addTask', 'removeTask', 'scheduleTask']) schedule[key].mockReset()
  let created = 0
  schedule.addTask.mockImplementation(async () => ({ id: `t${++created}` }))
  schedule.removeTask.mockResolvedValue(undefined)
  schedule.scheduleTask.mockResolvedValue(undefined)
  auth.emailVerified = true
  ai.notePlanAi.mockReset()
  ai.notePlanAi.mockResolvedValue([])
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  // A few tests silence console.error to keep an expected failure quiet.
  console.error.mockRestore?.()
})

const text = (value) => ({ type: 'text', text: value })
const para = (value) => ({ type: 'paragraph', content: value ? [text(value)] : undefined })
const item = (checked, label) => ({ type: 'taskItem', attrs: { checked }, content: [para(label)] })
const doc = (...content) => ({ type: 'doc', content })

const WEEK = doc(
  para('Thinking about the week.'),
  {
    type: 'taskList',
    content: [item(false, 'Call Ana tomorrow at 3pm'), item(true, 'Pay rent'), item(false, 'Buy milk')],
  },
)
const PROSE = doc(para('Just thinking out loud about the week.'))

async function openNote(content = WEEK, day = FUTURE) {
  addMockDayNote(day, { title: 'The week' }, content)
  const view = render(
    <ThemeProvider>
      <JournalView intent={{ kind: 'day', dayKey: day }} onIntentHandled={vi.fn()} />
    </ThemeProvider>,
  )
  await screen.findByRole('button', { name: 'Plan it' })
  // The toolbar can be on screen a beat before the editor's own element is (the
  // editor starts after the first render), so wait for the editor itself rather
  // than assume it — on a busy machine that beat is long enough to be hit.
  const dom = await waitFor(() => {
    const element = view.container.querySelector('.ProseMirror')
    if (!element?.editor) throw new Error('The editor has not mounted yet.')
    return element
  })
  return { ...view, editor: dom.editor }
}

const planIt = () => fireEvent.click(screen.getByRole('button', { name: 'Plan it' }))
const panel = (container) => container.querySelector('.note-plan')
const rows = (container) =>
  [...container.querySelectorAll('.note-plan .day-plan__row')].map((li) => ({
    // The title's first text node: what follows it is a flag ("already on …").
    title: li.querySelector('.day-plan__title').firstChild.nodeValue,
    when: li.querySelector('.day-plan__time').textContent,
    on: li.querySelector('input').checked,
  }))

/** The position of the text `label` in the document, for putting a caret or a selection on it. */
function find(editor, label) {
  let at
  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === label) at = { from: pos, to: pos + node.text.length }
  })
  return at
}

describe('Plan it', () => {
  it('proposes the checklist lines at once — placed, ticked, and a ticked item left out', async () => {
    auth.emailVerified = false
    const { container } = await openNote()
    planIt()
    expect(panel(container)).toBeTruthy()
    expect(rows(container)).toEqual([
      // A time the writer stated is kept, on the day they named...
      { title: 'Call Ana', when: '3:00 PM', on: true },
      // ...and the rest is fitted into the planning day's free time.
      { title: 'Buy milk', when: '7:00 AM', on: true },
    ])
  })

  it('says which day a row is for when it is not the note’s own', async () => {
    auth.emailVerified = false
    const { container } = await openNote()
    planIt()
    const flags = [...container.querySelectorAll('.note-plan__flag')].map((el) => el.textContent)
    expect(flags).toHaveLength(1) // only Call Ana, which was "tomorrow"
    expect(flags[0]).toMatch(/^ · /)
  })

  it('asks nothing of AI, and says why, until the email address is confirmed', async () => {
    auth.emailVerified = false
    const { container } = await openNote()
    planIt()
    expect(ai.notePlanAi).not.toHaveBeenCalled()
    expect(panel(container).textContent).toContain('Confirm your email address')
    expect(container.querySelector('.note-plan__privacy')).toBeNull() // nothing is being sent
  })

  it('then lets AI add to it, sending the note as plain lines and no more', async () => {
    ai.notePlanAi.mockResolvedValue([
      { title: 'Call Ana', date: AFTER, startMin: 900, durationMin: 30 },
      { title: 'Workout', date: null, startMin: null, durationMin: 120 },
    ])
    const { container } = await openNote()
    planIt()
    // At once, before the answer: the checklist, and a line saying it is reading on.
    expect(panel(container).textContent).toMatch(/reading the rest/i)
    expect(rows(container).map((r) => r.title)).toEqual(['Call Ana', 'Buy milk'])

    await waitFor(() => expect(panel(container).querySelector('.day-plan__ai-badge')).toBeTruthy())
    expect(rows(container).map((r) => r.title)).toEqual(['Call Ana', 'Workout'])

    expect(ai.notePlanAi).toHaveBeenCalledTimes(1)
    const sent = ai.notePlanAi.mock.calls[0][0]
    expect(sent.day).toBe(FUTURE)
    expect(sent.today).toBe(TODAY)
    expect(sent.text).toBe('Thinking about the week.\n[ ] Call Ana tomorrow at 3pm\n[ ] Buy milk')
    expect(sent.text).not.toContain('Pay rent') // done is not a thing to plan
    // And the person is told, where they decide, that it was sent.
    expect(container.querySelector('.note-plan__privacy').textContent).toMatch(/Gemini/)
  })

  it('keeps the checklist lines, and says so, when AI cannot be reached', async () => {
    ai.notePlanAi.mockResolvedValue(null)
    const { container } = await openNote()
    planIt()
    await waitFor(() => expect(container.querySelector('.note-plan__message')).toBeTruthy())
    expect(container.querySelector('.note-plan__message').textContent).toBe(
      'Couldn’t reach AI — these are your checklist lines.',
    )
    expect(rows(container).map((r) => r.title)).toEqual(['Call Ana', 'Buy milk'])
    expect(panel(container).querySelector('.day-plan__ai-badge')).toBeNull()
  })

  it('keeps the checklist lines when AI finds nothing more', async () => {
    ai.notePlanAi.mockResolvedValue([])
    const { container } = await openNote()
    planIt()
    await waitFor(() => expect(container.querySelector('.note-plan__message')).toBeTruthy())
    expect(container.querySelector('.note-plan__message').textContent).toMatch(/found nothing more/)
    expect(rows(container)).toHaveLength(2)
  })

  it('does not ask when offline, and says so', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    try {
      const { container } = await openNote()
      planIt()
      expect(ai.notePlanAi).not.toHaveBeenCalled()
      expect(container.querySelector('.note-plan__message').textContent).toBe(
        'AI needs a connection — these are your checklist lines.',
      )
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    }
  })

  it('says there is nothing to plan when the note has no to-dos and AI finds none', async () => {
    const { container } = await openNote(PROSE)
    planIt()
    await waitFor(() => expect(panel(container).textContent).toContain('Nothing to plan in this note.'))
    expect(screen.queryByRole('button', { name: /^Add \d+ to schedule$/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })

  it('sends nothing at all for a note with nothing in it', async () => {
    const { container } = await openNote(doc(para()))
    planIt()
    expect(ai.notePlanAi).not.toHaveBeenCalled()
    expect(panel(container).textContent).toContain('Nothing to plan in this note.')
  })

  it('reads only the selection when there is one', async () => {
    const { container, editor } = await openNote()
    const { from, to } = find(editor, 'Buy milk')
    act(() => {
      editor.commands.setTextSelection({ from, to })
    })
    planIt()
    expect(panel(container).textContent).toContain('your selection')
    expect(rows(container).map((r) => r.title)).toEqual(['Buy milk'])
    await waitFor(() => expect(ai.notePlanAi).toHaveBeenCalledTimes(1))
    expect(ai.notePlanAi.mock.calls[0][0].text).toBe('[ ] Buy milk')
  })

  describe('accepting', () => {
    beforeEach(() => {
      auth.emailVerified = false // the checklist alone is enough here
    })

    it('adds exactly the ticked rows, field by field, with one Undo for all of them', async () => {
      const { container } = await openNote()
      planIt()
      fireEvent.click(screen.getByRole('button', { name: 'Add 2 to schedule' }))

      await waitFor(() => expect(schedule.addTask).toHaveBeenCalledTimes(2))
      expect(schedule.addTask).toHaveBeenNthCalledWith(1, { title: 'Call Ana', date: AFTER, startMin: 900, durationMin: 30 })
      expect(schedule.addTask).toHaveBeenNthCalledWith(2, { title: 'Buy milk', date: FUTURE, startMin: 420, durationMin: 30 })

      await waitFor(() => expect(toast.pushUndo).toHaveBeenCalledTimes(1))
      expect(toast.pushUndo.mock.calls[0][0]).toBe('Added 2 tasks to your schedule.')
      expect(panel(container)).toBeNull()

      await act(async () => {
        await toast.pushUndo.mock.calls[0][1]()
      })
      expect(schedule.removeTask.mock.calls.map((call) => call[0])).toEqual(['t1', 't2'])
    })

    it('leaves out a row that was unticked', async () => {
      await openNote()
      planIt()
      fireEvent.click(screen.getByRole('checkbox', { name: /^Buy milk/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Add 1 to schedule' }))
      await waitFor(() => expect(schedule.addTask).toHaveBeenCalledTimes(1))
      expect(schedule.addTask.mock.calls[0][0].title).toBe('Call Ana')
    })

    it('cannot add nothing', async () => {
      await openNote()
      planIt()
      fireEvent.click(screen.getByRole('checkbox', { name: /^Call Ana/ }))
      fireEvent.click(screen.getByRole('checkbox', { name: /^Buy milk/ }))
      expect(screen.getByRole('button', { name: 'Add 0 to schedule' }).disabled).toBe(true)
    })

    it('shows a task the day already has, flagged and not ticked', async () => {
      schedule.tasks[FUTURE] = [{ id: 'x', title: 'buy milk.', startMin: null, durationMin: 30, done: false }]
      const { container } = await openNote()
      planIt()
      expect(rows(container).find((r) => r.title === 'Buy milk').on).toBe(false)
      expect(container.querySelector('.note-plan .day-plan__row--off')).toBeTruthy()
      expect(panel(container).textContent).toContain('already on')
      expect(screen.getByRole('button', { name: 'Add 1 to schedule' })).toBeTruthy()
    })

    it('still offers an Undo for what went in when a write fails part-way', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      schedule.addTask.mockReset()
      schedule.addTask.mockResolvedValueOnce({ id: 'only' }).mockRejectedValueOnce(new Error('permission-denied'))
      const { container } = await openNote()
      planIt()
      fireEvent.click(screen.getByRole('button', { name: 'Add 2 to schedule' }))

      await waitFor(() => expect(toast.pushUndo).toHaveBeenCalledTimes(1))
      expect(toast.pushError).toHaveBeenCalledWith('Could not add all of those. Some may have gone through.')
      expect(toast.pushUndo.mock.calls[0][0]).toBe('Added 1 task to your schedule.')
      expect(panel(container)).toBeNull()
    })
  })

  describe('dismissing', () => {
    it('closes the plan, and writes nothing', async () => {
      auth.emailVerified = false
      const { container } = await openNote()
      planIt()
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
      expect(panel(container)).toBeNull()
      expect(schedule.addTask).not.toHaveBeenCalled()
    })

    it('ignores an answer that arrives afterwards', async () => {
      let answer
      ai.notePlanAi.mockReturnValue(new Promise((resolve) => (answer = resolve)))
      const { container } = await openNote()
      planIt()
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
      await act(async () => {
        answer([{ title: 'Late', date: null, startMin: null, durationMin: null }])
      })
      expect(panel(container)).toBeNull()
    })

    it('ignores an answer for an earlier press once Plan it is pressed again', async () => {
      const answers = []
      ai.notePlanAi.mockImplementation(() => new Promise((resolve) => answers.push(resolve)))
      const { container } = await openNote()
      planIt()
      planIt()
      await act(async () => {
        answers[0]([{ title: 'From the first press', date: null, startMin: null, durationMin: null }])
      })
      expect(rows(container).map((r) => r.title)).not.toContain('From the first press')
      await act(async () => {
        answers[1]([{ title: 'From the second', date: null, startMin: null, durationMin: null }])
      })
      expect(rows(container).map((r) => r.title)).toEqual(['From the second'])
    })
  })
})

/* While the AI is reading the note, the page shows it: a band that sweeps over the
 * paper (`.note-scan`). It is tied to exactly the time the answer is awaited — from
 * the press until the answer lands, is dismissed, or is replaced by a new press —
 * and it is never shown when nothing is being asked. */
describe('the scan over the page', () => {
  const scan = (container) => container.querySelector('.note-scan')

  /** An AI that answers when told to, so "in flight" can be held open. */
  function holdAi() {
    const answers = []
    ai.notePlanAi.mockImplementation(() => new Promise((resolve) => answers.push(resolve)))
    return answers
  }

  it('starts when Plan it is pressed and runs for as long as the AI is reading', async () => {
    holdAi()
    const { container } = await openNote()
    expect(scan(container)).toBeNull()

    planIt()
    expect(scan(container)).toBeTruthy()

    // Still going a moment later — it does not stop on its own.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    expect(scan(container)).toBeTruthy()
  })

  it('stops when the answer lands, whatever it says', async () => {
    const answers = holdAi()
    const { container } = await openNote()
    planIt()
    await act(async () => {
      answers[0]([{ title: 'Water the plants', date: null, startMin: null, durationMin: null }])
    })
    expect(scan(container)).toBeNull()
    expect(panel(container)).toBeTruthy() // and the proposal is there in its place
  })

  it('stops when the AI cannot be reached, and when it finds nothing', async () => {
    const first = holdAi()
    const { container } = await openNote()
    planIt()
    await act(async () => {
      first[0](null)
    })
    expect(scan(container)).toBeNull()

    ai.notePlanAi.mockResolvedValue([])
    planIt()
    await waitFor(() => expect(scan(container)).toBeNull())
  })

  it('stops when Plan it is dismissed, and the late answer does not bring it back', async () => {
    const answers = holdAi()
    const { container } = await openNote()
    planIt()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(scan(container)).toBeNull()

    await act(async () => {
      answers[0]([])
    })
    expect(scan(container)).toBeNull()
  })

  it('keeps going through a second press, until the second answer', async () => {
    const answers = holdAi()
    const { container } = await openNote()
    planIt()
    planIt()
    expect(answers).toHaveLength(2)

    await act(async () => {
      answers[0]([]) // the first press's answer is for a plan nobody is looking at
    })
    expect(scan(container)).toBeTruthy()

    await act(async () => {
      answers[1]([])
    })
    expect(scan(container)).toBeNull()
  })

  // Nothing is awaited in either of these, so nothing scans: the checklist is shown
  // at once and no request is made.
  it('never shows for an unconfirmed account — nothing is sent, so nothing waits', async () => {
    auth.emailVerified = false
    const { container } = await openNote(WEEK)
    planIt()
    expect(panel(container)).toBeTruthy() // the checklist, at once
    expect(scan(container)).toBeNull()
    expect(ai.notePlanAi).not.toHaveBeenCalled()
  })

  it('never shows for a note with nothing in it to read', async () => {
    const { container } = await openNote(doc(para('')))
    planIt()
    expect(scan(container)).toBeNull()
    expect(ai.notePlanAi).not.toHaveBeenCalled()
  })

  it('is decoration laid over the page: out of the sheet, out of the editor, out of a screen reader', async () => {
    holdAi()
    const { container, editor } = await openNote()
    planIt()
    const band = scan(container)

    expect(band.getAttribute('aria-hidden')).toBe('true')
    // A sibling of the sheet, inside its wrapper — not part of what is being written.
    expect(band.parentElement.classList.contains('note-sheet-wrap')).toBe(true)
    expect(container.querySelector('.note-sheet').contains(band)).toBe(false)
    expect(editor.view.dom.contains(band)).toBe(false)
    // Nothing about the note changed to show it.
    expect(editor.isEditable).toBe(true)
  })
})

describe('Send to schedule', () => {
  const sendButton = () => screen.queryByRole('button', { name: 'Send to schedule' })

  it('is not there while the caret is in ordinary writing', async () => {
    const { editor } = await openNote()
    act(() => {
      editor.commands.setTextSelection(find(editor, 'Thinking about the week.').from + 2)
    })
    expect(sendButton()).toBeNull()
  })

  it('is there while the caret is in a checklist line, and makes it a task on the note’s day', async () => {
    const { editor } = await openNote()
    act(() => {
      editor.commands.setTextSelection(find(editor, 'Buy milk').from + 2)
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Send to schedule' }))

    await waitFor(() => expect(schedule.addTask).toHaveBeenCalledTimes(1))
    expect(schedule.addTask).toHaveBeenCalledWith({ title: 'Buy milk', date: FUTURE, startMin: 420, durationMin: 30 })
    await waitFor(() => expect(toast.pushUndo).toHaveBeenCalledTimes(1))
    expect(toast.pushUndo.mock.calls[0][0]).toMatch(/^Added “Buy milk” to .+ at 7:00 AM\.$/)

    await act(async () => {
      await toast.pushUndo.mock.calls[0][1]()
    })
    expect(schedule.removeTask).toHaveBeenCalledWith('t1')
  })

  it('respects a date and time written in the line', async () => {
    const { editor } = await openNote()
    act(() => {
      editor.commands.setTextSelection(find(editor, 'Call Ana tomorrow at 3pm').from + 2)
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Send to schedule' }))
    await waitFor(() => expect(schedule.addTask).toHaveBeenCalledTimes(1))
    expect(schedule.addTask).toHaveBeenCalledWith({ title: 'Call Ana', date: AFTER, startMin: 900, durationMin: 30 })
  })

  it('will not add a task the day already has, and says so', async () => {
    schedule.tasks[FUTURE] = [{ id: 'x', title: 'Buy milk', startMin: null, durationMin: 30, done: false }]
    const { editor } = await openNote()
    act(() => {
      editor.commands.setTextSelection(find(editor, 'Buy milk').from + 2)
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Send to schedule' }))
    await waitFor(() => expect(toast.pushWarning).toHaveBeenCalledTimes(1))
    expect(toast.pushWarning.mock.calls[0][0]).toMatch(/^“Buy milk” is already on /)
    expect(schedule.addTask).not.toHaveBeenCalled()
  })
})

describe('the day band’s tools', () => {
  const openBand = async (content = doc(para()), day = PAST) => {
    const view = await openNote(content, day)
    fireEvent.click(view.container.querySelector('.note-day__toggle'))
    return view
  }
  const field = () => screen.getByLabelText('Add a task to this day')
  const type = (value) => fireEvent.change(field(), { target: { value } })
  const submit = () => fireEvent.submit(field().closest('form'))

  describe('adding a task', () => {
    it('adds it to the note’s day, reading "tomorrow" from that day', async () => {
      await openBand()
      type('call Ana tomorrow 3pm for 30m')
      submit()
      await waitFor(() => expect(schedule.addTask).toHaveBeenCalledTimes(1))
      expect(schedule.addTask).toHaveBeenCalledWith({ title: 'call Ana', date: '2026-03-03', startMin: 900, durationMin: 30 })
      expect(field().value).toBe('')
    })

    it('puts it on the note’s day when no day was said', async () => {
      await openBand()
      type('buy milk')
      submit()
      await waitFor(() => expect(schedule.addTask).toHaveBeenCalledTimes(1))
      expect(schedule.addTask).toHaveBeenCalledWith({ title: 'buy milk', date: PAST, startMin: null, durationMin: undefined })
    })

    it('puts the text back, and says so, when it did not go through', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      schedule.addTask.mockReset()
      schedule.addTask.mockRejectedValue(new Error('offline'))
      await openBand()
      type('buy milk')
      submit()
      await waitFor(() => expect(toast.pushError).toHaveBeenCalledWith('Could not add the task. Try again.'))
      expect(field().value).toBe('buy milk')
    })

    it('has nothing to add until something is typed', async () => {
      await openBand()
      expect(screen.getByRole('button', { name: 'Add' }).disabled).toBe(true)
      type('   ')
      expect(screen.getByRole('button', { name: 'Add' }).disabled).toBe(true)
      type('buy milk')
      expect(screen.getByRole('button', { name: 'Add' }).disabled).toBe(false)
    })

    it('is only there once the band is opened', async () => {
      await openNote(doc(para()), PAST)
      expect(screen.queryByLabelText('Add a task to this day')).toBeNull()
    })
  })

  describe('carrying the day’s unfinished tasks on', () => {
    const open = { id: 't1', title: 'Water the plants', startMin: 540, durationMin: 30, done: false, date: PAST }
    const done = { id: 't2', title: 'Pay rent', startMin: null, durationMin: 30, done: true, date: PAST }
    const oneOfARepeat = { id: 's~2026-03-02', seriesId: 's', title: 'Standing sync', startMin: 480, durationMin: 30, done: false, date: PAST }

    it('moves a past day’s open tasks to today, keeping their times, and can undo it', async () => {
      schedule.tasks[PAST] = [open, done, oneOfARepeat]
      await openBand()
      fireEvent.click(screen.getByRole('button', { name: 'Move 1 unfinished to today' }))

      await waitFor(() => expect(schedule.scheduleTask).toHaveBeenCalledTimes(1))
      expect(schedule.scheduleTask).toHaveBeenCalledWith('t1', { date: TODAY, startMin: 540 })
      await waitFor(() => expect(toast.pushUndo).toHaveBeenCalledTimes(1))
      expect(toast.pushUndo.mock.calls[0][0]).toBe('Moved 1 task to today.')

      schedule.scheduleTask.mockClear()
      await act(async () => {
        await toast.pushUndo.mock.calls[0][1]()
      })
      expect(schedule.scheduleTask).toHaveBeenCalledWith('t1', { date: PAST, startMin: 540 })
    })

    it('leaves a done task, and one day of a repeating task, where they are', async () => {
      schedule.tasks[PAST] = [done, oneOfARepeat]
      await openBand()
      expect(screen.queryByRole('button', { name: /unfinished/ })).toBeNull()
    })

    it('carries today’s on to tomorrow', async () => {
      schedule.tasks[TODAY] = [{ ...open, date: TODAY }]
      await openBand(doc(para()), TODAY)
      fireEvent.click(screen.getByRole('button', { name: 'Move 1 unfinished to tomorrow' }))
      await waitFor(() => expect(schedule.scheduleTask).toHaveBeenCalledWith('t1', { date: addDays(TODAY, 1), startMin: 540 }))
    })

    it('has nowhere to carry from a day that has not happened yet', async () => {
      schedule.tasks[FUTURE] = [{ ...open, date: FUTURE }]
      await openBand(doc(para()), FUTURE)
      expect(screen.queryByRole('button', { name: /unfinished/ })).toBeNull()
    })

    it('says so when only some of them could be moved, and still offers an Undo', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      schedule.tasks[PAST] = [open, { ...open, id: 't3', title: 'Second' }]
      schedule.scheduleTask.mockReset()
      schedule.scheduleTask.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'))
      await openBand()
      fireEvent.click(screen.getByRole('button', { name: 'Move 2 unfinished to today' }))
      await waitFor(() => expect(toast.pushUndo).toHaveBeenCalledTimes(1))
      expect(toast.pushError).toHaveBeenCalledWith('Could not move all of those. Some may have moved.')
      expect(toast.pushUndo.mock.calls[0][0]).toBe('Moved 1 task to today.')
    })
  })

  describe('copying the day into the note', () => {
    const texts = (editor) => {
      const found = []
      editor.state.doc.descendants((node) => {
        if (node.isText) found.push(node.text)
      })
      return found
    }

    it('inserts the events as a list and the tasks as a checklist', async () => {
      schedule.tasks[PAST] = [
        { id: 't1', title: 'Water the plants', startMin: 540, durationMin: 30, done: false },
        { id: 't2', title: 'Pay rent', startMin: null, durationMin: 30, done: true },
      ]
      schedule.events[PAST] = [{ id: 'e1', title: 'Dentist', startMin: null }]
      const { editor } = await openBand()
      fireEvent.click(screen.getByRole('button', { name: 'Copy the day into the note' }))

      await waitFor(() => expect(texts(editor)).toContain('Dentist'))
      expect(texts(editor)).toEqual(['Dentist', '9:00 AM — Water the plants', 'Pay rent'])
      const json = editor.getJSON()
      const checked = []
      const walk = (node) => {
        if (node.type === 'taskItem') checked.push(node.attrs.checked)
        node.content?.forEach(walk)
      }
      walk(json)
      expect(checked).toEqual([false, true]) // a done task is ticked
      expect(json.content.some((node) => node.type === 'bulletList')).toBe(true)
    })

    it('says so, and inserts nothing, for a day with nothing on it', async () => {
      const { editor } = await openBand()
      fireEvent.click(screen.getByRole('button', { name: 'Copy the day into the note' }))
      expect(toast.pushWarning).toHaveBeenCalledWith('Nothing is scheduled that day.')
      expect(texts(editor)).toEqual([])
    })

    it('says in its tooltip that it is a copy', async () => {
      await openBand()
      expect(screen.getByRole('button', { name: 'Copy the day into the note' }).getAttribute('title')).toMatch(
        /a copy/,
      )
    })
  })
})
