import { useState } from 'react'
import { useSchedule } from '../state/ScheduleContext.jsx'
import { DRAG_TYPE } from './DayColumn.jsx'
import { todayKey } from '../lib/date.js'

/**
 * The inbox holds everything not yet given a slot. It is both a drag source
 * (drag an item onto the grid to schedule it) and a drop target (drag a block
 * back here to unschedule it), so planning is reversible in one gesture.
 */
export function TaskInbox({ focusKey, onEdit, onCreate }) {
  const { inbox, addTask, toggleDone, unscheduleTask, scheduleTask, getTag } = useSchedule()
  const [title, setTitle] = useState('')
  const [showDone, setShowDone] = useState(false)
  const [dropActive, setDropActive] = useState(false)

  const open = inbox.filter((t) => !t.done)
  const done = inbox.filter((t) => t.done)
  const visible = showDone ? [...open, ...done] : open

  async function onQuickAdd(event) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    setTitle('')
    try {
      await addTask({ title: trimmed })
    } catch (caught) {
      console.error('Could not add task.', caught)
      setTitle(trimmed)
    }
  }

  async function onDrop(event) {
    if (!event.dataTransfer.types.includes(DRAG_TYPE)) return
    event.preventDefault()
    setDropActive(false)
    try {
      const { id } = JSON.parse(event.dataTransfer.getData(DRAG_TYPE))
      if (id) await unscheduleTask(id)
    } catch (caught) {
      console.error('Could not return task to the inbox.', caught)
    }
  }

  return (
    <section
      className={`inbox card${dropActive ? ' inbox--drop' : ''}`}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return
        event.preventDefault()
        setDropActive(true)
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={onDrop}
      aria-label="Inbox"
    >
      <div className="section-head">
        <h2 className="section-head__title">
          Inbox <span className="count-pill">{open.length}</span>
        </h2>
        {done.length > 0 && (
          <button type="button" className="ghost-button ghost-button--sm" onClick={() => setShowDone((v) => !v)}>
            {showDone ? 'Hide done' : `Show done (${done.length})`}
          </button>
        )}
      </div>

      <form className="quick-add" onSubmit={onQuickAdd}>
        <input
          className="input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Capture a task…"
          maxLength={200}
          aria-label="New inbox task"
        />
        <button type="submit" className="primary-button">
          Add
        </button>
      </form>

      {visible.length === 0 ? (
        <p className="empty empty--sm">
          Nothing waiting. Anything you capture without a date lands here.
        </p>
      ) : (
        <ul className="inbox__list">
          {visible.map((task) => {
            const tag = getTag(task.tagId)
            return (
              <li
                key={task.id}
                className={`inbox-item${task.done ? ' inbox-item--done' : ''}`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ id: task.id, grabOffsetMin: 0 }))
                }}
              >
                <input
                  type="checkbox"
                  className="task-row__check"
                  checked={task.done}
                  onChange={() => toggleDone(task.id)}
                  aria-label={`Mark "${task.title}" ${task.done ? 'not done' : 'done'}`}
                />
                <button type="button" className="inbox-item__body" onClick={() => onEdit?.(task)}>
                  <span className="inbox-item__title">{task.title}</span>
                  {tag && (
                    <span className="tag-chip" style={{ '--tag': tag.color }}>
                      <span className="tag-chip__dot" aria-hidden="true" />
                      {tag.name}
                    </span>
                  )}
                </button>
                {/* Dragging is the fast path, but it must not be the only path:
                    a keyboard user needs a way to schedule too. */}
                <button
                  type="button"
                  className="ghost-button ghost-button--sm"
                  onClick={() => scheduleTask(task.id, { date: focusKey ?? todayKey(), startMin: null })}
                  title="Schedule for the day in view"
                >
                  Plan
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <p className="inbox__hint">Drag onto the grid to give it a time — or drag a block back here.</p>

      <button type="button" className="ghost-button ghost-button--block" onClick={() => onCreate?.({})}>
        Add with details…
      </button>
    </section>
  )
}
