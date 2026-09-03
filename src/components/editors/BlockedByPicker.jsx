import { useState } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { isSeriesTemplate } from '../../lib/stats.js'
import { CloseIcon } from '../icons.jsx'

const MAX_SUGGESTIONS = 8

/**
 * "Blocked by" is a soft reminder, not a scheduling constraint — nothing in
 * ScheduleContext enforces it, and neither does this picker. It exists so a
 * dependency between two tasks is at least *visible* (a warning badge on the
 * row, a note in the detail view) instead of living only in the user's head.
 *
 * Search rather than a plain <select multiple>: a personal backlog can run
 * to hundreds of tasks, and a multi-select of that size is unusable. Only
 * open, non-series tasks are offered — a done task has nothing left to wait
 * on, and a repeating task's own rule document isn't a real thing to block
 * on (a specific occurrence would be, but that precision isn't worth the
 * complexity here).
 */
export function BlockedByPicker({ taskId, value, onChange }) {
  const { tasks } = useSchedule()
  const [query, setQuery] = useState('')

  const needle = query.trim().toLowerCase()
  const candidates = needle
    ? tasks
        .filter(
          (t) =>
            t.id !== taskId &&
            !value.includes(t.id) &&
            !t.done &&
            !isSeriesTemplate(t) &&
            t.title.toLowerCase().includes(needle),
        )
        .slice(0, MAX_SUGGESTIONS)
    : []

  const selected = value.map((id) => tasks.find((t) => t.id === id)).filter(Boolean)

  function add(id) {
    onChange([...value, id])
    setQuery('')
  }

  function remove(id) {
    onChange(value.filter((v) => v !== id))
  }

  return (
    <div className="field blocked-by">
      <span className="field__label">Blocked by</span>

      {selected.length > 0 && (
        <ul className="blocked-by__chips">
          {selected.map((task) => (
            <li key={task.id} className="blocked-by__chip">
              <span className="blocked-by__chip-title">{task.title}</span>
              <button
                type="button"
                onClick={() => remove(task.id)}
                aria-label={`No longer blocked by "${task.title}"`}
              >
                <CloseIcon width="10" height="10" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        className="input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a task to add…"
        aria-label="Search a task to block on"
      />

      {candidates.length > 0 && (
        <ul className="blocked-by__suggestions">
          {candidates.map((task) => (
            <li key={task.id}>
              <button type="button" onClick={() => add(task.id)}>
                {task.title}
              </button>
            </li>
          ))}
        </ul>
      )}

      <span className="field__hint">
        A reminder only — it won't stop you from scheduling or finishing this task.
      </span>
    </div>
  )
}
