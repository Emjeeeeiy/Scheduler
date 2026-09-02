import { useEffect, useRef, useState } from 'react'
import { useSchedule, DEFAULT_DURATION_MIN } from '../../state/ScheduleContext.jsx'
import { minToTimeValue, relativeDayLabel, timeValueToMin } from '../../lib/date.js'
import { recurrenceLabel } from '../../lib/recurrence.js'
import { CloseIcon, RepeatIcon } from '../icons.jsx'
import { EditorKindToggle } from './EditorKindToggle.jsx'
import { RepeatPicker } from './RepeatPicker.jsx'
import { TagSelect } from './TagSelect.jsx'

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240, 480]

function durationOption(min) {
  if (min < 60) return `${min} min`
  const h = min / 60
  return `${Number.isInteger(h) ? h : h.toFixed(1)} hour${h === 1 ? '' : 's'}`
}

/** Create and edit share one form: the fields are identical, and keeping them
    together means a change to the time model can only be made in one place. */
export function TaskEditor({ editor, onClose, onEditTask, onChangeKind }) {
  const { addTask, updateTask, removeTask, tags, getSeries } = useSchedule()
  const isEdit = editor.mode === 'edit'
  const source = isEdit ? editor.task : editor.draft

  /* Three things can be open here: an ordinary task, the rule behind a
     repeating one, or a single day of that rule. Only the first two own a
     repeat setting — a day cannot decide how often its series comes round. */
  const isOccurrence = Boolean(source.occurrenceDate)
  const isSeries = Boolean(source.recurrence) && !isOccurrence

  const [title, setTitle] = useState(source.title ?? '')
  const [notes, setNotes] = useState(source.notes ?? '')
  const [date, setDate] = useState(source.date ?? '')
  const [time, setTime] = useState(
    Number.isFinite(source.startMin) ? minToTimeValue(source.startMin) : '',
  )
  const [durationMin, setDurationMin] = useState(source.durationMin ?? DEFAULT_DURATION_MIN)
  const [tagId, setTagId] = useState(source.tagId ?? '')
  const [repeat, setRepeat] = useState(isSeries ? source.recurrence : null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)


  const titleRef = useRef(null)
  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function onSubmit(event) {
    event.preventDefault()
    if (saving) return
    const trimmed = title.trim()
    if (!trimmed) {
      titleRef.current?.focus()
      return
    }

    // Clearing the date sends a task back to the inbox, which means its time
    // has to go with it — a start time on no particular day is meaningless.
    const nextDate = date || null
    const payload = {
      title: trimmed,
      notes: notes.trim(),
      date: nextDate,
      startMin: nextDate ? timeValueToMin(time) : null,
      durationMin,
      tagId: tagId || null,
    }

    if (!isOccurrence) {
      payload.recurrence = nextDate && repeat ? { ...repeat, anchor: nextDate } : null
      /* Exceptions belong to a rule. Turning repeating off, or on for the first
         time, starts from none; an existing rule keeps the days already ticked
         off, so a change of schedule does not un-tick this morning. */
      if (!payload.recurrence || !isSeries) payload.overrides = {}
    }

    setSaving(true)
    try {
      if (isEdit) await updateTask(editor.task.id, payload)
      else await addTask(payload)
      onClose()
    } catch (caught) {
      console.error('Could not save task.', caught)
      setSaving(false)
    }
  }

  async function onDelete() {
    try {
      await removeTask(editor.task.id)
      onClose()
    } catch (caught) {
      console.error('Could not delete task.', caught)
    }
  }

  const heading = !isEdit
    ? 'New task'
    : isOccurrence
      ? `Edit ${relativeDayLabel(source.occurrenceDate).toLowerCase()}`
      : isSeries
        ? 'Edit repeating task'
        : 'Edit task'

  const series = isOccurrence ? getSeries?.(source.seriesId) : null

  return (
    <div className="modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal__panel" role="dialog" aria-modal="true" aria-label={heading}>
        <form onSubmit={onSubmit}>
          <div className="modal__head">
            <h2 className="modal__title">{heading}</h2>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>

          {!isEdit && <EditorKindToggle kind="task" onChangeKind={onChangeKind} />}

          {isOccurrence && (
            <div className="series-note">
              <RepeatIcon className="series-note__mark" />
              <span className="series-note__text">
                One day of a repeating task. Saving changes this day only and leaves the rest of{' '}
                <strong>{recurrenceLabel(source.recurrence).toLowerCase()}</strong> alone.
              </span>
              {series && onEditTask && (
                <button
                  type="button"
                  className="ghost-button ghost-button--sm"
                  onClick={() => onEditTask(series)}
                >
                  Edit the series
                </button>
              )}
            </div>
          )}

          <label className="field">
            <span className="field__label">Title</span>
            <input
              ref={titleRef}
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?"
              maxLength={200}
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span className="field__label">Date</span>
              <input
                type="date"
                className="input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <span className="field__hint">
                {date ? 'Scheduled' : 'Leave empty to keep it in the inbox'}
              </span>
            </label>

            <label className="field">
              <span className="field__label">Start time</span>
              <input
                type="time"
                className="input"
                value={time}
                disabled={!date}
                onChange={(e) => setTime(e.target.value)}
                step={900}
              />
              <span className="field__hint">{time ? 'Time block' : 'Empty means all day'}</span>
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span className="field__label">Duration</span>
              <select
                className="input"
                value={durationMin}
                disabled={!date || !time}
                onChange={(e) => setDurationMin(Number(e.target.value))}
              >
                {DURATIONS.map((min) => (
                  <option key={min} value={min}>
                    {durationOption(min)}
                  </option>
                ))}
                {!DURATIONS.includes(durationMin) && (
                  <option value={durationMin}>{durationOption(durationMin)}</option>
                )}
              </select>
            </label>

            <label className="field">
              <span className="field__label">Tag</span>
              <TagSelect tags={tags} value={tagId} onChange={setTagId} />
            </label>
          </div>

          {!isOccurrence && (
            <RepeatPicker
              date={date}
              recurrence={repeat}
              onChange={setRepeat}
              hint={
                !date
                  ? 'A task in the inbox has no day to repeat from — give it a date first.'
                  : repeat
                    ? `${recurrenceLabel(repeat)}, from ${relativeDayLabel(date).toLowerCase()} on. Tick off, move, or delete any single day without touching the rest.`
                    : 'Happens once, on the day above.'
              }
            />
          )}

          <label className="field">
            <span className="field__label">Notes</span>
            <textarea
              className="input input--area"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional"
            />
          </label>

          <div className="modal__foot">
            {isEdit && !isSeries && (
              <button type="button" className="danger-button" onClick={onDelete}>
                {isOccurrence ? 'Skip this day' : 'Delete'}
              </button>
            )}
            {/* Deleting the rule takes every day it ever produced, which is not
                a thing to do on one mis-click. */}
            {isSeries && !confirmingDelete && (
              <button
                type="button"
                className="danger-button"
                onClick={() => setConfirmingDelete(true)}
              >
                Delete series
              </button>
            )}
            {isSeries && confirmingDelete && (
              <>
                <button type="button" className="danger-button" onClick={onDelete}>
                  Delete every day
                </button>
                <button
                  type="button"
                  className="ghost-button ghost-button--sm"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Keep it
                </button>
              </>
            )}
            <span className="modal__spacer" />
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? 'Saving…' : isOccurrence ? 'Save this day' : isEdit ? 'Save' : 'Add task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
