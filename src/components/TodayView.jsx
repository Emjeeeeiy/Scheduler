import { useSchedule } from '../state/ScheduleContext.jsx'
import { useNow } from '../lib/useNow.js'
import { hourMarks, visibleWindow } from '../lib/layout.js'
import { dayStats, upcomingTasks } from '../lib/stats.js'
import { durationLabel, formatFullDayLabel, minToLabel, minToShortLabel, toHours } from '../lib/date.js'
import { DayColumn } from './DayColumn.jsx'
import { TaskInbox } from './TaskInbox.jsx'
import { TaskRow } from './TaskRow.jsx'

/** Whichever of today's timed tasks contains `nowMin`, or null. */
function taskHappeningNow(tasks, nowMin) {
  return (
    tasks.find(
      (t) =>
        !t.done &&
        Number.isFinite(t.startMin) &&
        nowMin >= t.startMin &&
        nowMin < t.startMin + t.durationMin,
    ) ?? null
  )
}

export function TodayView({ focusKey, onEdit, onCreate }) {
  const { tasksOn } = useSchedule()
  const now = useNow()

  const tasks = tasksOn(focusKey)
  const allDay = tasks.filter((t) => !Number.isFinite(t.startMin))
  const [windowStart, windowEnd] = visibleWindow(tasks)
  const marks = hourMarks(windowStart, windowEnd)
  const stats = dayStats(tasks)

  /* "Right now" only means something on today's own page — a day you've
     navigated to isn't happening, so the callout is Focus's identity for
     today specifically, not a feature of every date this view can show. */
  const isToday = focusKey === now.key
  const current = isToday ? taskHappeningNow(tasks, now.min) : null
  // An all-day item has no place in a time sequence — it isn't "next", it's
  // just true all day — so only a timed block is eligible here.
  const timed = tasks.filter((t) => Number.isFinite(t.startMin))
  const next = isToday && !current ? upcomingTasks(timed, focusKey, now.min, 1)[0] : null
  const focusTask = current ?? next

  return (
    <div className="day-layout">
      <section className="card day-panel" aria-label={formatFullDayLabel(focusKey)}>
        {focusTask && (
          <div className="now-next">
            <span className="now-next__dot" aria-hidden="true" />
            <span className="now-next__label">{current ? 'Happening now' : 'Up next'}</span>
            <button type="button" className="now-next__task" onClick={() => onEdit?.(focusTask)}>
              {focusTask.title}
            </button>
            <span className="now-next__time">
              {current
                ? `until ${minToLabel(current.startMin + current.durationMin)}`
                : minToLabel(next.startMin)}
            </span>
          </div>
        )}

        <div className="section-head">
          <div>
            <h2 className="section-head__title">{formatFullDayLabel(focusKey)}</h2>
            <p className="section-head__sub">
              {stats.count === 0
                ? 'Nothing scheduled yet'
                : `${stats.openCount} open · ${durationLabel(stats.plannedMin)} planned` +
                  (stats.completedMin > 0 ? ` · ${durationLabel(stats.completedMin)} done` : '')}
            </p>
          </div>
          <button
            type="button"
            className="ghost-button ghost-button--sm"
            onClick={() => onCreate?.({ date: focusKey })}
          >
            Add to this day
          </button>
        </div>

        {allDay.length > 0 && (
          <div className="all-day">
            <span className="all-day__label">All day</span>
            <ul className="all-day__list">
              {allDay.map((task) => (
                <TaskRow key={task.id} task={task} onEdit={onEdit} showTime={false} />
              ))}
            </ul>
          </div>
        )}

        <div className="grid-scroll">
          <div className="grid-body grid-body--single">
            <div className="gutter" aria-hidden="true">
              {marks.map((min) => (
                <div
                  key={min}
                  className="gutter__mark"
                  style={{ top: `${((min - windowStart) / (windowEnd - windowStart)) * 100}%` }}
                >
                  {minToShortLabel(min)}
                </div>
              ))}
            </div>

            <div
              className="grid-columns"
              style={{ height: `${((windowEnd - windowStart) / 60) * 52}px` }}
            >
              <DayColumn
                dateKey={focusKey}
                tasks={tasks}
                windowStart={windowStart}
                windowEnd={windowEnd}
                hourMarkList={marks}
                onCreate={onCreate}
                onEdit={onEdit}
                nowMinute={now.key === focusKey ? now.min : null}
              />
            </div>
          </div>
        </div>

        {stats.plannedMin > 0 && (
          <p className="day-panel__foot">
            {toHours(stats.plannedMin)}h planned of a 24h day
            {stats.plannedMin > 10 * 60 && (
              <span className="warn-text"> · that is a heavy day</span>
            )}
          </p>
        )}
      </section>

      <TaskInbox focusKey={focusKey} onEdit={onEdit} onCreate={onCreate} />
    </div>
  )
}
