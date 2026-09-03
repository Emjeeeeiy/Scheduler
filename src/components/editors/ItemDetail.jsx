import { useRef } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { addDays, durationLabel, formatDayLabel, minToLabel, relativeDayLabel, todayKey } from '../../lib/date.js'
import { recurrenceLabel } from '../../lib/recurrence.js'
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
  const { tasks, getTag, updateTask, scheduleTask } = useSchedule()
  const { pushError } = useToast()
  const isEvent = editor.kind === 'event'
  const source = isEvent ? editor.event : editor.task
  const fields = isEvent ? eventFields(source) : taskFields(source)
  const tag = getTag(source.tagId)
  const panelRef = useRef(null)
  useModalA11y(panelRef, { onClose })
  const blockers = isEvent ? [] : openBlockers(source, tasks)
  const subtaskCount = !isEvent && source.subtasks ? source.subtasks.length : 0
  const subtaskDone = !isEvent && source.subtasks ? source.subtasks.filter((s) => s.done).length : 0

  const KindIcon = isEvent ? SpanIcon : DayIcon
  const kindLabel = isEvent ? 'Event' : 'Task'
  const title = source.title || `Untitled ${kindLabel.toLowerCase()}`

  // Quick actions available straight from this read-only stop, the same way
  // a task row's own checkbox toggles done without a trip through the full
  // editor — pinning and a same-day reschedule are low-risk enough not to
  // need one.
  const canQuickAct = !isEvent && !isSeriesTemplate(source)

  async function togglePinned() {
    try {
      await updateTask(source.id, { pinned: !source.pinned })
    } catch (caught) {
      console.error('Could not update the task.', caught)
      pushError('Could not update the task. Try again.')
    }
  }

  async function snooze(days) {
    try {
      await scheduleTask(source.id, { date: addDays(todayKey(), days), startMin: source.startMin })
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
          <p className="field__hint">
            Checklist: {subtaskDone}/{subtaskCount} done
          </p>
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
          <button type="button" className="primary-button" onClick={onEdit}>
            Edit
          </button>
        </div>
      </div>
    </div>
  )
}
