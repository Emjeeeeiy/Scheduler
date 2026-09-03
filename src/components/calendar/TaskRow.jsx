import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { addDays, durationLabel, minToLabel, relativeDayLabel, todayKey } from '../../lib/date.js'
import { recurrenceLabel } from '../../lib/recurrence.js'
import { isSeriesTemplate } from '../../lib/stats.js'
import { PinIcon, RepeatIcon } from '../icons.jsx'
import { TagGlyph } from '../editors/TagGlyph.jsx'

/** One task as a line item — used by the inbox, the day agenda, the dashboard,
    and the overdue list, so the checkbox and tag chip look the same everywhere.
    `showQuickActions` adds "Tomorrow"/"Next week" reschedule buttons — opt-in,
    since the overdue list is where a fast way out of the pile actually matters;
    every other list this row appears in stays exactly as compact as before. */
export function TaskRow({ task, onEdit, showDate = false, showTime = true, showQuickActions = false }) {
  const { toggleDone, scheduleTask, getTag } = useSchedule()
  const { pushError } = useToast()
  const tag = getTag(task.tagId)

  async function snooze(days) {
    try {
      await scheduleTask(task.id, { date: addDays(todayKey(), days), startMin: task.startMin })
    } catch (caught) {
      console.error('Could not reschedule the task.', caught)
      pushError('Could not reschedule the task. Try again.')
    }
  }

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
        <span className="task-row__title-row">
          {task.priority === 'high' && (
            <span className="task-row__priority" title="High priority" aria-label="High priority" />
          )}
          <span className="task-row__title">{task.title}</span>
          {task.pinned && (
            <PinIcon className="task-row__pin" width="12" height="12" aria-label="Pinned" />
          )}
        </span>
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
            <span className="tag-chip">
              <TagGlyph tag={tag} variant="chip" className="tag-chip__dot" />
              {tag.name}
            </span>
          )}
        </span>
      </button>

      {showQuickActions && !isSeriesTemplate(task) && (
        <span className="task-row__quick-actions">
          <button type="button" className="ghost-button ghost-button--sm" onClick={() => snooze(1)}>
            Tomorrow
          </button>
          <button type="button" className="ghost-button ghost-button--sm" onClick={() => snooze(7)}>
            Next week
          </button>
        </span>
      )}
    </li>
  )
}
