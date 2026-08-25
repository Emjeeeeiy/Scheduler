import { useState } from 'react'
import { useSchedule } from '../state/ScheduleContext.jsx'
import { useNow } from '../lib/useNow.js'
import { DRAG_TYPE } from './DayColumn.jsx'
import {
  dayOfMonth,
  durationLabel,
  formatMonthLabel,
  minToLabel,
  monthOf,
  monthGrid,
  WEEKDAY_HEADERS,
} from '../lib/date.js'
import { dayStats } from '../lib/stats.js'
import { recurrenceLabel } from '../lib/recurrence.js'
import { PlusIcon } from './icons.jsx'

const MAX_CHIPS = 3

/* Same threshold WeekGrid uses, so a day reads as "heavy" identically in both
   views rather than the month having its own opinion about what counts. */
const HEAVY_DAY_MIN = 10 * 60

export function MonthCalendar({ focusKey, onFocusDay, onCreate }) {
  const { tasksOn, getTag, updateTask } = useSchedule()
  const now = useNow()
  const [dropKey, setDropKey] = useState(null)

  const keys = monthGrid(focusKey)
  const month = monthOf(focusKey)

  async function onDrop(event, key) {
    if (!event.dataTransfer.types.includes(DRAG_TYPE)) return
    event.preventDefault()
    setDropKey(null)
    try {
      const { id } = JSON.parse(event.dataTransfer.getData(DRAG_TYPE))
      // Only the day changes here — whatever time the block already had is
      // still what the user meant, so it rides along.
      if (id) await updateTask(id, { date: key })
    } catch (caught) {
      console.error('Could not move task.', caught)
    }
  }

  return (
    <section className="card month" aria-label={formatMonthLabel(focusKey)}>
      <div className="month__head" aria-hidden="true">
        {WEEKDAY_HEADERS.map((label) => (
          <span key={label} className="month__dow">
            {label}
          </span>
        ))}
      </div>

      <div className="month__grid">
        {keys.map((key) => {
          const tasks = tasksOn(key)
          const stats = dayStats(tasks)
          const outside = monthOf(key) !== month
          const isToday = key === now.key
          const shown = tasks.slice(0, MAX_CHIPS)
          const overflow = tasks.length - shown.length
          const isHeavy = stats.plannedMin > HEAVY_DAY_MIN
          const loadPct = Math.min(100, (stats.plannedMin / HEAVY_DAY_MIN) * 100)

          return (
            <div
              key={key}
              className={[
                'month__cell',
                outside ? 'month__cell--outside' : '',
                isToday ? 'month__cell--today' : '',
                dropKey === key ? 'month__cell--drop' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes(DRAG_TYPE)) return
                event.preventDefault()
                setDropKey(key)
              }}
              onDragLeave={() => setDropKey((current) => (current === key ? null : current))}
              onDrop={(event) => onDrop(event, key)}
            >
              {stats.plannedMin > 0 && (
                <span className="month__load-strip" aria-hidden="true">
                  <span
                    className={`month__load-strip-fill${isHeavy ? ' month__load-strip-fill--heavy' : ''}`}
                    style={{ width: `${loadPct}%` }}
                  />
                </span>
              )}

              <div className="month__cell-head">
                <button
                  type="button"
                  className="month__daynum"
                  onClick={() => onFocusDay(key)}
                  aria-label={`Open ${key}`}
                >
                  {dayOfMonth(key)}
                </button>
                {stats.plannedMin > 0 && (
                  <span className="month__load">{durationLabel(stats.plannedMin)}</span>
                )}
              </div>

              <ul className="month__chips">
                {shown.map((task) => {
                  const tag = getTag(task.tagId)
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move'
                          event.dataTransfer.setData(
                            DRAG_TYPE,
                            JSON.stringify({ id: task.id, grabOffsetMin: 0 }),
                          )
                        }}
                        className={`chip chip--dot${task.done ? ' chip--done' : ''}`}
                        style={{ '--tag': tag?.color ?? 'var(--series-1)' }}
                        onClick={() => onFocusDay(key)}
                        /* A month cell is too narrow for a repeat marker beside
                           the dot, time, and title, so the rule rides in the
                           tooltip and the day and week views carry the glyph. */
                        title={[
                          Number.isFinite(task.startMin) ? minToLabel(task.startMin) : null,
                          task.title,
                          task.recurrence && recurrenceLabel(task.recurrence),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      >
                        <span className="chip__dot" aria-hidden="true" />
                        {Number.isFinite(task.startMin) && (
                          <span className="chip__time">{minToLabel(task.startMin)}</span>
                        )}
                        <span className="chip__title">{task.title}</span>
                      </button>
                    </li>
                  )
                })}
                {overflow > 0 && (
                  <li>
                    <button type="button" className="month__more" onClick={() => onFocusDay(key)}>
                      +{overflow} more
                    </button>
                  </li>
                )}
              </ul>

              <button
                type="button"
                className="month__add"
                onClick={() => onCreate?.({ date: key })}
                aria-label={`Add a task on ${key}`}
              >
                <PlusIcon />
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
