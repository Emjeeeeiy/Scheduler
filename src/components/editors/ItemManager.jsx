import { useMemo, useRef, useState } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { addDays, formatDayLabel, minToShortLabel, todayKey } from '@cadence/shared/date.js'
import { occursOn, recurrenceLabel } from '@cadence/shared/recurrence.js'
import { useModalA11y } from '../../lib/useModalA11y.js'
import { CloseIcon, RepeatIcon, SpanIcon, TrashIcon } from '../icons.jsx'
import { TagGlyph } from './TagGlyph.jsx'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'events', label: 'Events' },
  { id: 'trash', label: 'Trash' },
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
  const {
    tasks,
    events,
    tags,
    getTag,
    removeTask,
    removeEvent,
    removeAllItems,
    trashedTasks,
    trashedEvents,
    restoreItem,
    purgeItem,
    emptyTrash,
    toggleDone,
  } = useSchedule()
  const { pushError, pushSuccess, pushUndo } = useToast()
  const [filter, setFilter] = useState('all')
  const [tagFilter, setTagFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState(null)
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState(null)
  const [confirmingAll, setConfirmingAll] = useState(false)
  const [confirmingEmpty, setConfirmingEmpty] = useState(false)
  const panelRef = useRef(null)
  useModalA11y(panelRef, { onClose })

  const trash = useMemo(
    () => [...trashedTasks.map(taskRow), ...trashedEvents.map(eventRow)],
    [trashedTasks, trashedEvents],
  )

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
    trash: trash.length,
  }
  const inTrash = filter === 'trash'

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
  /* Trash is a different set of rows, not a filter over the same ones —
     everything below it is already gone from `rows`. The tag and date
     filters still apply, since the question "which of the things I deleted
     was the Work one" is the same question here as anywhere else. */
  const visible = (inTrash ? trash : rows).filter((row) => {
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

  /* Undo puts the document back rather than writing a copy of it. Deleting
     is a stamp now (see removeTask), so the original is still sitting in
     Firestore — re-importing the snapshot would leave the account holding
     two of everything anyone ever un-deleted. */
  async function restore(kind, id) {
    try {
      await restoreItem(kind, id)
    } catch (caught) {
      console.error('Could not restore.', caught)
      pushError('Could not restore that. It is still in the Trash.')
    }
  }

  async function remove(row) {
    try {
      if (row.kind === 'event') await removeEvent(row.id)
      else await removeTask(row.id)
      setConfirming(null)
      pushUndo(`Deleted "${row.title}".`, () => restore(row.kind, row.id))
    } catch (caught) {
      console.error('Could not delete item.', caught)
      pushError(`Could not delete "${row.title}". Try again.`)
    }
  }

  async function removeAll() {
    const snapshot = [...tasks.map((t) => ['task', t.id]), ...events.map((e) => ['event', e.id])]
    try {
      await removeAllItems()
      setConfirmingAll(false)
      pushUndo(`Deleted ${snapshot.length} item${snapshot.length === 1 ? '' : 's'}.`, async () => {
        for (const [kind, id] of snapshot) await restore(kind, id)
      })
    } catch (caught) {
      console.error('Could not delete all items.', caught)
      pushError('Could not delete everything. Some items may remain — try again.')
    }
  }

  /* The one delete with no undo behind it — the document is gone from
     Firestore afterwards, which is exactly what the Trash exists to defer
     until someone asks for it explicitly. */
  async function purge(row) {
    try {
      await purgeItem(row.kind, row.id)
      setConfirming(null)
    } catch (caught) {
      console.error('Could not permanently delete item.', caught)
      pushError(`Could not permanently delete "${row.title}". Try again.`)
    }
  }

  async function onEmptyTrash() {
    try {
      const count = await emptyTrash()
      setConfirmingEmpty(false)
      pushSuccess(`Deleted ${count} item${count === 1 ? '' : 's'} for good.`)
    } catch (caught) {
      console.error('Could not empty the trash.', caught)
      pushError('Could not empty the Trash. Some items may remain — try again.')
    }
  }

  const itemWord = (n) => `${n} item${n === 1 ? '' : 's'}`
  const today = todayKey()
  /* One date control, not four: Today and Yesterday are chips that switch the
     filter off when pressed again, and the field clears itself — so there is no
     "Any date" chip that is only the cleared state of the ones beside it. */
  const toggleDate = (key) => setDateFilter((current) => (current === key ? null : key))
  const footVisible = inTrash ? trash.length > 0 : rows.length > 0

  return (
    <div
      className="modal modal--sheet"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        className="modal__panel item-manager"
        role="dialog"
        aria-modal="true"
        aria-label="All items"
      >
        <div className="modal__head">
          <h2 className="modal__title">All items</h2>
          <div className="modal__head-actions">
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Three short rows, from the most used to the least: find it by name,
            narrow it by kind (the Trash is a place, so it sits apart at the end),
            narrow it by tag or day. */}
        <div className="item-manager__toolbar">
          <input
            className="input item-manager__search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title"
            aria-label="Search items by title"
          />

          <div className="filter-row item-manager__kinds" role="group" aria-label="Show">
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`filter-chip${filter === option.id ? ' filter-chip--on' : ''}${
                  option.id === 'trash' ? ' item-manager__trash' : ''
                }`}
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

          <div className="item-manager__where">
            {tags.length > 0 && (
              <select
                className="input item-manager__tag"
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
                {untaggedCount > 0 && <option value="none">No tag ({untaggedCount})</option>}
              </select>
            )}

            <div className="filter-row item-manager__dates" role="group" aria-label="Filter by date">
              <button
                type="button"
                className={`filter-chip${dateFilter === today ? ' filter-chip--on' : ''}`}
                aria-pressed={dateFilter === today}
                onClick={() => toggleDate(today)}
              >
                Today
              </button>
              <button
                type="button"
                className={`filter-chip${dateFilter === yesterday ? ' filter-chip--on' : ''}`}
                aria-pressed={dateFilter === yesterday}
                onClick={() => toggleDate(yesterday)}
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
              {dateFilter && (
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setDateFilter(null)}
                  aria-label="Clear the date filter"
                >
                  <CloseIcon />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="item-manager__body">
          {visible.length === 0 ? (
            <p className="empty empty--sm">
              {inTrash
                ? trash.length === 0
                  ? 'The Trash is empty.'
                  : 'No deleted items match that.'
                : rows.length === 0
                  ? 'Nothing here yet.'
                  : 'No items match that.'}
            </p>
          ) : (
            <ul className="item-list">
              {visible.map((row) => {
                const tag = getTag(row.tagId)
                const isConfirming = confirming === row.id
                const text = (
                  <>
                    <span
                      className={`item-list__title${row.done ? ' item-list__title--done' : ''}`}
                    >
                      {row.title}
                    </span>
                    <span className="item-list__meta">
                      {row.repeating && <RepeatIcon className="item-list__repeat" aria-hidden="true" />}
                      {row.meta}
                      {tag && (
                        <>
                          {' · '}
                          <TagGlyph tag={tag} variant="swatch" className="tag-swatch tag-swatch--sm" />
                          {tag.name}
                        </>
                      )}
                    </span>
                  </>
                )
                return (
                  <li
                    key={`${row.kind}-${row.id}`}
                    className={`item-list__row${isConfirming ? ' item-list__row--confirming' : ''}`}
                  >
                    {/* One leading slot. A task has its checkbox; an event, which
                        never has one, has its span icon — the calendar's own
                        task/event grammar, so the row reads as what it will open. */}
                    {row.kind === 'task' ? (
                      <label className="item-list__lead item-list__tick">
                        <input
                          type="checkbox"
                          className="item-list__check"
                          checked={row.done}
                          disabled={row.repeating || inTrash}
                          onChange={() => toggleDone(row.id)}
                          aria-label={`Mark "${row.title}" ${row.done ? 'not done' : 'done'}`}
                          title={
                            inTrash
                              ? 'Restore this task to tick it off.'
                              : row.repeating
                                ? 'A repeating task is checked off day by day, in the Day, Week, or Month view.'
                                : undefined
                          }
                        />
                      </label>
                    ) : (
                      <span className="item-list__lead item-list__kind" title="Event">
                        <SpanIcon aria-label="Event" />
                      </span>
                    )}

                    {/* The title is the way in: pressing the row opens the item.
                        (A deleted item cannot be edited, so there the text is just
                        text and the row's button is Restore.) */}
                    {inTrash ? (
                      <span className="item-list__main">{text}</span>
                    ) : (
                      <button
                        type="button"
                        className="item-list__main item-list__open"
                        onClick={() => edit(row)}
                      >
                        {text}
                      </button>
                    )}

                    {isConfirming ? (
                      <span className="item-list__confirm">
                        <button
                          type="button"
                          className="danger-button danger-button--sm"
                          onClick={() => (inTrash ? purge(row) : remove(row))}
                        >
                          {inTrash ? 'Delete for good' : 'Delete'}
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
                        {inTrash && (
                          <button
                            type="button"
                            className="ghost-button ghost-button--sm"
                            onClick={() => restore(row.kind, row.id)}
                          >
                            Restore
                          </button>
                        )}
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => setConfirming(row.id)}
                          aria-label={
                            inTrash ? `Permanently delete ${row.title}` : `Delete ${row.title}`
                          }
                          title={inTrash ? 'Delete for good' : 'Delete'}
                        >
                          <TrashIcon />
                        </button>
                      </span>
                    )}

                    {/* Said under the row it is about, while that row is waiting on
                        an answer — not as a paragraph at the foot of the list. */}
                    {isConfirming && row.repeating && (
                      <p className="field__hint item-list__note">
                        This is the rule behind a repeating {row.kind} — deleting it removes every
                        one of its occurrences.
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* The bulk delete lives here, ruled off under the list, and its question
            replaces it in place — nothing above it moves. */}
        {footVisible && (
          <div className="item-manager__foot">
            {inTrash && confirmingEmpty ? (
              <p className="banner banner--error" role="alert">
                Permanently delete {itemWord(trash.length)} in the Trash? This cannot be undone.
                <span className="item-manager__confirm-actions">
                  <button type="button" className="danger-button danger-button--sm" onClick={onEmptyTrash}>
                    Delete for good
                  </button>
                  <button
                    type="button"
                    className="ghost-button ghost-button--sm"
                    onClick={() => setConfirmingEmpty(false)}
                  >
                    Cancel
                  </button>
                </span>
              </p>
            ) : !inTrash && confirmingAll ? (
              <p className="banner banner--error" role="alert">
                Move all {itemWord(rows.length)} to the Trash?
                <span className="item-manager__confirm-actions">
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
            ) : (
              <>
                {inTrash && (
                  <p className="field__hint">Deleted items stay here until you remove them for good.</p>
                )}
                <button
                  type="button"
                  className="ghost-button ghost-button--sm item-manager__bulk"
                  onClick={() => (inTrash ? setConfirmingEmpty(true) : setConfirmingAll(true))}
                >
                  {inTrash ? 'Empty trash' : 'Delete all'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
