import { useSchedule } from '../state/ScheduleContext.jsx'
import { useNow } from '../lib/useNow.js'
import { hourMarks, visibleWindow } from '../lib/layout.js'
import { dayStats } from '../lib/stats.js'
import {
  dayOfMonth,
  durationLabel,
  formatWeekLabel,
  minToShortLabel,
  weekKeys,
  WEEKDAY_HEADERS,
} from '../lib/date.js'
import { DayColumn } from './DayColumn.jsx'

const HOUR_HEIGHT = 52

export function WeekGrid({ focusKey, onEdit, onCreate }) {
  const { tasksOn } = useSchedule()
  const now = useNow()

  const keys = weekKeys(focusKey)
  const byDay = keys.map((key) => tasksOn(key))

  /* One window across all seven days so the rows line up; widened to fit the
     earliest and latest thing scheduled anywhere in the week. */
  const [windowStart, windowEnd] = visibleWindow(byDay.flat())
  const marks = hourMarks(windowStart, windowEnd)
  const bodyHeight = ((windowEnd - windowStart) / 60) * HOUR_HEIGHT

  const allDayByDay = byDay.map((tasks) => tasks.filter((t) => !Number.isFinite(t.startMin)))
  const hasAllDay = allDayByDay.some((list) => list.length > 0)

  return (
    <section className="card week" aria-label={`Week of ${formatWeekLabel(focusKey)}`}>
      <div className="grid-scroll">
        <div className="week__inner">
          <div className="week__head">
            <div className="gutter-spacer" aria-hidden="true" />
            {keys.map((key, index) => {
              const stats = dayStats(byDay[index])
              const isToday = key === now.key
              return (
                <div key={key} className={`week__day${isToday ? ' week__day--today' : ''}`}>
                  <span className="week__dow">{WEEKDAY_HEADERS[index]}</span>
                  <span className="week__date">{dayOfMonth(key)}</span>
                  <span className="week__load">
                    {stats.plannedMin > 0 ? durationLabel(stats.plannedMin) : '—'}
                  </span>
                </div>
              )
            })}
          </div>

          {hasAllDay && (
            <div className="week__allday">
              <span className="gutter-spacer all-day__label" aria-hidden="true">
                All day
              </span>
              {allDayByDay.map((list, index) => (
                <div key={keys[index]} className="week__allday-cell">
                  {list.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      className={`chip${task.done ? ' chip--done' : ''}`}
                      onClick={() => onEdit?.(task)}
                      title={task.title}
                    >
                      {task.title}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="grid-body">
            <div className="gutter" style={{ height: `${bodyHeight}px` }} aria-hidden="true">
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

            <div className="grid-columns" style={{ height: `${bodyHeight}px` }}>
              {keys.map((key, index) => (
                <DayColumn
                  key={key}
                  dateKey={key}
                  tasks={byDay[index]}
                  windowStart={windowStart}
                  windowEnd={windowEnd}
                  hourMarkList={marks}
                  onCreate={onCreate}
                  onEdit={onEdit}
                  nowMinute={key === now.key ? now.min : null}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="week__hint">
        Click an empty slot to add a task there · drag a block to move it
      </p>
    </section>
  )
}
