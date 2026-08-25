import { useState } from 'react'
import { useSchedule } from '../state/ScheduleContext.jsx'
import { useNow } from '../lib/useNow.js'
import { hourMarks, visibleWindow } from '../lib/layout.js'
import { dayStats } from '../lib/stats.js'
import { packSpans } from '../lib/spans.js'
import { DRAG_EVENT, DRAG_TASK, hasDrag, readDrag } from '../lib/dnd.js'
import {
  dayOfMonth,
  daysBetween,
  durationLabel,
  formatWeekLabel,
  minToShortLabel,
  weekKeys,
  WEEKDAY_HEADERS,
} from '../lib/date.js'
import { DayColumn } from './DayColumn.jsx'
import { ChevronLeftIcon, ChevronRightIcon } from './icons.jsx'

const HOUR_HEIGHT = 52

/* The line a day tips from "full" to "heavy" — the same number TodayView
   already warns on ("that is a heavy day"), reused here rather than a second
   threshold, so a day reads the same way regardless of which view shows it. */
const HEAVY_DAY_MIN = 10 * 60

/* The all-day strip is wider than a month cell, so it can afford more lanes
   before folding anything away. */
const ALLDAY_BUDGET = 4

export function WeekGrid({ focusKey, onEdit, onCreate, onEditEvent, onCreateEvent, onFocusDay }) {
  const { tasksOn, eventsInRange, eventsOn, getTag, scheduleTask, moveEvent } = useSchedule()
  const now = useNow()
  const [dropKey, setDropKey] = useState(null)

  const keys = weekKeys(focusKey)
  const byDay = keys.map((key) => tasksOn(key))
  const eventsByDay = keys.map((key) => eventsOn(key))
  const dayTotals = byDay.map(dayStats)

  const weekPlannedMin = dayTotals.reduce((sum, stats) => sum + stats.plannedMin, 0)
  const heavyDays = dayTotals.filter((stats) => stats.plannedMin > HEAVY_DAY_MIN).length

  /* One window across all seven days so the rows line up; widened to fit the
     earliest and latest thing scheduled anywhere in the week — events included,
     or a 6am meeting would be cropped out of the only view that would show it. */
  const gridEvents = eventsByDay
    .flat()
    .filter((e) => Number.isFinite(e.startMin) && e.startDate === e.endDate)
  const [windowStart, windowEnd] = visibleWindow([...byDay.flat(), ...gridEvents])
  const marks = hourMarks(windowStart, windowEnd)
  const bodyHeight = ((windowEnd - windowStart) / 60) * HOUR_HEIGHT

  const allDayByDay = byDay.map((tasks) => tasks.filter((t) => !Number.isFinite(t.startMin)))

  /* Everything that is not a single-day timed event draws as a bar up here
     rather than in the grid: an all-day thing has no place on a clock, and a
     multi-day one would have to be sliced at midnight to fit in a column. */
  const rowEvents = eventsInRange(keys[0], keys[6]).filter(
    (e) => !Number.isFinite(e.startMin) || e.startDate !== e.endDate,
  )
  const spans = packSpans(keys, rowEvents, { contentBudget: ALLDAY_BUDGET })

  async function onDropOnAllDay(event, key) {
    if (hasDrag(event, DRAG_EVENT)) {
      event.preventDefault()
      setDropKey(null)
      const payload = readDrag(event, DRAG_EVENT)
      if (!payload?.id) return
      try {
        await moveEvent(payload.id, key, payload.grabOffsetDays ?? 0)
      } catch (caught) {
        console.error('Could not move event.', caught)
      }
      return
    }
    if (!hasDrag(event, DRAG_TASK)) return
    event.preventDefault()
    setDropKey(null)
    const payload = readDrag(event, DRAG_TASK)
    if (!payload?.id) return
    try {
      /* Dropping a timed block up here strips its time — the gesture for "this
         is happening that day, but not at a particular hour", which previously
         had no home outside the editor. */
      await scheduleTask(payload.id, { date: key, startMin: null })
    } catch (caught) {
      console.error('Could not make the task all-day.', caught)
    }
  }

  return (
    <section className="card week" aria-label={`Week of ${formatWeekLabel(focusKey)}`}>
      <p className="week__summary">
        {weekPlannedMin > 0 ? (
          <>
            <strong>{durationLabel(weekPlannedMin)}</strong> planned this week
          </>
        ) : (
          'Nothing planned this week yet'
        )}
        {heavyDays > 0 && (
          <span className="week__summary-heavy">
            {' '}
            · {heavyDays} heavy day{heavyDays === 1 ? '' : 's'}
          </span>
        )}
      </p>

      <div className="grid-scroll">
        <div className="week__inner">
          <div className="week__head">
            <div className="gutter-spacer" aria-hidden="true" />
            {keys.map((key, index) => {
              const stats = dayTotals[index]
              const isToday = key === now.key
              const isHeavy = stats.plannedMin > HEAVY_DAY_MIN
              const loadPct = Math.min(100, (stats.plannedMin / HEAVY_DAY_MIN) * 100)
              const eventCount = eventsByDay[index].length
              return (
                <button
                  key={key}
                  type="button"
                  className={`week__day${isToday ? ' week__day--today' : ''}`}
                  onClick={() => onFocusDay?.(key)}
                  title={`Open ${key}`}
                >
                  <span className="week__dow">{WEEKDAY_HEADERS[index]}</span>
                  <span className="week__date">{dayOfMonth(key)}</span>
                  <span className="week__load">
                    {stats.plannedMin > 0 ? durationLabel(stats.plannedMin) : '—'}
                    {/* A count, not a second bar: events are not planned work,
                        and giving them their own capacity meter would invent a
                        second answer to "how full is this day". */}
                    {eventCount > 0 && (
                      <span className="week__events"> · {eventCount}e</span>
                    )}
                  </span>
                  {stats.plannedMin > 0 && (
                    <span className="week__load-track" aria-hidden="true">
                      <span
                        className={`week__load-fill${isHeavy ? ' week__load-fill--heavy' : ''}`}
                        style={{ width: `${loadPct}%` }}
                      />
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Always rendered, not gated on having content: it is a drop target,
              and a target that disappears when the last item leaves it cannot
              be dropped back onto. */}
          <div className="week__allday" style={{ '--lanes': spans.lanesUsed }}>
            <span className="gutter-spacer all-day__label" aria-hidden="true">
              All day
            </span>

            <div className="week__allday-track">
              {spans.segments.length > 0 && (
                <div className="week__spans" aria-hidden="true">
                  {spans.segments
                    .filter((segment) => segment.lane < spans.lanesUsed)
                    .map((segment) => {
                      const tag = getTag(segment.event.tagId)
                      const spanDays =
                        daysBetween(segment.event.startDate, segment.event.endDate) + 1
                      return (
                        <button
                          key={segment.event.id}
                          type="button"
                          draggable
                          onDragStart={(dragEvent) => {
                            dragEvent.dataTransfer.effectAllowed = 'move'
                            dragEvent.dataTransfer.setData(
                              DRAG_EVENT,
                              JSON.stringify({
                                id: segment.event.id,
                                grabOffsetDays: daysBetween(
                                  segment.event.startDate,
                                  keys[segment.startIndex],
                                ),
                              }),
                            )
                          }}
                          className={[
                            'week__span',
                            segment.continuesBefore ? 'week__span--from' : '',
                            segment.continuesAfter ? 'week__span--to' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={{
                            gridColumn: `${segment.startIndex + 1} / span ${
                              segment.endIndex - segment.startIndex + 1
                            }`,
                            gridRow: segment.lane + 1,
                            '--tag': tag?.color ?? 'var(--series-1)',
                          }}
                          onClick={() => onEditEvent?.(segment.event)}
                          title={[
                            segment.event.title,
                            spanDays > 1 ? `${spanDays} days` : 'All day',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        >
                          {segment.continuesBefore && (
                            <ChevronLeftIcon className="week__span-carry" width="10" height="10" />
                          )}
                          <span className="week__span-title">{segment.event.title}</span>
                          {segment.continuesAfter && (
                            <ChevronRightIcon className="week__span-carry" width="10" height="10" />
                          )}
                        </button>
                      )
                    })}
                </div>
              )}

              <div className="week__allday-cells">
                {allDayByDay.map((list, index) => (
                  <div
                    key={keys[index]}
                    className={`week__allday-cell${
                      dropKey === keys[index] ? ' week__allday-cell--drop' : ''
                    }`}
                    onDragOver={(event) => {
                      if (!hasDrag(event, DRAG_TASK) && !hasDrag(event, DRAG_EVENT)) return
                      event.preventDefault()
                      setDropKey(keys[index])
                    }}
                    onDragLeave={() =>
                      setDropKey((current) => (current === keys[index] ? null : current))
                    }
                    onDrop={(event) => onDropOnAllDay(event, keys[index])}
                    onDoubleClick={() =>
                      onCreateEvent?.({ startDate: keys[index], endDate: keys[index] })
                    }
                  >
                    {list.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move'
                          event.dataTransfer.setData(
                            DRAG_TASK,
                            JSON.stringify({ id: task.id, grabOffsetMin: 0 }),
                          )
                        }}
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
            </div>
          </div>

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
                  events={eventsByDay[index]}
                  windowStart={windowStart}
                  windowEnd={windowEnd}
                  hourMarkList={marks}
                  onCreate={onCreate}
                  onEdit={onEdit}
                  onEditEvent={onEditEvent}
                  nowMinute={key === now.key ? now.min : null}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="week__hint">
        Drag down an empty column to block out time · drag a block to move it, or its edges to
        resize
      </p>
    </section>
  )
}
