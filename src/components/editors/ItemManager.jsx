import { useMemo, useRef, useState } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { addDays, formatDayLabel, minToShortLabel, todayKey } from '../../lib/date.js'
import { occursOn, recurrenceLabel } from '../../lib/recurrence.js'
import { useModalA11y } from '../../lib/useModalA11y.js'
import { CloseIcon, DayIcon, RepeatIcon, SpanIcon } from '../icons.jsx'
import { TagGlyph } from './TagGlyph.jsx'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'events', label: 'Events' },
]

/* Used only as a tie-breaker after createdAt: dated items still outrank
   undated ones, and a repeating rule is a document without a day, so it
   shares that tail. The key is a day string no real date can reach — locale
   collation would have put a `~` ahead of the digits. */
const UNDATED = '9999-12-31'

function taskRow(task) {
  return {
    id: task.id,
    kind: 'task',
    title: task.title,
    tagId: task.tagId,
    done: task.done,
    createdAt: task.createdAt ?? 0,
    sortKey: task.recurrence ? UNDATED : (task.date ?? UNDATED),
    sortMin: task.startMin ?? -1,
    meta: task.recurrence
      ? recurrenceLabel(task.recurrence)
      : task.date === null
        ? 'Unscheduled'
        : task.startMin === null
          ? formatDayLabel(task.date)
          : `${formatDayLabel(task.date)} · ${minToShortLabel(task.startMin)}`,
    repeating: Boolean(task.recurrence),
    source: task,
  }
}

function eventRow(event) {
  /* A repeating event is a rule, not a day, so it reads as its rule and sorts
     into the same undated tail a repeating task does — showing the anchor date
     would name one occurrence out of an open-ended run. */
  const when = event.recurrence
    ? recurrenceLabel(event.recurrence)
    : event.startDate === event.endDate
      ? formatDayLabel(event.startDate)
      : `${formatDayLabel(event.startDate)} – ${formatDayLabel(event.endDate)}`
  return {
    id: event.id,
    kind: 'event',
    title: event.title,
    tagId: event.tagId,
    done: false,
    createdAt: event.createdAt ?? 0,
    sortKey: event.recurrence ? UNDATED : event.startDate,
    sortMin: event.startMin ?? -1,
    meta: event.startMin === null ? when : `${when} · ${minToShortLabel(event.startMin)}`,
    repeating: Boolean(event.recurrence),
    source: event,
  }
}

/* Whether a row belongs on `key`. A plain item answers from its own date (or
   date range); a repeating one has no fixed date of its own, so the question
   becomes "would its rule land an occurrence there" — occursOn is the same
   check the calendar views use to expand a series, just asked once instead
   of once per rendered day. */
function matchesDate(row, key) {
  const source = row.source
  if (row.kind === 'task') {
    if (source.recurrence) return occursOn(source.recurrence, key)
    return source.date === key
  }
  if (source.recurrence) return occursOn(source.recurrence, key)
  return source.startDate <= key && key <= source.endDate
}

/**
 * One index of everything in the account — every task (including the rule
 * behind a repeating one) and every event — for editing or deleting an item
 * without first having to remember which day you filed it under. The calendar
 * views answer "what is happening on this day"; nothing answered "what did I
 * put in here", which is the question you ask when clearing something out.
 *
 * Deliberately lists the *documents*, not the calendar: a repeating task
 * appears once, as its rule, rather than as the fifty occurrences the week and
 * month grids expand it into. Deleting it here removes the series, which is
 * the only delete a list like this can honestly offer — per-occurrence skips
 * belong on the occurrence, in the views that draw one.
 */
export function ItemManager({ onClose, onEdit, onEditEvent }) {
  const { tasks, events, tags, getTag, removeTask, removeEvent, removeAllItems, toggleDone } =
    useSchedule()
  const { pushError } = useToast()
  const [filter, setFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState(null)
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState(null)
  const [confirmingAll, setConfirmingAll] = useState(false)
  const panelRef = useRef(null)
  useModalA11y(panelRef, { onClose })

  const rows = useMemo(() => {
    const all = [...tasks.map(taskRow), ...events.map(eventRow)]
    /* Newest first: the thing you just added is the thing you opened this
       list to find. createdAt is a millisecond stamp, so a larger number is
       later; equal stamps fall back to the calendar day (still newest first)
       so a batch import does not shuffle. */
    all.sort((a, b) => {
      if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt
      const aDated = a.sortKey !== UNDATED
      const bDated = b.sortKey !== UNDATED
      if (aDated !== bDated) return aDated ? -1 : 1
      if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? 1 : -1
      return b.sortMin - a.sortMin || a.title.localeCompare(b.title)
    })
    return all
  }, [tasks, events])

  const counts = {
    all: rows.length,
    tasks: tasks.length,
    events: events.length,
  }

  const untaggedCount = rows.filter((row) => !row.tagId).length
  const tagCounts = useMemo(() => {
    const map = new Map()
    for (const row of rows) {
      if (!row.tagId) continue
      map.set(row.tagId, (map.get(row.tagId) ?? 0) + 1)
    }
    return map
  }, [rows])
  const needle = query.trim().toLowerCase()
  const visible = rows.filter((row) => {
    if (filter === 'tasks' && row.kind !== 'task') return false
    if (filter === 'events' && row.kind !== 'event') return false
    if (tagFilter === 'none' && row.tagId) return false
    if (tagFilter !== 'all' && tagFilter !== 'none' && row.tagId !== tagFilter) return false
    if (dateFilter && !matchesDate(row, dateFilter)) return false
    return !needle || row.title.toLowerCase().includes(needle)
  })

  const yesterday = addDays(todayKey(), -1)

  function edit(row) {
    if (row.kind === 'event') onEditEvent(row.source)
    else onEdit(row.source)
  }

  async function remove(row) {
    try {
      if (row.kind === 'event') await removeEvent(row.id)
      else await removeTask(row.id)
      setConfirming(null)
    } catch (caught) {
      console.error('Could not delete item.', caught)
      pushError(`Could not delete "${row.title}". Try again.`)
    }
  }

  async function removeAll() {
    try {
      await removeAllItems()
      setConfirmingAll(false)
    } catch (caught) {
      console.error('Could not delete all items.', caught)
      pushError('Could not delete everything. Some items may remain — try again.')
    }
  }

  const confirmingRow = visible.find((row) => row.id === confirming) ?? null

  return (
    <div
      className="modal"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={panelRef} className="modal__panel" role="dialog" aria-modal="true" aria-label="All items">
        <div className="modal__head">
          <h2 className="modal__title">All items</h2>
          <div className="modal__head-actions">
            {rows.length > 0 && (
              <button
                type="button"
                className="ghost-button ghost-button--sm"
                onClick={() => setConfirmingAll(true)}
              >
                Delete all
              </button>
            )}
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
        </div>

        {confirmingAll && (
          <p className="banner banner--error item-manager__confirm-all">
            Delete all {rows.length} tasks and events? This cannot be undone.
            <span className="item-manager__confirm-all-actions">
              <button type="button" className="danger-button danger-button--sm" onClick={removeAll}>
                Delete all
              </button>
              <button
                type="button"
                className="ghost-button ghost-button--sm"
                onClick={() => setConfirmingAll(false)}
              >
                Cancel
              </button>
            </span>
          </p>
        )}

        <div className="item-manager__filters">
          <div className="filter-row" role="group" aria-label="Show">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`filter-chip${filter === option.id ? ' filter-chip--on' : ''}`}
                aria-pressed={filter === option.id}
                onClick={() => setFilter(option.id)}
              >
                {/* One interpolation, not two adjacent ones: a screen reader
                    reading "Tasks" and "14" as separate nodes announces them as
                    separate things. */}
                {`${option.label} ${counts[option.id]}`}
              </button>
            ))}
          </div>

          {tags.length > 0 && (
            <select
              className="input"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              aria-label="Filter by tag"
            >
              <option value="all">Any tag</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name} ({tagCounts.get(tag.id) ?? 0})
                </option>
              ))}
              {untaggedCount > 0 && (
                <option value="none">No tag ({untaggedCount})</option>
              )}
            </select>
          )}

          <div className="filter-row" role="group" aria-label="Filter by date">
            <button
              type="button"
              className={`filter-chip${dateFilter === null ? ' filter-chip--on' : ''}`}
              aria-pressed={dateFilter === null}
              onClick={() => setDateFilter(null)}
            >
              Any date
            </button>
            <button
              type="button"
              className={`filter-chip${dateFilter === todayKey() ? ' filter-chip--on' : ''}`}
              aria-pressed={dateFilter === todayKey()}
              onClick={() => setDateFilter(todayKey())}
            >
              Today
            </button>
            <button
              type="button"
              className={`filter-chip${dateFilter === yesterday ? ' filter-chip--on' : ''}`}
              aria-pressed={dateFilter === yesterday}
              onClick={() => setDateFilter(yesterday)}
            >
              Yesterday
            </button>
            <input
              type="date"
              className="input item-manager__date"
              value={dateFilter ?? ''}
              onChange={(e) => setDateFilter(e.target.value || null)}
              aria-label="Filter by a specific date"
            />
          </div>
        </div>

        <input
          className="input item-manager__search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title"
          aria-label="Search items by title"
        />

        {visible.length === 0 ? (
          <p className="empty empty--sm">
            {rows.length === 0 ? 'Nothing here yet.' : 'No items match that.'}
          </p>
        ) : (
          <ul className="item-list">
            {visible.map((row) => {
              const tag = getTag(row.tagId)
              return (
                <li key={`${row.kind}-${row.id}`} className="item-list__row">
                  {row.kind === 'task' ? (
                    <input
                      type="checkbox"
                      className="item-list__check"
                      checked={row.done}
                      disabled={row.repeating}
                      onChange={() => toggleDone(row.id)}
                      aria-label={`Mark "${row.title}" ${row.done ? 'not done' : 'done'}`}
                      title={
                        row.repeating
                          ? 'A repeating task is checked off day by day, in the Day, Week, or Month view.'
                          : undefined
                      }
                    />
                  ) : (
                    <span className="item-list__check item-list__check--spacer" aria-hidden="true" />
                  )}

                  {/* Kind is shape, not colour — the same task/event grammar
                      the calendar uses, so a row here reads as the thing it
                      will open. */}
                  <span className="item-list__kind" title={row.kind === 'event' ? 'Event' : 'Task'}>
                    {row.repeating ? (
                      <RepeatIcon
                        aria-label={row.kind === 'event' ? 'Repeating event' : 'Repeating task'}
                      />
                    ) : row.kind === 'event' ? (
                      <SpanIcon aria-label="Event" />
                    ) : (
                      <DayIcon aria-label="Task" />
                    )}
                  </span>

                  <span className="item-list__main">
                    <span
                      className={`item-list__title${row.done ? ' item-list__title--done' : ''}`}
                    >
                      {row.title}
                    </span>
                    <span className="item-list__meta">
                      {row.meta}
                      {tag && (
                        <>
                          {' · '}
                          <TagGlyph tag={tag} variant="swatch" className="tag-swatch tag-swatch--sm" />
                          {tag.name}
                        </>
                      )}
                    </span>
                  </span>

                  {confirming === row.id ? (
                    <span className="item-list__confirm">
                      <button
                        type="button"
                        className="danger-button danger-button--sm"
                        onClick={() => remove(row)}
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        className="ghost-button ghost-button--sm"
                        onClick={() => setConfirming(null)}
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <span className="item-list__actions">
                      <button
                        type="button"
                        className="ghost-button ghost-button--sm"
                        onClick={() => edit(row)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => setConfirming(row.id)}
                        aria-label={`Delete ${row.title}`}
                      >
                        <CloseIcon />
                      </button>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {confirmingRow?.repeating && (
          <p className="field__hint">
            This is the rule behind a repeating {confirmingRow.kind} — deleting it removes every
            one of its occurrences.
          </p>
        )}

        <p className="field__hint">
          A repeating task or event appears once here, as the rule itself. Skipping a single day
          of one is done on that day, in the Day, Week, or Month view.
        </p>
      </div>
    </div>
  )
}
