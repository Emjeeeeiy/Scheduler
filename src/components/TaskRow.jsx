import { useSchedule } from '../state/ScheduleContext.jsx'
import { durationLabel, minToLabel, relativeDayLabel } from '../lib/date.js'
import { recurrenceLabel } from '../lib/recurrence.js'
import { RepeatIcon } from './icons.jsx'

/** One task as a line item — used by the inbox, the day agenda, the dashboard,
    and the overdue list, so the checkbox and tag chip look the same everywhere. */
export function TaskRow({ task, onEdit, showDate = false, showTime = true }) {
  const { toggleDone, getTag } = useSchedule()
  const tag = getTag(task.tagId)

  return (
    <li className={`task-row${task.done ? ' task-row--done' : ''}`}>
      <input
        type="checkbox"
        className="task-row__check"
        checked={task.done}
        onChange={() => toggleDone(task.id)}
        aria-label={`Mark "${task.title}" ${task.done ? 'not done' : 'done'}`}
      />

      <button type="button" className="task-row__body" onClick={() => onEdit?.(task)}>
        <span className="task-row__title">{task.title}</span>
        <span className="task-row__meta">
          {showDate && task.date && (
            <span className="task-row__when">{relativeDayLabel(task.date)}</span>
          )}
          {showTime && Number.isFinite(task.startMin) && (
            <span className="task-row__when">
              {minToLabel(task.startMin)} · {durationLabel(task.durationMin)}
            </span>
          )}
          {showTime && task.date && !Number.isFinite(task.startMin) && (
            <span className="task-row__when">All day</span>
          )}
          {task.recurrence && (
            <span className="repeat-mark" title={recurrenceLabel(task.recurrence)}>
              <RepeatIcon />
              <span className="visually-hidden">{recurrenceLabel(task.recurrence)}</span>
            </span>
          )}
          {tag && (
            <span className="tag-chip" style={{ '--tag': tag.color }}>
              <span className="tag-chip__dot" aria-hidden="true" />
              {tag.name}
            </span>
          )}
        </span>
      </button>
    </li>
  )
}
