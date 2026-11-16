import { durationLabel, minToLabel } from '@cadence/shared/date.js'
import { TagGlyph } from '../editors/TagGlyph.jsx'

/** One day's events then tasks, each already chronological (tasksOn/eventsOn
    order them) — the same ordering DayPeek uses for its own single-day summary,
    so a day looks identical whether it is opened from the month grid, from the
    palette's agenda, or from that day's Journal note.

    A task's checkbox is the real one: ticking it here completes the task in the
    schedule (one day of a repeating task, if that is what it is), exactly as
    ticking it in the Day view does. `onClose` runs before an item opens, for
    hosts that are themselves a dialog and must get out of the way. */
export function DayAgendaList({ tasks, events, getTag, onEdit, onEditEvent, onClose, toggleDone }) {
  if (tasks.length === 0 && events.length === 0) {
    return <p className="empty empty--sm">Nothing scheduled.</p>
  }
  return (
    <ul className="day-peek__list">
      {events.map((event) => {
        const tag = getTag(event.tagId)
        return (
          <li key={`event-${event.id}`}>
            <button
              type="button"
              className="day-peek__item day-peek__item--event"
              style={{ '--tag': tag?.color ?? 'var(--color-baseline)' }}
              onClick={() => {
                onClose?.()
                onEditEvent?.(event)
              }}
            >
              <span className="day-peek__when">
                {Number.isFinite(event.startMin) ? minToLabel(event.startMin) : 'All day'}
              </span>
              {tag?.icon && <TagGlyph tag={tag} variant="chip" className="day-peek__icon" />}
              <span className="day-peek__label">{event.title}</span>
            </button>
          </li>
        )
      })}
      {tasks.map((task) => {
        const tag = getTag(task.tagId)
        return (
          <li key={`task-${task.id}`} className="day-peek__row">
            {/* A sibling of the row button, not a child of it — same reason
                every checkbox in this app sits beside its row rather than
                inside it (see TaskRow): checking it off is a different
                gesture from opening the editor, and it must not also fire
                that click. */}
            <input
              type="checkbox"
              className="task-row__check"
              checked={task.done}
              onChange={() => toggleDone(task.id)}
              aria-label={`Mark "${task.title}" ${task.done ? 'not done' : 'done'}`}
            />
            <button
              type="button"
              className={`day-peek__item${task.done ? ' day-peek__item--done' : ''}`}
              style={{ '--tag': tag?.color ?? 'var(--color-baseline)' }}
              onClick={() => {
                onClose?.()
                onEdit?.(task)
              }}
            >
              <span className="day-peek__when">
                {Number.isFinite(task.startMin) ? minToLabel(task.startMin) : 'All day'}
              </span>
              {tag?.icon && <TagGlyph tag={tag} variant="chip" className="day-peek__icon" />}
              <span className="day-peek__label">{task.title}</span>
              {Number.isFinite(task.startMin) && (
                <span className="day-peek__note">{durationLabel(task.durationMin)}</span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
