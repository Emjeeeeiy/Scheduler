import { useState } from 'react'
import { CloseIcon, PlusIcon } from '../icons.jsx'

/** A small checklist living inside a task, entirely local state until the
    form saves — same contract as every other field TaskEditor owns. Ids are
    assigned here, once, at add-time (not derived later), so a checked-off
    item keeps its identity across reorders and re-renders for the life of
    the form. */
export function SubtaskList({ value, onChange }) {
  const [draft, setDraft] = useState('')

  function add(event) {
    event.preventDefault()
    const title = draft.trim()
    if (!title) return
    onChange([...value, { id: `sub-${Date.now()}-${value.length}`, title, done: false }])
    setDraft('')
  }

  function toggle(id) {
    onChange(value.map((s) => (s.id === id ? { ...s, done: !s.done } : s)))
  }

  function remove(id) {
    onChange(value.filter((s) => s.id !== id))
  }

  const doneCount = value.filter((s) => s.done).length

  return (
    <div className="field subtasks">
      <span className="field__label">
        Checklist{value.length > 0 ? ` (${doneCount}/${value.length})` : ''}
      </span>

      {value.length > 0 && (
        <ul className="subtasks__list">
          {value.map((subtask) => (
            <li key={subtask.id} className="subtasks__row">
              <input
                type="checkbox"
                checked={subtask.done}
                onChange={() => toggle(subtask.id)}
                aria-label={`Mark "${subtask.title}" ${subtask.done ? 'not done' : 'done'}`}
              />
              <span className={`subtasks__title${subtask.done ? ' subtasks__title--done' : ''}`}>
                {subtask.title}
              </span>
              <button
                type="button"
                className="icon-button icon-button--sm"
                onClick={() => remove(subtask.id)}
                aria-label={`Remove "${subtask.title}"`}
              >
                <CloseIcon width="12" height="12" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="subtasks__add" onSubmit={add}>
        <input
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a checklist item…"
          aria-label="New checklist item"
          maxLength={200}
        />
        <button type="submit" className="ghost-button ghost-button--sm">
          <PlusIcon className="button-icon" />
          Add
        </button>
      </form>
    </div>
  )
}
