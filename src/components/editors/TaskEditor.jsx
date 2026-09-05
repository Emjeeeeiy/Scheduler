import { useEffect, useMemo, useRef, useState } from 'react'
import { useSchedule, DEFAULT_DURATION_MIN } from '../../state/ScheduleContext.jsx'
import { useSettings } from '../../state/SettingsContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { useNow } from '../../lib/useNow.js'
import { minToLabel, minToTimeValue, relativeDayLabel, timeValueToMin, todayKey } from '../../lib/date.js'
import { recurrenceLabel } from '../../lib/recurrence.js'
import { TASK_PRIORITIES } from '../../lib/normalize.js'
import { planningSlots, suggestSlots } from '../../lib/autoSchedule.js'
import { buildTagModel, suggestTag } from '../../lib/suggestTag.js'
import { enrichTaskAi } from '../../lib/aiClient.js'
import { useModalA11y } from '../../lib/useModalA11y.js'
import { CloseIcon, PinIcon, RepeatIcon, SearchIcon } from '../icons.jsx'
import { AiSuggestionPanel } from './AiSuggestionPanel.jsx'
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
  const now = useNow()
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

  /* The AI enrichment: one call that can fill in time, tag, checklist and
     notes together, asked only once there's a title worth reasoning about
     and at least one of those still empty. Debounced so active typing
     doesn't fire a request per keystroke, and cached per normalized title
     for the editor's own lifetime so backspacing over a character and
     retyping it doesn't spend a second call on the same question.

     The cache is real React state, not a ref holding a Map — a ref is not
     safe to read during render (React has no way to know it changed and
     re-render), and a cache hit needs to show up on screen the same way any
     other derived value does. aiClient.js already guarantees the fetch
     itself resolves to null rather than throwing on any failure — offline,
     signed out, a timeout, Gemini's own unpublished free-tier rate limit —
     so there is nothing to catch here, only a result to store.

     Duration gets no empty check of its own: it always holds a value
     (defaults to DEFAULT_DURATION_MIN) and only becomes something someone
     has actually chosen once a date and time exist for it to modify — the
     same rule the Duration field's own `disabled={!date || !time}` already
     applies, so it rides along with `time` below. A single occurrence's own
     day is fixed by its series, not freely reschedulable here — matching
     "Find a slot" being hidden for one below — so time is treated as
     already spoken for. */
  const filled = {
    time: isOccurrence || Boolean(time),
    tagId: Boolean(tagId),
    subtasks: subtasks.length > 0,
    notes: Boolean(notes.trim()),
  }
  const [enrichCache, setEnrichCache] = useState(() => new Map())
  // Which normalized title currently has a request in flight, so the UI can
  // say something rather than sit silently for however long that takes —
  // "it takes so long the user will not wait" was the actual reported
  // problem, and a wait with no feedback reads as broken well before a
  // wait with a visible "thinking" state does.
  const [pendingTitle, setPendingTitle] = useState(null)
  const shouldEnrich = title.trim().length >= 3 && Object.values(filled).some((v) => !v)
  const normalizedTitle = title.trim().toLowerCase()
  const cachedEnrichment = shouldEnrich ? enrichCache.get(normalizedTitle) : undefined
  const isEnriching = shouldEnrich && pendingTitle === normalizedTitle
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
    if (!shouldEnrich || enrichCache.has(normalizedTitle)) return undefined

    let cancelled = false
    const timer = setTimeout(async () => {
      setPendingTitle(normalizedTitle)
      const forDate = date || todayKey()
      const fromMin = forDate === now.key ? now.min : 0
      const excludeId = isEdit ? editor.task.id : null
      const dayItems = (key) => [
        ...tasksOn(key).filter((t) => t.id !== excludeId),
        ...eventsOn(key).filter((e) => Number.isFinite(e.startMin) && e.startDate === e.endDate),
      ]
      const slots = planningSlots({ dayItems, key: forDate, workingHours: settings.workingHours, fromMin })
      // Titles, tags and durations only — see Phase 8's plan for why notes
      // and checklists never leave the device even for this account's own
      // history: the free tier's training/human-review use of prompt
      // content applies to whatever this route sends, and there is no
      // reason those two fields need to be part of it.
      const history = [...tasks]
        .filter((t) => t.id !== excludeId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 15)
        .map((t) => ({ title: t.title, tagId: t.tagId, durationMin: t.durationMin, startMin: t.startMin }))

      const result = await enrichTaskAi({
        title: title.trim(),
        today: todayKey(),
        tags: tags.map((t) => ({ id: t.id, name: t.name })),
        slots: slots.map((s) => ({ startMin: s.startMin, endMin: s.endMin })),
        history,
        filled,
      })
      if (!cancelled) {
        setEnrichCache((prev) => new Map(prev).set(normalizedTitle, result ? { ...result, forDate } : null))
        setPendingTitle((prev) => (prev === normalizedTitle ? null : prev))
      }
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(timer)
      setPendingTitle((prev) => (prev === normalizedTitle ? null : prev))
    }
    // enrichCache is deliberately excluded (see the tagsKey comment above for
    // the same reasoning applied to `tags`). tasksOn/eventsOn/tasks/settings/
    // now/filled are all read fresh inside the timer rather than tracked:
    // none of them are stable references, so depending on them directly
    // would reintroduce the exact overlapping-request bug tagsKey exists to
    // avoid, and a day's items or "now" shifting slightly mid-debounce isn't
    // worth restarting the wait for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldEnrich, normalizedTitle, title, tagsKey, date])

  // Tag keeps its own existing surface — the "Use X?" button next to the Tag
  // field below, shared with the offline heuristic that answers first (same
  // merge as before: the heuristic wins when it has an opinion, AI only
  // fills the gap where it has none). Deliberately not duplicated into
  // AiSuggestionPanel, which covers the three fields that had no prior
  // surface at all.
  const aiSuggestedTag =
    !tagId && cachedEnrichment?.tagId ? (tags.find((t) => t.id === cachedEnrichment.tagId) ?? null) : null
  const displayedTagSuggestion = suggestedTag ?? aiSuggestedTag

  const aiTimeSuggestion =
    !filled.time && cachedEnrichment?.startMin != null
      ? { date: cachedEnrichment.forDate, startMin: cachedEnrichment.startMin, durationMin: cachedEnrichment.durationMin }
      : null
  const aiChecklistSuggestion =
    !filled.subtasks && cachedEnrichment?.subtasks?.length > 0 ? cachedEnrichment.subtasks : null
  const aiNotesSuggestion = !filled.notes && cachedEnrichment?.notes ? cachedEnrichment.notes : null
  const hasAiSuggestions = Boolean(aiTimeSuggestion || aiChecklistSuggestion || aiNotesSuggestion)

  // Dismissing hides the panel for this title only — a fresh title (or
  // reopening the editor) gets to ask again.
  const [dismissedTitle, setDismissedTitle] = useState(null)
  const showAiPanel = hasAiSuggestions && dismissedTitle !== normalizedTitle

  function applyAiSuggestions() {
    if (aiTimeSuggestion) {
      if (!date) setDate(aiTimeSuggestion.date)
      setTime(minToTimeValue(aiTimeSuggestion.startMin))
      setDurationMin(aiTimeSuggestion.durationMin)
    }
    if (aiChecklistSuggestion) {
      setSubtasks(
        aiChecklistSuggestion.map((item, i) => ({ id: `sub-ai-${Date.now()}-${i}`, title: item, done: false })),
      )
    }
    if (aiNotesSuggestion) setNotes(aiNotesSuggestion)
    setDismissedTitle(normalizedTitle)
  }

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

          {isEnriching && !showAiPanel && <p className="ai-suggest__thinking">Checking for AI suggestions…</p>}

          {showAiPanel && (
            <AiSuggestionPanel
              time={aiTimeSuggestion}
              checklist={aiChecklistSuggestion}
              notes={aiNotesSuggestion}
              onApply={applyAiSuggestions}
              onDismiss={() => setDismissedTitle(normalizedTitle)}
            />
          )}

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
