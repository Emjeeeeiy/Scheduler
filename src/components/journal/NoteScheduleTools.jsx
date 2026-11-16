import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { formatDayLabel, minToLabel, todayKey } from '@cadence/shared/date.js'
import { carryOverTarget, placeNoteTasks } from '@cadence/shared/autoSchedule.js'
import { dayCopyContent, noteOutline, planningDay, uncheckedTaskLines } from '@cadence/shared/journal.js'
import { parseQuickAdd } from '@cadence/shared/parseQuickAdd.js'
import { notePlanAi } from '../../lib/aiClient.js'
import { useOnline } from '../../lib/useOnline.js'
import { useAuth } from '../../state/AuthContext.jsx'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useSettings } from '../../state/SettingsContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'

/* Where a note and the schedule trade things.
 *
 * Everything the Journal does TO the schedule — and everything it takes FROM it
 * to put in a note — goes through this one provider, wrapped around the open
 * note by JournalView. That keeps NoteSurface (the editor) from knowing the
 * schedule exists: it only registers a small handle on its editor (below), and
 * asks for the tools if there are any. Without a provider, `useNoteScheduleTools`
 * is null and the editor is exactly what it always was — which is also why the
 * tests that mount a note on its own need no schedule.
 *
 * What it offers:
 *   Plan it        read the note (or the selection), propose where its to-dos
 *                  would go on the calendar, and add the ones that are ticked
 *   Send to schedule  one checklist line, as a task
 *   quick-add      a task for the note's day, from a line of text
 *   carry over     the day's unfinished tasks, to tomorrow or today
 *   copy the day   the day's tasks and events, into the note
 *
 * Every write is explicit fields (never a spread of anything parsed or from a
 * model) and every batch has one Undo. Plan it reads text only on a press, and
 * only sends it anywhere if the account may use AI.
 */

const Context = createContext(null)

/** The tools for the open note, or null where there is no schedule to trade
    with (a note mounted on its own). */
export function useNoteScheduleTools() {
  return useContext(Context)
}

function clock() {
  const now = new Date()
  return { today: todayKey(), nowMin: now.getHours() * 60 + now.getMinutes() }
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export function NoteScheduleToolsProvider({ dayKey, children }) {
  const { tasksOn, eventsOn, addTask, removeTask, scheduleTask } = useSchedule()
  const { emailVerified } = useAuth()
  const { settings } = useSettings()
  const { pushError, pushWarning, pushUndo } = useToast()
  const online = useOnline()

  const editorRef = useRef(null)
  const requestRef = useRef(0)
  const [plan, setPlan] = useState(null)

  /* An answer that lands after the note was closed (or Plan it was dismissed or
     started again) is for a plan nobody is looking at. */
  useEffect(
    () => () => {
      requestRef.current += 1
    },
    [],
  )

  /** NoteSurface hands over what it can do to its editor, and takes it back. */
  const registerEditor = useCallback((api) => {
    editorRef.current = api
    return () => {
      if (editorRef.current === api) editorRef.current = null
    }
  }, [])

  /* What is already on a day, as the Day view counts it: every task, and the
     events that have a time (an all-day event does not take up the hours). */
  const dayItems = (key) => [...tasksOn(key), ...eventsOn(key).filter((event) => Number.isFinite(event.startMin))]

  const place = (items, { day, today, nowMin }) =>
    placeNoteTasks(items, { planningDay: day, today, nowMin, dayItems, workingHours: settings.workingHours ?? null })

  /** A line the way someone would type it into quick-add, as a placeable item. */
  const asItem = (line, day) => {
    const parsed = parseQuickAdd(line, { today: day })
    return { title: parsed.title, date: parsed.date, startMin: parsed.startMin, durationMin: parsed.durationMin }
  }

  /* ----------------------------------------------------------------- plan -- */

  function closePlan() {
    requestRef.current += 1
    setPlan(null)
  }

  function startPlan() {
    const editor = editorRef.current
    if (!editor?.isEditable()) return

    const selected = editor.getSelectionDoc()
    const doc = selected ?? editor.getDoc()
    const now = clock()
    const when = { ...now, day: planningDay(dayKey, now.today) }

    // What is already a list needs nothing from anyone: shown at once.
    const checklist = uncheckedTaskLines(doc).map((line) => asItem(line, when.day))
    const rows = place(checklist, when)
    const outline = noteOutline(doc)
    const base = { scope: selected ? 'selection' : 'note', day: when.day, rows, source: 'checklist', applying: false }

    // Reading the rest is the AI's part. It is only asked when there is
    // something to read, the account may use it, and there is a connection —
    // and nothing is sent otherwise.
    if (!outline) return setPlan({ ...base, status: 'ready', message: null })
    if (!emailVerified) return setPlan({ ...base, status: 'ready', message: 'unverified' })
    if (!online) return setPlan({ ...base, status: 'ready', message: 'offline' })

    const id = ++requestRef.current
    setPlan({ ...base, status: 'thinking', message: null })

    notePlanAi({ text: outline, day: when.day, today: when.today }).then((tasks) => {
      if (id !== requestRef.current) return
      setPlan((current) => {
        if (!current) return current
        if (tasks === null) return { ...current, status: 'ready', message: 'failed' }
        // Nothing found beats nothing shown only when there is nothing else: the
        // checklist lines are the writer's own to-dos, so they stay.
        if (tasks.length === 0) return { ...current, status: 'ready', message: rows.length > 0 ? 'ai-empty' : null }
        // The clock may have moved on while the answer was on its way.
        return { ...current, status: 'ready', source: 'ai', message: null, rows: place(tasks, { ...when, ...clock() }) }
      })
    })
  }

  function toggleRow(index) {
    setPlan((current) =>
      current
        ? { ...current, rows: current.rows.map((row, i) => (i === index ? { ...row, include: !row.include } : row)) }
        : current,
    )
  }

  async function acceptPlan() {
    if (!plan || plan.applying) return
    const chosen = plan.rows.filter((row) => row.include)
    if (chosen.length === 0) return
    setPlan({ ...plan, applying: true })

    /* One at a time: a partial failure part-way through is easier to report (and
       to undo) than an unknown subset of concurrent writes having landed. Fields
       are written out, never spread. */
    const created = []
    try {
      for (const row of chosen) {
        const ref = await addTask({
          title: row.title,
          date: row.date,
          startMin: row.startMin,
          durationMin: row.durationMin,
        })
        created.push(ref.id)
      }
    } catch (caught) {
      console.error('Could not add everything from the note.', caught)
      pushError('Could not add all of those. Some may have gone through.')
    }

    closePlan()
    if (created.length > 0) {
      pushUndo(`Added ${plural(created.length, 'task')} to your schedule.`, async () => {
        try {
          for (const id of created) await removeTask(id)
        } catch (caught) {
          console.error('Could not undo the note’s tasks.', caught)
          pushError('Could not remove all of those.')
        }
      })
    }
  }

  /* -------------------------------------------------------- one checklist line -- */

  async function sendLine() {
    const line = editorRef.current?.taskItemText()
    if (!line) return
    const now = clock()
    const day = planningDay(dayKey, now.today)
    const [row] = place([asItem(line, day)], { ...now, day })

    if (!row) return pushError('There is nothing to add from that line.')
    if (row.duplicate) return pushWarning(`“${row.title}” is already on ${formatDayLabel(row.date ?? day)}.`)

    const where = row.date
      ? `to ${formatDayLabel(row.date)}${row.startMin !== null ? ` at ${minToLabel(row.startMin)}` : ''}`
      : 'to your inbox'
    try {
      const ref = await addTask({
        title: row.title,
        date: row.date,
        startMin: row.startMin,
        durationMin: row.durationMin,
      })
      pushUndo(`Added “${row.title}” ${where}.`, async () => {
        try {
          await removeTask(ref.id)
        } catch (caught) {
          console.error('Could not undo the task.', caught)
          pushError('Could not remove that task.')
        }
      })
    } catch (caught) {
      console.error('Could not add the task from the note.', caught)
      pushError('Could not add the task. Try again.')
    }
  }

  /* -------------------------------------------------------- the day's own band -- */

  /** A task for the note's day, from a line of text. "Tomorrow" means the day
      after THIS note's day, so a note about next Friday reads as it was written.
      Throws if the write fails, for the form to put the text back. */
  async function quickAdd(text) {
    if (!dayKey) return false
    const parsed = parseQuickAdd(text, { today: dayKey })
    const title = parsed.title.trim()
    if (!title) return false
    await addTask({
      title,
      date: parsed.date ?? dayKey,
      startMin: parsed.startMin,
      durationMin: parsed.durationMin ?? undefined,
    })
    return true
  }

  /* Unfinished work moves on a day at a time. One day of a repeating task is not
     "left behind" — it has its own tick, and moving it would detach it from the
     series — so those stay where they are. */
  const today = todayKey()
  const target = carryOverTarget(dayKey, today)
  const unfinished = dayKey ? tasksOn(dayKey).filter((task) => !task.done && !task.seriesId) : []
  const carry =
    target && unfinished.length > 0
      ? { target, tasks: unfinished, label: `Move ${unfinished.length} unfinished to ${target === today ? 'today' : 'tomorrow'}` }
      : null

  async function carryOver() {
    if (!carry) return
    const moved = []
    try {
      for (const task of carry.tasks) {
        await scheduleTask(task.id, { date: carry.target, startMin: task.startMin })
        moved.push({ id: task.id, date: task.date, startMin: task.startMin })
      }
    } catch (caught) {
      console.error('Could not carry everything over.', caught)
      pushError('Could not move all of those. Some may have moved.')
    }
    if (moved.length > 0) {
      pushUndo(`Moved ${plural(moved.length, 'task')} to ${carry.target === today ? 'today' : 'tomorrow'}.`, async () => {
        try {
          for (const task of moved) await scheduleTask(task.id, { date: task.date, startMin: task.startMin })
        } catch (caught) {
          console.error('Could not move the tasks back.', caught)
          pushError('Could not move all of those back.')
        }
      })
    }
  }

  function copyDay() {
    const editor = editorRef.current
    if (!editor?.isEditable()) return pushError('This note is read-only, so nothing can be added to it.')
    const blocks = dayCopyContent({
      tasks: dayKey ? tasksOn(dayKey) : [],
      events: dayKey ? eventsOn(dayKey) : [],
    })
    if (blocks.length === 0) return pushWarning('Nothing is scheduled that day.')
    editor.insert(blocks)
  }

  const value = {
    dayKey,
    plan,
    registerEditor,
    startPlan,
    closePlan,
    toggleRow,
    acceptPlan,
    sendLine,
    quickAdd,
    carry,
    carryOver,
    copyDay,
  }

  return <Context.Provider value={value}>{children}</Context.Provider>
}
