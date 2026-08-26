import { useEffect, useMemo, useState } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { formatDayLabel, minToShortLabel } from '../../lib/date.js'
import { recurrenceLabel } from '../../lib/recurrence.js'
import { CloseIcon, DayIcon, RepeatIcon, SpanIcon } from '../icons.jsx'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'events', label: 'Events' },
]

/* Everything without a date sorts after everything with one — a key no real
   day can reach, rather than a separate partition pass. A repeating task is a
   rule, not a day on the calendar, so it lands in the same tail.

   A day key past every real one, not a punctuation sentinel: these are
   compared as plain strings below, and locale collation would have put a `~`
   ahead of the digits rather than after them. */
const UNDATED = '9999-12-31'

function taskRow(task) {
  return {
    id: task.id,
    kind: 'task',
    title: task.title,
    tagId: task.tagId,
    done: task.done,
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
    sortKey: event.recurrence ? UNDATED : event.startDate,
    sortMin: event.startMin ?? -1,
    meta: event.startMin === null ? when : `${when} · ${minToShortLabel(event.startMin)}`,
    repeating: Boolean(event.recurrence),
    source: event,
  }
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
  const { tasks, events, getTag, removeTask, removeEvent } = useSchedule()
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState(null)

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const rows = useMemo(() => {
    const all = [...tasks.map(taskRow), ...events.map(eventRow)]
    /* Chronological, oldest first, so anything already past — the stuff you
       opened this list to clear out — is at the top rather than buried under
       everything still to come. Day keys are fixed-width ASCII, so `<` orders
       them correctly and, unlike localeCompare, keeps the undated tail last. */
    all.sort((a, b) => {
      if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? -1 : 1
      return a.sortMin - b.sortMin || a.title.localeCompare(b.title)
    })
    return all
  }, [tasks, events])

  const counts = {
    all: rows.length,
    tasks: tasks.length,
    events: events.length,
  }

  const needle = query.trim().toLowerCase()
  const visible = rows.filter((row) => {
    if (filter === 'tasks' && row.kind !== 'task') return false
    if (filter === 'events' && row.kind !== 'event') return false
    return !needle || row.title.toLowerCase().includes(needle)
  })

  function edit(row) {
    if (row.kind === 'event') onEditEvent(row.source)
    else onEdit(row.source)
  }

  async function remove(row) {
    if (row.kind === 'event') await removeEvent(row.id)
    else await removeTask(row.id)
    setConfirming(null)
  }

  const confirmingRow = visible.find((row) => row.id === confirming) ?? null

  return (
    <div
      className="modal"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal__panel card" role="dialog" aria-modal="true" aria-label="All items">
        <div className="modal__head">
          <h2 className="modal__title">All items</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

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
                          <span
                            className="tag-swatch tag-swatch--sm"
                            style={{ background: tag.color }}
                            aria-hidden="true"
                          />
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
