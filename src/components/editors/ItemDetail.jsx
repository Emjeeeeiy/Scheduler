import { useEffect } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { durationLabel, formatDayLabel, minToLabel, relativeDayLabel } from '../../lib/date.js'
import { recurrenceLabel } from '../../lib/recurrence.js'
import { CheckIcon, CloseIcon, DayIcon, RepeatIcon, SpanIcon } from '../icons.jsx'
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
  const { getTag } = useSchedule()
  const isEvent = editor.kind === 'event'
  const source = isEvent ? editor.event : editor.task
  const fields = isEvent ? eventFields(source) : taskFields(source)
  const tag = getTag(source.tagId)

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const KindIcon = isEvent ? SpanIcon : DayIcon
  const kindLabel = isEvent ? 'Event' : 'Task'
  const title = source.title || `Untitled ${kindLabel.toLowerCase()}`

  return (
    <div className="modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal__panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__head">
          <h2 className="modal__title detail-title">
            {fields.isOccurrence || fields.isSeries ? (
              <RepeatIcon className="detail-title__mark" aria-label={`Repeating ${kindLabel.toLowerCase()}`} />
            ) : (
              <KindIcon className="detail-title__mark" aria-label={kindLabel} />
            )}
            {title}
          </h2>
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
