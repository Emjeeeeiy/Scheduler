import { useId, useState } from 'react'
import { formatFullDayLabel } from '@cadence/shared/date.js'
import { usePersistentState } from '../../lib/usePersistentState.js'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { DayAgendaList } from '../calendar/DayAgendaList.jsx'
import { ChevronRightIcon } from '../icons.jsx'
import { useNoteScheduleTools } from './NoteScheduleTools.jsx'

/* A day note's own day, under the note's header: the way back from the Journal
 * to the schedule, the other half of the "Open journal" button the calendar
 * views carry.
 *
 * Chrome, not content (DESIGN.md, "Chrome versus content"): it sits above the
 * sheet, neutral, ruled off by a hairline, and never takes the paper's or the
 * ink's colours. It is one quiet line until opened — the page is the writer's,
 * and a list of tasks above it should not push the writing down unasked. Open
 * or closed is remembered per device, like the note list's toggle.
 *
 * The list is the day itself, live: a checkbox here is the task's real one, so
 * ticking it completes the task in the schedule (one day of a repeating task,
 * if that is what it is — toggleDone already knows), and the item opens over
 * the note in its own detail panel. The day comes from the note's `dayKey`, not
 * its title: renaming the note never unlinks it.
 *
 * Opened, it also works the other way (through NoteScheduleTools, so this file
 * stays a view of the schedule): a line to add a task to the day, a button to
 * carry the day's unfinished tasks on, and one to copy the day into the note.
 */

const OPEN_KEY = 'cadence-app:journal-day-open'

function daySummary(tasks, events) {
  if (tasks.length === 0 && events.length === 0) return 'Nothing scheduled'
  const parts = []
  if (tasks.length > 0) {
    const done = tasks.filter((task) => task.done).length
    parts.push(`${tasks.length} task${tasks.length === 1 ? '' : 's'}${done > 0 ? `, ${done} done` : ''}`)
  }
  if (events.length > 0) parts.push(`${events.length} event${events.length === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

export function NoteDayPanel({ dayKey, onFocusDay, onEdit, onEditEvent }) {
  const { tasksOn, eventsOn, getTag, toggleDone } = useSchedule()
  const { pushError } = useToast()
  const [open, setOpen] = usePersistentState(OPEN_KEY, false, (stored) => stored === true)
  const listId = useId()
  const addId = useId()
  const tools = useNoteScheduleTools()
  const [adding, setAdding] = useState('')

  const tasks = tasksOn(dayKey)
  const events = eventsOn(dayKey)
  const dayLabel = formatFullDayLabel(dayKey)

  function toggle(id) {
    // Run inside .then so a write that throws and one that rejects are both
    // reported, the way the rest of the Journal reports a failed write.
    Promise.resolve()
      .then(() => toggleDone(id))
      .catch((caught) => {
        console.error('Could not update the task.', caught)
        pushError('Could not update the task.')
      })
  }

  async function onQuickAdd(event) {
    event.preventDefault()
    const text = adding.trim()
    if (!text || !tools) return
    // Cleared at once, put back if it did not go through — the inbox's own capture
    // field behaves the same way.
    setAdding('')
    try {
      if (!(await tools.quickAdd(text))) setAdding(text)
    } catch (caught) {
      console.error('Could not add the task.', caught)
      pushError('Could not add the task. Try again.')
      setAdding(text)
    }
  }

  return (
    <section className="note-day" aria-label={`${dayLabel} in your schedule`}>
      <div className="note-day__bar">
        <button
          type="button"
          className="note-day__toggle"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen(!open)}
        >
          <ChevronRightIcon className="note-day__chevron" />
          <span className="note-day__date">{dayLabel}</span>
          <span className="note-day__summary">{daySummary(tasks, events)}</span>
        </button>
        {onFocusDay ? (
          <button type="button" className="ghost-button ghost-button--sm" onClick={() => onFocusDay(dayKey)}>
            Open day
          </button>
        ) : null}
      </div>

      <div id={listId} className="note-day__list" hidden={!open}>
        {open ? (
          <DayAgendaList
            tasks={tasks}
            events={events}
            getTag={getTag}
            onEdit={onEdit}
            onEditEvent={onEditEvent}
            toggleDone={toggle}
          />
        ) : null}

        {open && tools ? (
          <>
            <form className="quick-add note-day__add" onSubmit={onQuickAdd}>
              <label className="visually-hidden" htmlFor={addId}>
                Add a task to this day
              </label>
              <input
                id={addId}
                className="input"
                value={adding}
                onChange={(event) => setAdding(event.target.value)}
                placeholder="Add to this day — try “call Ana 3pm for 30m”"
                maxLength={200}
                autoComplete="off"
              />
              <button type="submit" className="ghost-button" disabled={!adding.trim()}>
                Add
              </button>
            </form>

            <div className="note-day__actions">
              {tools.carry ? (
                <button type="button" className="ghost-button ghost-button--sm" onClick={tools.carryOver}>
                  {tools.carry.label}
                </button>
              ) : null}
              <button
                type="button"
                className="ghost-button ghost-button--sm"
                onClick={tools.copyDay}
                title="Inserts this day's events and tasks into the note as a list. It is a copy: ticking one in the note does not change your schedule."
              >
                Copy the day into the note
              </button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}
