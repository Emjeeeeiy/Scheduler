import { useRef, useState } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { useModalA11y } from '../../lib/useModalA11y.js'
import { CloseIcon, TrashIcon } from '../icons.jsx'
import { TagGlyph } from '../editors/TagGlyph.jsx'

/**
 * A simple, persistent checklist — add something, check it off, it stays
 * checked until you delete it. No date, no time, no recurrence: this is the
 * same undated pool ScheduleContext already calls the inbox (see `inbox`),
 * read here as a plain to-do list instead of the Day view's scheduling
 * sidebar. Both surfaces show the same items; they just answer different
 * questions. The Day view's Inbox asks "what still needs a slot on a real
 * day" — drag it onto the grid, or hit Plan. This modal asks "what's on my
 * list" for the things that were never going anywhere near the calendar in
 * the first place: Drink water, Call Mom — reachable from anywhere via the
 * sidebar, not tucked behind a trip to the Day view.
 *
 * Deliberately not draggable and not scheduling-aware — no drop zone, no
 * "Plan" action — the whole point of pulling this out of the Day view was to
 * drop that chrome, not carry it over. Clicking an item closes this modal and
 * opens the same task editor every other list in the app uses (two stacked
 * dialogs is the one thing every modal in this app avoids — see
 * useModalA11y's single focus trap), so tags/notes/etc. stay one click away
 * for anyone who wants them without this modal forcing the choice up front.
 */
export function TodoModal({ onClose, onEdit, onCreate }) {
  const { inbox, addTask, toggleDone, removeTask, restoreItem, getTag } = useSchedule()
  const { pushError, pushUndo } = useToast()
  const [title, setTitle] = useState('')
  // Unlike the Day view's Inbox (which hides done by default — it's a queue
  // of what's left to plan), a to-do list's whole point is a persistent
  // record: a checked-off "Drink water" stays visible, struck through, until
  // it's cleared — the classic to-do-app shape, not a queue that empties out.
  const [showDone, setShowDone] = useState(true)
  const panelRef = useRef(null)
  useModalA11y(panelRef, { onClose })

  const open = inbox.filter((t) => !t.done)
  const done = inbox.filter((t) => t.done)
  const visible = showDone ? [...open, ...done] : open

  async function onAdd(event) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    setTitle('')
    try {
      await addTask({ title: trimmed })
    } catch (caught) {
      console.error('Could not add to-do.', caught)
      pushError('Could not add that. Try again.')
      setTitle(trimmed)
    }
  }

  async function onDelete(task) {
    try {
      await removeTask(task.id)
      pushUndo(`Deleted "${task.title}".`, () => restoreItem('task', task.id))
    } catch (caught) {
      console.error('Could not delete to-do.', caught)
      pushError(`Could not delete "${task.title}". Try again.`)
    }
  }

  return (
    <div className="modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} className="modal__panel" role="dialog" aria-modal="true" aria-label="To-do">
        <div className="modal__head">
          <h2 className="modal__title">
            To-do <span className="count-pill">{open.length}</span>
          </h2>
          <div className="modal__head-actions">
            {done.length > 0 && (
              <button
                type="button"
                className="ghost-button ghost-button--sm"
                onClick={() => setShowDone((v) => !v)}
              >
                {showDone ? 'Hide done' : `Show done (${done.length})`}
              </button>
            )}
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
        </div>

        <form className="quick-add" onSubmit={onAdd}>
          <input
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Drink water, call Mom…"
            maxLength={200}
            aria-label="New to-do"
          />
          <button type="submit" className="primary-button">
            Add
          </button>
        </form>

        {visible.length === 0 ? (
          <p className="empty">Nothing on your list. Add something above.</p>
        ) : (
          <ul className="inbox__list todo__list">
            {visible.map((task) => {
              const tag = getTag(task.tagId)
              return (
                <li key={task.id} className={`inbox-item${task.done ? ' inbox-item--done' : ''}`}>
                  <input
                    type="checkbox"
                    className="task-row__check"
                    checked={task.done}
                    onChange={() => toggleDone(task.id)}
                    aria-label={`Mark "${task.title}" ${task.done ? 'not done' : 'done'}`}
                  />
                  <button
                    type="button"
                    className="inbox-item__body"
                    onClick={() => {
                      onClose()
                      onEdit?.(task)
                    }}
                  >
                    <span className="inbox-item__title">{task.title}</span>
                    {tag && (
                      <span className="tag-chip">
                        <TagGlyph tag={tag} variant="chip" className="tag-chip__dot" />
                        {tag.name}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => onDelete(task)}
                    aria-label={`Delete "${task.title}"`}
                    title="Delete"
                  >
                    <TrashIcon />
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <button
          type="button"
          className="ghost-button ghost-button--block"
          onClick={() => {
            onClose()
            onCreate?.({})
          }}
        >
          Add with details…
        </button>
      </div>
    </div>
  )
}
