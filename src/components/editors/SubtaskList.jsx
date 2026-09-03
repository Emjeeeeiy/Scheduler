import { useState } from 'react'
import { CloseIcon, PlusIcon } from '../icons.jsx'

/** A small checklist living inside a task, entirely local state until the
    form saves — same contract as every other field TaskEditor owns. Ids are
    assigned here, once, at add-time (not derived later), so a checked-off
    item keeps its identity across reorders and re-renders for the life of
    the form. */
export function SubtaskList({ value, onChange }) {
  const [draft, setDraft] = useState('')

  // Not a <form>: this list already lives inside TaskEditor's own <form>,
  // and HTML doesn't allow a form nested inside another one — the browser
  // silently drops the inner <form> tag and hands its submit button to the
  // *outer* form instead, so clicking "Add" here was actually submitting
  // (and closing) the whole task editor. A plain click handler plus an
  // explicit Enter-key handler on the input gets the same "press Enter or
  // click Add" behaviour without ever being a form.
  function add() {
    const title = draft.trim()
    if (!title) return
    onChange([...value, { id: `sub-${Date.now()}-${value.length}`, title, done: false }])
    setDraft('')
  }

  function onInputKeyDown(event) {
    if (event.key !== 'Enter') return
    // Otherwise Enter bubbles up to TaskEditor's own form and submits that
    // instead — the very bug this component exists to not have anymore.
    event.preventDefault()
    add()
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

      <div className="subtasks__add">
        <input
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Add a checklist item…"
          aria-label="New checklist item"
          maxLength={200}
        />
        <button type="button" className="ghost-button ghost-button--sm" onClick={add}>
          <PlusIcon className="button-icon" />
          Add
        </button>
      </div>
    </div>
  )
}
