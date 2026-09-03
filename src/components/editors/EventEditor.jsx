import { useRef, useState } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { minToTimeValue, relativeDayLabel, timeValueToMin } from '../../lib/date.js'
import { recurrenceLabel } from '../../lib/recurrence.js'
import { useModalA11y } from '../../lib/useModalA11y.js'
import { CloseIcon, RepeatIcon } from '../icons.jsx'
import { EditorKindToggle } from './EditorKindToggle.jsx'
import { RepeatPicker } from './RepeatPicker.jsx'
import { TagSelect } from './TagSelect.jsx'

/* Its own component rather than a branch inside TaskEditor. TaskEditor already
   resolves three cases — an ordinary task, the rule behind a repeating one, and
   a single day of that rule — with interlocking conditions about recurrence and
   overrides. Adding a task-vs-event axis would make that a six-way matrix for
   the sake of a form that shares little field logic: an event has no duration
   preset and no done state, and it has an end date that a task does not.
   Keeping them apart also means none of this can regress detaching.

   The two do now share a Repeat control, which is a component (RepeatPicker)
   rather than a reason to merge the forms — the rule vocabulary is identical,
   everything around it is not. */
export function EventEditor({ editor, onClose, onChangeKind }) {
  const { addEvent, updateEvent, removeEvent, restoreItem, tags } = useSchedule()
  const { pushError, pushUndo } = useToast()
  const isEdit = editor.mode === 'edit'
  const source = isEdit ? editor.event : editor.draft

  /* Same three-way split TaskEditor makes: an ordinary event, the rule behind
     a repeating one, or a single day of that rule. Only the first two own a
     repeat setting — a day cannot decide how often its series comes round. */
  const isOccurrence = Boolean(source.seriesId)
  const isSeries = Boolean(source.recurrence) && !isOccurrence

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
  const [repeat, setRepeat] = useState(isSeries ? source.recurrence : null)
  const [saving, setSaving] = useState(false)

  const titleRef = useRef(null)
  const panelRef = useRef(null)
  useModalA11y(panelRef, { onClose, initialFocusRef: titleRef })

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

    if (!isOccurrence) {
      // A span cannot repeat, so stretching an event across days drops the
      // rule rather than storing one that normalizeEvent would discard on read.
      payload.recurrence = multiDay || !repeat ? null : { ...repeat, anchor: startDate }
      /* Exceptions belong to a rule. Turning repeating off, or on for the first
         time, starts from none; an existing rule keeps the days already taken
         out of it. */
      if (!payload.recurrence || !isSeries) payload.overrides = {}
    }

    setSaving(true)
    try {
      if (isEdit) await updateEvent(editor.event.id, payload)
      else await addEvent(payload)
      onClose()
    } catch (caught) {
      console.error('Could not save event.', caught)
      pushError('Could not save the event. Try again.')
      setSaving(false)
    }
  }

  async function onDelete() {
    // Same reasoning as TaskEditor's onDelete: a single detached day isn't a
    // document, so only a genuine document delete (an ordinary event, or a
    // whole series) offers Undo.
    const deleted = !isOccurrence ? editor.event : null
    try {
      await removeEvent(editor.event.id)
      onClose()
      if (deleted) {
        // Undo clears the Trash stamp on the document that is still there —
        // writing the snapshot back would create a second copy of it.
        pushUndo(`Deleted "${deleted.title}".`, async () => {
          try {
            await restoreItem('event', deleted.id)
          } catch (caught) {
            console.error('Could not restore the event.', caught)
            pushError('Could not restore the event. It is still in the Trash.')
          }
        })
      }
    } catch (caught) {
      console.error('Could not delete event.', caught)
      pushError('Could not delete the event. Try again.')
    }
  }

  const heading = isEdit
    ? isOccurrence
      ? 'Edit this day'
      : isSeries
        ? 'Edit repeating event'
        : 'Edit event'
    : 'New event'

  return (
    <div
      className="modal"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={panelRef} className="modal__panel" role="dialog" aria-modal="true" aria-label={heading}>
        <form onSubmit={onSubmit}>
          <div className="modal__head">
            <h2 className="modal__title">{heading}</h2>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>

          {!isEdit && <EditorKindToggle kind="event" onChangeKind={onChangeKind} />}

          {isOccurrence && (
            <p className="series-note">
              <RepeatIcon className="series-note__mark" />
              <span className="series-note__text">
                One day of a repeating event. Saving changes this day only and leaves the rest of{' '}
                <strong>{recurrenceLabel(source.recurrence).toLowerCase()}</strong> alone.
              </span>
            </p>
          )}

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

          {!isOccurrence && (
            <RepeatPicker
              date={startDate}
              recurrence={multiDay ? null : repeat}
              onChange={setRepeat}
              disabled={multiDay}
              hint={
                multiDay
                  ? 'A run of days cannot repeat — it would have to say which day of which occurrence you meant. Set the end back to the start date to repeat it.'
                  : !startDate
                    ? 'Pick a start date first — a repeat needs a day to run from.'
                    : repeat
                      ? `${recurrenceLabel(repeat)}, from ${relativeDayLabel(startDate).toLowerCase()} on. Move or delete any single one without touching the rest.`
                      : 'Happens once, on the day above.'
              }
            />
          )}

          <label className="field">
            <span className="field__label">Tag</span>
            <TagSelect tags={tags} value={tagId} onChange={setTagId} />
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
