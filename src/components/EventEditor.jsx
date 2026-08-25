import { useEffect, useRef, useState } from 'react'
import { useSchedule } from '../state/ScheduleContext.jsx'
import { minToTimeValue, relativeDayLabel, timeValueToMin } from '../lib/date.js'
import { CloseIcon } from './icons.jsx'
import { EditorKindToggle } from './EditorKindToggle.jsx'

/* Its own component rather than a branch inside TaskEditor. TaskEditor already
   resolves three cases — an ordinary task, the rule behind a repeating one, and
   a single day of that rule — with interlocking conditions about recurrence and
   overrides. Adding a task-vs-event axis would make that a six-way matrix for
   the sake of a form that shares no field logic: an event has no duration
   preset, no repeat, and no done state, and it has an end date that a task
   does not. Keeping them apart also means none of this can regress detaching. */
export function EventEditor({ editor, onClose, onChangeKind }) {
  const { addEvent, updateEvent, removeEvent, tags } = useSchedule()
  const isEdit = editor.mode === 'edit'
  const source = isEdit ? editor.event : editor.draft

  const [title, setTitle] = useState(source.title ?? '')
  const [notes, setNotes] = useState(source.notes ?? '')
  const [startDate, setStartDate] = useState(source.startDate ?? '')
  const [endDate, setEndDate] = useState(source.endDate ?? source.startDate ?? '')
  const [startTime, setStartTime] = useState(
    Number.isFinite(source.startMin) ? minToTimeValue(source.startMin) : '',
  )
  const [endTime, setEndTime] = useState(
    Number.isFinite(source.endMin) ? minToTimeValue(source.endMin) : '',
  )
  const [tagId, setTagId] = useState(source.tagId ?? '')
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

  const multiDay = Boolean(endDate) && endDate > startDate

  async function onSubmit(event) {
    event.preventDefault()
    if (saving) return
    const trimmed = title.trim()
    if (!trimmed) {
      titleRef.current?.focus()
      return
    }
    if (!startDate) return

    const startMin = startTime ? timeValueToMin(startTime) : null
    const payload = {
      title: trimmed,
      notes: notes.trim(),
      startDate,
      // An end before its start is a typo, not an intention; collapse to the
      // single day rather than refusing the save and losing the rest of it.
      endDate: endDate && endDate > startDate ? endDate : startDate,
      startMin,
      /* An end time only means something within one day. Across a range the
         bar covers whole days and a clock time could not say which day it
         belonged to, so it is dropped rather than stored to be ignored. */
      endMin: !multiDay && startMin !== null && endTime ? timeValueToMin(endTime) : null,
      tagId: tagId || null,
    }

    setSaving(true)
    try {
      if (isEdit) await updateEvent(editor.event.id, payload)
      else await addEvent(payload)
      onClose()
    } catch (caught) {
      console.error('Could not save event.', caught)
      setSaving(false)
    }
  }

  async function onDelete() {
    try {
      await removeEvent(editor.event.id)
      onClose()
    } catch (caught) {
      console.error('Could not delete event.', caught)
    }
  }

  const heading = isEdit ? 'Edit event' : 'New event'

  return (
    <div
      className="modal"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal__panel card" role="dialog" aria-modal="true" aria-label={heading}>
        <form onSubmit={onSubmit}>
          <div className="modal__head">
            <h2 className="modal__title">{heading}</h2>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>

          {!isEdit && <EditorKindToggle kind="event" onChangeKind={onChangeKind} />}

          <label className="field">
            <span className="field__label">Title</span>
            <input
              ref={titleRef}
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What is happening?"
              maxLength={200}
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span className="field__label">Starts</span>
              <input
                type="date"
                className="input"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  // Dragging the start past the end would leave an impossible
                  // range on screen until the user noticed; carry the end along.
                  if (endDate && e.target.value > endDate) setEndDate(e.target.value)
                }}
              />
            </label>

            <label className="field">
              <span className="field__label">Ends</span>
              <input
                type="date"
                className="input"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <span className="field__hint">
                {multiDay ? 'Runs across several days' : 'Ends the same day'}
              </span>
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span className="field__label">Start time</span>
              <input
                type="time"
                className="input"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                step={900}
              />
              <span className="field__hint">{startTime ? 'Timed' : 'Empty means all day'}</span>
            </label>

            <label className="field">
              <span className="field__label">End time</span>
              <input
                type="time"
                className="input"
                value={endTime}
                disabled={!startTime || multiDay}
                onChange={(e) => setEndTime(e.target.value)}
                step={900}
              />
              <span className="field__hint">
                {multiDay
                  ? 'A run of days covers them whole'
                  : startTime
                    ? 'Empty means an hour'
                    : 'Give it a start time first'}
              </span>
            </label>
          </div>

          <label className="field">
            <span className="field__label">Tag</span>
            <select className="input" value={tagId} onChange={(e) => setTagId(e.target.value)}>
              <option value="">No tag</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>

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
            {isEdit && (
              <button type="button" className="danger-button" onClick={onDelete}>
                Delete
              </button>
            )}
            <span className="modal__spacer" />
            <span className="modal__note">
              {startDate ? relativeDayLabel(startDate) : 'Pick a day'}
            </span>
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={saving || !startDate}>
              {saving ? 'Saving…' : isEdit ? 'Save' : 'Add event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
