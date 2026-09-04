import { useMemo, useRef, useState } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { addDays, durationLabel, formatDayLabel, minToLabel, relativeDayLabel, todayKey } from '../../lib/date.js'
import { currentStreak, parseOccurrenceId, recurrenceLabel } from '../../lib/recurrence.js'
import { isSeriesTemplate, openBlockers } from '../../lib/stats.js'
import { useModalA11y } from '../../lib/useModalA11y.js'
import { CheckIcon, CloseIcon, DayIcon, PinIcon, RepeatIcon, SpanIcon, WarningIcon } from '../icons.jsx'
import { TagGlyph } from './TagGlyph.jsx'

function taskFields(task) {
  const isOccurrence = Boolean(task.occurrenceDate)
  const isSeries = Boolean(task.recurrence) && !isOccurrence
  const scheduled = Boolean(task.date)

  const date = scheduled
    ? relativeDayLabel(task.date)
    : isSeries
      ? 'Repeats — no fixed day'
      : 'Unscheduled, in the inbox'

  const time = !scheduled
    ? '—'
    : Number.isFinite(task.startMin)
      ? `${minToLabel(task.startMin)} · ${durationLabel(task.durationMin)}`
      : 'All day'

  return {
    isOccurrence,
    isSeries,
    date,
    time,
    repeat: task.recurrence ? recurrenceLabel(task.recurrence) : "Doesn't repeat",
    occurrenceNote: isOccurrence
      ? `One day of a repeating task — ${recurrenceLabel(task.recurrence).toLowerCase()}.`
      : null,
  }
}

function eventFields(event) {
  const isOccurrence = Boolean(event.seriesId)
  const isSeries = Boolean(event.recurrence) && !isOccurrence
  const multiDay = Boolean(event.endDate) && event.endDate > event.startDate

  const date = multiDay
    ? `${formatDayLabel(event.startDate)} – ${formatDayLabel(event.endDate)}`
    : relativeDayLabel(event.startDate)

  const time = multiDay
    ? 'Spans whole days'
    : !Number.isFinite(event.startMin)
      ? 'All day'
      : Number.isFinite(event.endMin)
        ? `${minToLabel(event.startMin)} – ${minToLabel(event.endMin)}`
        : minToLabel(event.startMin)

  return {
    isOccurrence,
    isSeries,
    date,
    time,
    repeat: event.recurrence ? recurrenceLabel(event.recurrence) : "Doesn't repeat",
    occurrenceNote: isOccurrence
      ? `One day of a repeating event — ${recurrenceLabel(event.recurrence).toLowerCase()}.`
      : null,
  }
}

/** Read-only stop between "clicked it" and "editing it": the calendar and the
    dashboard both open a task or event here first, so a click answers "what
    is this" without risking a field getting nudged by accident. Edit hands
    off to the real form; Close just closes. Kept as one component rather than
    a task/event pair — unlike the editors, there is no per-field state or
    submit logic here to keep apart, just which handful of rows to show. */
export function ItemDetail({ editor, onClose, onEdit }) {
  const { tasks, events, occurrencesOn, getTag, getSeries, updateTask, scheduleTask } = useSchedule()
  const { pushError } = useToast()
  const isEvent = editor.kind === 'event'
  // What was actually clicked — a snapshot from the moment this modal opened,
  // never itself re-read afterward. It only still matters for locating the
  // live document below; every field shown on screen comes from `source`.
  const clicked = isEvent ? editor.event : editor.task
  const parsedOccurrence = !isEvent ? parseOccurrenceId(clicked.id) : null

  /* Which document this modal is actually reading and writing.
     Starts as whatever was clicked and never changes for an ordinary task or
     a series' own rule — those are edited in place for as long as the modal
     is open. An OCCURRENCE is the exception: the first edit made to it from
     here (a checklist tick, the pin toggle, a snooze) detaches it into a
     new, plain document (see detachOccurrence in ScheduleContext), and that
     new id — handed back by updateTask specifically so this can happen — is
     what every edit after the first has to target instead. Kept as state,
     not a ref: setting it must itself trigger the re-render that re-resolves
     `source` below, or a second edit fired quickly after the first could
     still see this component reading the (by-then-detached) occurrence. */
  const [operationalId, setOperationalId] = useState(clicked.id)
  const detachedThisSession = operationalId !== clicked.id

  /* Re-read from ScheduleContext on every render rather than trusting the
     prop: without this, a change made from this very modal would save
     correctly and then appear not to have happened, because the panel kept
     showing the snapshot it opened with. tasks/events re-run this whenever a
     snapshot lands, so a change from anywhere else (another tab, the full
     editor) shows up here too.

     An occurrence isn't a stored document — it's derived — so it is re-run
     through occurrencesOn rather than searched for by id in `tasks`, which
     only ever holds rule documents and plain tasks. Once detached this
     session, though, it IS a plain document — the one operationalId now
     names — so that branch reads it from `tasks` like any other. Either way,
     a document this modal can no longer find (deleted elsewhere, or a write
     still in flight) falls back to `clicked` rather than blanking the panel. */
  const source = useMemo(() => {
    if (isEvent) return events.find((e) => e.id === clicked.id) ?? clicked
    if (detachedThisSession) return tasks.find((t) => t.id === operationalId) ?? clicked
    if (parsedOccurrence) {
      return occurrencesOn(parsedOccurrence.dateKey).find((o) => o.id === clicked.id) ?? clicked
    }
    return tasks.find((t) => t.id === clicked.id) ?? clicked
  }, [isEvent, clicked, parsedOccurrence, detachedThisSession, operationalId, events, tasks, occurrencesOn])

  const fields = isEvent ? eventFields(source) : taskFields(source)
  const tag = getTag(source.tagId)
  const panelRef = useRef(null)
  useModalA11y(panelRef, { onClose })
  const blockers = isEvent ? [] : openBlockers(source, tasks)

  /* A checklist tick shows up on screen the instant it's clicked rather than
     waiting on `source` to catch up — which, right after a detach, means
     waiting on a whole extra round trip (the write settling, a fresh
     snapshot arriving, this component re-rendering). Without it, ticking a
     second item in that window would look like the first one never took. */
  const [localSubtasks, setLocalSubtasks] = useState(null)
  const subtasks = !isEvent ? localSubtasks ?? source.subtasks ?? [] : []
  const subtaskCount = subtasks.length
  const subtaskDone = subtasks.filter((s) => s.done).length

  async function toggleSubtask(id) {
    const before = subtasks
    const next = before.map((s) => (s.id === id ? { ...s, done: !s.done } : s))
    setLocalSubtasks(next)
    try {
      const detachedId = await updateTask(operationalId, { subtasks: next })
      if (detachedId) setOperationalId(detachedId)
    } catch (caught) {
      setLocalSubtasks(before)
      console.error('Could not update the checklist.', caught)
      pushError('Could not update that item. Try again.')
    }
  }

  // Streak needs the SERIES document's own overrides map — an occurrence
  // carries no overrides of its own (see occurrenceOn), so for a single day
  // of a repeating task this looks the parent up; for the rule itself,
  // `source` already is that document.
  const streakSeries = isEvent ? null : fields.isOccurrence ? getSeries(source.seriesId) : fields.isSeries ? source : null
  const streak = streakSeries ? currentStreak(streakSeries) : 0

  /* What the Edit button hands to the full form: `source` itself, with any
     not-yet-settled checklist tick folded back in — `source.subtasks` can
     briefly lag `subtasks` right after a click, and TaskEditor's Save
     overwrites the whole array from its own form state, so handing it the
     lagging value would silently undo a tick the write already succeeded at.

     For an occurrence this is doing a second job too: once a quick action
     here has detached it, `editor.task`/`editor.event` up in App.jsx is
     still the ORIGINAL occurrence, frozen at the click that opened this
     modal, with no idea any of that happened. Handing that stale id to the
     editor would try to save over a document nothing live resolves to
     anymore (see the comment on operationalId above) — `source` itself is
     already the live plain document by then, so folding `subtasks` into it
     here, unconditionally, covers both cases in one line rather than two. */
  const handoff = isEvent ? source : { ...source, subtasks }

  const KindIcon = isEvent ? SpanIcon : DayIcon
  const kindLabel = isEvent ? 'Event' : 'Task'
  const title = source.title || `Untitled ${kindLabel.toLowerCase()}`

  // Quick actions available straight from this read-only stop, the same way
  // a task row's own checkbox toggles done without a trip through the full
  // editor — pinning and a same-day reschedule are low-risk enough not to
  // need one.
  const canQuickAct = !isEvent && !isSeriesTemplate(source)

  /* Every quick action here targets operationalId, and updates it from
     whatever comes back — the same reasoning as toggleSubtask's comment
     above. Pin, snooze, and the checklist are three independent ways to
     detach the same occurrence, and whichever one happens first is the one
     the other two need to hand off to. */
  async function togglePinned() {
    try {
      const detachedId = await updateTask(operationalId, { pinned: !source.pinned })
      if (detachedId) setOperationalId(detachedId)
    } catch (caught) {
      console.error('Could not update the task.', caught)
      pushError('Could not update the task. Try again.')
    }
  }

  async function snooze(days) {
    try {
      // No need to capture a detached id here — a successful snooze closes
      // the panel outright, so there is no next edit in this session left to
      // aim at it.
      await scheduleTask(operationalId, { date: addDays(todayKey(), days), startMin: source.startMin })
      onClose()
    } catch (caught) {
      console.error('Could not reschedule the task.', caught)
      pushError('Could not reschedule the task. Try again.')
    }
  }

  return (
    <div className="modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} className="modal__panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__head">
          <h2 className="modal__title detail-title">
            {fields.isOccurrence || fields.isSeries ? (
              <RepeatIcon className="detail-title__mark" aria-label={`Repeating ${kindLabel.toLowerCase()}`} />
            ) : (
              <KindIcon className="detail-title__mark" aria-label={kindLabel} />
            )}
            {title}
          </h2>
          {canQuickAct && (
            <button
              type="button"
              className={`icon-button${source.pinned ? ' icon-button--on' : ''}`}
              onClick={togglePinned}
              aria-pressed={source.pinned}
              aria-label={source.pinned ? 'Unpin from dashboard' : 'Pin to dashboard'}
              title={source.pinned ? 'Unpin from dashboard' : 'Pin to dashboard'}
            >
              <PinIcon />
            </button>
          )}
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {fields.occurrenceNote && (
          <div className="series-note">
            <RepeatIcon className="series-note__mark" />
            <span className="series-note__text">{fields.occurrenceNote}</span>
          </div>
        )}

        {!isEvent && !fields.isSeries && (
          <p className={`detail-status${source.done ? ' detail-status--done' : ''}`}>
            {source.done && <CheckIcon />}
            {source.done ? 'Done' : 'Not done'}
          </p>
        )}

        {blockers.length > 0 && (
          <div className="series-note series-note--warning">
            <WarningIcon className="series-note__mark" />
            <span className="series-note__text">
              Waiting on {blockers.length} task{blockers.length === 1 ? '' : 's'}:{' '}
              {blockers.map((b) => b.title).join(', ')}
            </span>
          </div>
        )}

        {subtaskCount > 0 && (
          <div className="detail-field detail-field--full">
            {/* One template literal, not adjacent text/expression children —
                SSR inserts comment markers between sibling text nodes (see
                the identical note in TodayView's event rail), which would
                otherwise split this phrase apart in the rendered markup. */}
            <span className="detail-field__label">{`Checklist — ${subtaskDone}/${subtaskCount} done`}</span>
            {/* Same row markup TaskEditor's own SubtaskList uses, so a task's
                checklist reads identically whether it's being reviewed here
                or edited there — just without that component's add/remove
                controls, which belong to editing, not to a read-only stop. */}
            <ul className="subtasks__list">
              {subtasks.map((item) => (
                <li key={item.id} className="subtasks__row">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => toggleSubtask(item.id)}
                    aria-label={item.title}
                  />
                  <span className={`subtasks__title${item.done ? ' subtasks__title--done' : ''}`}>
                    {item.title}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="detail-grid">
          <div className="detail-field">
            <span className="detail-field__label">Date</span>
            <span className="detail-field__value">{fields.date}</span>
          </div>
          <div className="detail-field">
            <span className="detail-field__label">Time</span>
            <span className="detail-field__value">{fields.time}</span>
          </div>
          <div className="detail-field">
            <span className="detail-field__label">Tag</span>
            <span className="detail-field__value">
              {tag ? (
                <>
                  <TagGlyph tag={tag} variant="swatch" className="tag-swatch tag-swatch--sm" />
                  {' '}
                  {tag.name}
                </>
              ) : (
                'No tag'
              )}
            </span>
          </div>
          <div className="detail-field">
            <span className="detail-field__label">Repeat</span>
            <span className="detail-field__value">{fields.repeat}</span>
          </div>
          {streakSeries && (
            <div className="detail-field">
              <span className="detail-field__label">Streak</span>
              <span className="detail-field__value">
                {streak === 0 ? 'Not started' : `${streak} day${streak === 1 ? '' : 's'}`}
              </span>
            </div>
          )}
        </div>

        <div className="detail-field detail-field--full">
          <span className="detail-field__label">Notes</span>
          <p className="detail-field__value detail-field__value--notes">
            {source.notes?.trim() ? source.notes : 'No notes'}
          </p>
        </div>

        <div className="modal__foot">
          {canQuickAct && !source.done && source.date && (
            <>
              <button type="button" className="ghost-button ghost-button--sm" onClick={() => snooze(1)}>
                Tomorrow
              </button>
              <button type="button" className="ghost-button ghost-button--sm" onClick={() => snooze(7)}>
                Next week
              </button>
            </>
          )}
          <span className="modal__spacer" />
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
          <button type="button" className="primary-button" onClick={() => onEdit(handoff)}>
            Edit
          </button>
        </div>
      </div>
    </div>
  )
}
