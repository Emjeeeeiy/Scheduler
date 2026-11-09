import { useState } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
/* Only DRAG_TASK is ever named here, and that is the whole guard: an event
   dragged over the inbox matches nothing, shows no drop affordance, and can
   never reach unscheduleTask — which would write to a task document that does
   not exist. Events have no inbox, because an undated thing that runs for
   three days is a task, not an event. */
import { DRAG_TASK, readDrag } from '../../lib/dnd.js'
import { useCoarsePointer } from '../../lib/useCoarsePointer.js'
import { todayKey } from '@cadence/shared/date.js'
import { TagGlyph } from '../editors/TagGlyph.jsx'

/**
 * The inbox holds everything not yet given a slot. It is both a drag source
 * (drag an item onto the grid to schedule it) and a drop target (drag a block
 * back here to unschedule it), so planning is reversible in one gesture.
 *
 * On a touch screen a row is not draggable — a long press would pick it up while
 * someone was only reading the list — and each row's "Plan" button is the way to
 * give it a day instead. `onPlanDay` is the Day view's "Plan my day", which lives
 * here because it is the inbox it plans.
 */
export function TaskInbox({ focusKey, onEdit, onCreate, onPlanDay, planOpen = false }) {
  const { inbox, addTask, toggleDone, unscheduleTask, scheduleTask, getTag } = useSchedule()
  const { pushError } = useToast()
  const coarse = useCoarsePointer()
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
      pushError('Could not add the task. Try again.')
      setTitle(trimmed)
    }
  }

  async function onDrop(event) {
    if (!event.dataTransfer.types.includes(DRAG_TASK)) return
    event.preventDefault()
    setDropActive(false)
    const payload = readDrag(event, DRAG_TASK)
    if (!payload?.id) return
    try {
      await unscheduleTask(payload.id)
    } catch (caught) {
      console.error('Could not return task to the inbox.', caught)
      pushError('Could not move the task back to the inbox. Try again.')
    }
  }

  return (
    <section
      className={`inbox${dropActive ? ' inbox--drop' : ''}`}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(DRAG_TASK)) return
        event.preventDefault()
        setDropActive(true)
      }}
      /* Only clear on a boundary the pointer actually left, not on every
         crossing into a child — otherwise the highlight flickers as the
         cursor passes over each row on its way in. */
      onDragLeave={(event) =>
        !event.currentTarget.contains(event.relatedTarget) && setDropActive(false)
      }
      onDrop={onDrop}
      aria-label="Inbox"
    >
      <div className="section-head">
        <h2 className="section-head__title">
          Inbox <span className="count-pill">{open.length}</span>
        </h2>
        {onPlanDay && open.length > 0 && (
          <button
            type="button"
            className="ghost-button ghost-button--sm"
            onClick={onPlanDay}
            aria-expanded={planOpen}
          >
            Plan my day
          </button>
        )}
      </div>

      {/* Capture is Enter in the field; the button is only its label. The page's
          one loud button is "New task" in the sidebar, so this one is quiet. */}
      <form className="quick-add" onSubmit={onQuickAdd}>
        <input
          className="input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Capture a task…"
          maxLength={200}
          aria-label="New inbox task"
        />
        <button type="submit" className="ghost-button">
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
                draggable={!coarse}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData(DRAG_TASK, JSON.stringify({ id: task.id, grabOffsetMin: 0 }))
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
                    <span className="tag-chip">
                      <TagGlyph tag={tag} variant="chip" className="tag-chip__dot" />
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

      <div className="inbox__foot">
        <button type="button" className="ghost-button ghost-button--sm" onClick={() => onCreate?.({})}>
          Add with details…
        </button>
        {done.length > 0 && (
          <button type="button" className="inbox__done-toggle" onClick={() => setShowDone((v) => !v)}>
            {showDone ? 'Hide done' : `Show done (${done.length})`}
          </button>
        )}
      </div>
    </section>
  )
}
