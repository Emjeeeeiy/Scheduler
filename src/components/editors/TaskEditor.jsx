import { useEffect, useMemo, useRef, useState } from 'react'
import { useSchedule, DEFAULT_DURATION_MIN } from '../../state/ScheduleContext.jsx'
import { useSettings } from '../../state/SettingsContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { minToLabel, minToTimeValue, relativeDayLabel, timeValueToMin, todayKey } from '../../lib/date.js'
import { recurrenceLabel } from '../../lib/recurrence.js'
import { TASK_PRIORITIES } from '../../lib/normalize.js'
import { suggestSlots } from '../../lib/autoSchedule.js'
import { buildTagModel, suggestTag } from '../../lib/suggestTag.js'
import { suggestTagAi } from '../../lib/aiClient.js'
import { useModalA11y } from '../../lib/useModalA11y.js'
import { CloseIcon, PinIcon, RepeatIcon, SearchIcon } from '../icons.jsx'
import { TagGlyph } from './TagGlyph.jsx'
import { BlockedByPicker } from './BlockedByPicker.jsx'
import { EditorKindToggle } from './EditorKindToggle.jsx'
import { RepeatPicker } from './RepeatPicker.jsx'
import { SubtaskList } from './SubtaskList.jsx'
import { TagSelect } from './TagSelect.jsx'

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240, 480]

const PRIORITY_LABEL = { low: 'Low', normal: 'Normal', high: 'High' }

function durationOption(min) {
  if (min < 60) return `${min} min`
  const h = min / 60
  return `${Number.isInteger(h) ? h : h.toFixed(1)} hour${h === 1 ? '' : 's'}`
}

/** Create and edit share one form: the fields are identical, and keeping them
    together means a change to the time model can only be made in one place. */
export function TaskEditor({ editor, onClose, onEditTask, onChangeKind }) {
  const { addTask, updateTask, removeTask, restoreItem, addTemplate, tags, tasks, getSeries, tasksOn, eventsOn } =
    useSchedule()
  const { settings } = useSettings()
  const { pushError, pushSuccess, pushUndo } = useToast()
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
  const [priority, setPriority] = useState(source.priority ?? 'normal')
  const [pinned, setPinned] = useState(source.pinned ?? false)
  const [blockedBy, setBlockedBy] = useState(source.blockedBy ?? [])
  const [subtasks, setSubtasks] = useState(source.subtasks ?? [])
  const [repeat, setRepeat] = useState(isSeries ? source.recurrence : null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saving, setSaving] = useState(false)

  /* Which tag this title looks like, learned from the tasks already filed by
     hand (see suggestTag.js). The model is a pass over every task, so it is
     memoized against the list rather than rebuilt on each keystroke; the
     lookup itself is a few Map reads and can run per render.

     Only offered when the field is still empty — a suggestion next to a tag
     someone deliberately chose is second-guessing, not help. */
  const tagModel = useMemo(() => buildTagModel(tasks), [tasks])
  const suggestedTag = useMemo(() => {
    if (tagId) return null
    const guess = suggestTag(title, tagModel, new Set(tags.map((t) => t.id)))
    return guess ? (tags.find((t) => t.id === guess.tagId) ?? null) : null
  }, [tagId, title, tagModel, tags])

  /* The AI fallback: only asked when the heuristic above came up with
     nothing — a fresh account, or a title with no word history yet — which
     is exactly the case suggestTag.js structurally cannot answer no matter
     how it's tuned. Debounced so a title being actively typed doesn't fire
     a request per keystroke, and cached per normalized title for the
     editor's own lifetime so backspacing over a character and retyping it
     doesn't spend a second call on the same question.

     The cache is real React state, not a ref holding a Map — a ref is not
     safe to read during render (React has no way to know it changed and
     re-render), and a cache hit needs to show up on screen the same way any
     other derived value does. aiClient.js already guarantees the fetch
     itself resolves to null rather than throwing on any failure — offline,
     signed out, a timeout, Gemini's own unpublished free-tier rate limit —
     so there is nothing to catch here, only a result to store. */
  const [aiTagCache, setAiTagCache] = useState(() => new Map())
  const shouldAskAi = !tagId && !suggestedTag && title.trim().length >= 3
  const normalizedTitle = title.trim().toLowerCase()
  const cachedResult = shouldAskAi ? aiTagCache.get(normalizedTitle) : undefined
  // `tags` is a fresh array reference on every ScheduleContext recompute,
  // including ones with nothing to do with tags (any Firestore snapshot
  // update). Depending on it directly restarts this debounce's wait every
  // time, which in practice fired 2-3 overlapping requests per title
  // instead of one — and the pile-up of concurrent calls is almost
  // certainly why some of them were slow enough to hit the client timeout.
  // Reduced to a content-based string so the effect only restarts when the
  // tag set itself actually changes.
  const tagsKey = tags.map((t) => `${t.id}:${t.name}`).join('|')

  useEffect(() => {
    if (!shouldAskAi || aiTagCache.has(normalizedTitle)) return undefined

    let cancelled = false
    const timer = setTimeout(async () => {
      const result = await suggestTagAi({
        title: title.trim(),
        tags: tags.map((t) => ({ id: t.id, name: t.name })),
      })
      if (!cancelled) {
        setAiTagCache((prev) => new Map(prev).set(normalizedTitle, result))
      }
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // aiTagCache is deliberately excluded: including it would re-run this
    // effect on every cache write, which is exactly the request this debounce
    // exists to prevent. shouldAskAi/normalizedTitle already capture every
    // input the cache-hit check actually depends on. tags is read fresh
    // inside the timer when it fires; tagsKey stands in for it in the
    // dependency array (see the comment above tagsKey).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAskAi, normalizedTitle, title, tagsKey])

  const aiSuggestedTagId = cachedResult ?? null
  const aiSuggestedTag = aiSuggestedTagId ? (tags.find((t) => t.id === aiSuggestedTagId) ?? null) : null

  // The heuristic answers instantly and wins when it has an opinion; the AI
  // suggestion only ever fills the gap where it has none.
  const displayedTagSuggestion = suggestedTag ?? aiSuggestedTag

  // null = not searched yet, [] = searched and found nothing, otherwise the
  // suggestions themselves — three distinct states the UI reads apart.
  // (Unrelated to the tag suggestion above — this backs "Find a slot".)
  const [suggestions, setSuggestions] = useState(null)

  const titleRef = useRef(null)
  const panelRef = useRef(null)
  useModalA11y(panelRef, { onClose, initialFocusRef: titleRef })

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
      priority,
      pinned,
      blockedBy,
      subtasks,
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
      pushError('Could not save the task. Try again.')
      setSaving(false)
    }
  }

  async function onDelete() {
    /* "Skip this day" (isOccurrence) detaches a day from a rule rather than
       removing a document, so there is nothing to restore and no Undo — only
       an ordinary task or a whole series is a real document delete.
       Those go to the Trash rather than being erased (see removeTask), so
       Undo clears the stamp on the document that is still there; writing the
       snapshot back would leave the account holding two of it. */
    const deleted = !isOccurrence ? editor.task : null
    try {
      await removeTask(editor.task.id)
      onClose()
      if (deleted) {
        pushUndo(`Deleted "${deleted.title}".`, async () => {
          try {
            await restoreItem('task', deleted.id)
          } catch (caught) {
            console.error('Could not restore the task.', caught)
            pushError('Could not restore the task. It is still in the Trash.')
          }
        })
      }
    } catch (caught) {
      console.error('Could not delete task.', caught)
      pushError('Could not delete the task. Try again.')
    }
  }

  /* Reuses the exact "what's busy" shape TodayView's own free-slot finder
     builds — tasks plus single-day timed events — so a suggestion here is
     never a slot the Day view itself wouldn't also call open. The task
     being edited is excluded from its own day's busy list: rescheduling it
     shouldn't have it block itself out of the search. */
  function findSlot() {
    const excludeId = isEdit ? editor.task.id : null
    const dayItems = (key) => [
      ...tasksOn(key).filter((t) => t.id !== excludeId),
      ...eventsOn(key).filter((e) => Number.isFinite(e.startMin) && e.startDate === e.endDate),
    ]
    setSuggestions(
      suggestSlots({
        fromKey: date || todayKey(),
        durationMin,
        dayItems,
        workingHours: settings.workingHours,
      }),
    )
  }

  function applySuggestion(suggestion) {
    setDate(suggestion.date)
    setTime(minToTimeValue(suggestion.startMin))
    setSuggestions(null)
  }

  async function saveAsTemplate() {
    const trimmed = title.trim()
    if (!trimmed) {
      titleRef.current?.focus()
      return
    }
    try {
      await addTemplate({ title: trimmed, tagId: tagId || null, durationMin, priority })
      pushSuccess(`Saved "${trimmed}" as a template.`)
    } catch (caught) {
      console.error('Could not save the template.', caught)
      pushError('Could not save the template. Try again.')
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
      <div ref={panelRef} className="modal__panel" role="dialog" aria-modal="true" aria-label={heading}>
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
              {/* Offered, never applied. One click to take it, and no click
                  at all to ignore it — a tag filled in silently is a tag
                  nobody reviews. The tooltip names its source: the
                  from-history guess and the AI one earn different trust,
                  and saying which this is costs nothing to show. */}
              {displayedTagSuggestion && (
                <button
                  type="button"
                  className="tag-suggest"
                  onClick={() => setTagId(displayedTagSuggestion.id)}
                  title={
                    suggestedTag
                      ? `Based on other tasks you've filed under ${displayedTagSuggestion.name}`
                      : `AI suggestion — no history to base this on yet`
                  }
                >
                  <TagGlyph tag={displayedTagSuggestion} variant="swatch" className="tag-swatch tag-swatch--sm" />
                  Use {displayedTagSuggestion.name}?
                </button>
              )}
            </label>
          </div>

          {!isOccurrence && (
            <div className="field">
              <button type="button" className="ghost-button ghost-button--sm button--icon-label" onClick={findSlot}>
                <SearchIcon className="button-icon" />
                Find a slot
              </button>
              {suggestions && suggestions.length === 0 && (
                <span className="field__hint">
                  No {durationOption(durationMin)} opening in the next two weeks.
                </span>
              )}
              {suggestions && suggestions.length > 0 && (
                <div className="filter-row" role="group" aria-label="Suggested slots">
                  {suggestions.map((s) => (
                    <button
                      key={`${s.date}-${s.startMin}`}
                      type="button"
                      className="filter-chip"
                      onClick={() => applySuggestion(s)}
                    >
                      {relativeDayLabel(s.date)} · {minToLabel(s.startMin)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="field-row">
            <div className="field">
              <span className="field__label">Priority</span>
              <div className="filter-row" role="group" aria-label="Priority">
                {TASK_PRIORITIES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`filter-chip${priority === option ? ' filter-chip--on' : ''}`}
                    aria-pressed={priority === option}
                    onClick={() => setPriority(option)}
                  >
                    {PRIORITY_LABEL[option]}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="field__label">Pin</span>
              <button
                type="button"
                className={`filter-chip${pinned ? ' filter-chip--on' : ''}`}
                aria-pressed={pinned}
                onClick={() => setPinned((v) => !v)}
              >
                <PinIcon width="14" height="14" />
                {pinned ? 'Pinned' : 'Pin to dashboard'}
              </button>
            </div>
          </div>

          <SubtaskList value={subtasks} onChange={setSubtasks} />

          <BlockedByPicker taskId={isEdit ? editor.task.id : null} value={blockedBy} onChange={setBlockedBy} />

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
            {!isOccurrence && (
              <button type="button" className="ghost-button ghost-button--sm" onClick={saveAsTemplate}>
                Save as template
              </button>
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
