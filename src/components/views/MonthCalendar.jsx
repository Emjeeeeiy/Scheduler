import { useState } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useNow } from '../../lib/useNow.js'
import { DRAG_EVENT, DRAG_TASK, hasDrag, readDrag } from '../../lib/dnd.js'
import { packSpans } from '../../lib/spans.js'
import {
  dayOfMonth,
  daysBetween,
  durationLabel,
  formatMonthLabel,
  minToLabel,
  monthOf,
  monthGrid,
  WEEKDAY_HEADERS,
} from '../../lib/date.js'
import { dayStats } from '../../lib/stats.js'
import { recurrenceLabel } from '../../lib/recurrence.js'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '../icons.jsx'
import { DayPeek } from '../calendar/DayPeek.jsx'

/* How many rows of content a cell can hold at all — event lanes and task chips
   share this budget, so a day with two spanning bars shows fewer chips rather
   than growing taller than its neighbours. Fixed rather than measured: a
   ResizeObserver would not run under the SSR smoke render, and would make the
   "+N more" count change as the window resizes. */
const CONTENT_BUDGET = 4

/* Same threshold WeekGrid uses, so a day reads as "heavy" identically in both
   views rather than the month having its own opinion about what counts. */
const HEAVY_DAY_MIN = 10 * 60

/** One week of the grid: seven cells, with any spanning event bars laid over
    them in the same seven tracks so a bar lines up with the days it covers. */
function MonthWeek({
  rowKeys,
  month,
  todayIsKey,
  tasksOn,
  eventsInRange,
  getTag,
  onFocusDay,
  onCreate,
  onEdit,
  onEditEvent,
  onDropTask,
  onDropEvent,
  dropKey,
  setDropKey,
}) {
  const rowEvents = eventsInRange(rowKeys[0], rowKeys[rowKeys.length - 1])
  const { lanesUsed, segments, overflowByDay, chipBudget } = packSpans(rowKeys, rowEvents, {
    contentBudget: CONTENT_BUDGET,
  })

  return (
    <div className="month__week" style={{ '--lanes': lanesUsed }}>
      {rowKeys.map((key, index) => {
        const tasks = tasksOn(key)
        const stats = dayStats(tasks)
        const outside = monthOf(key) !== month
        const isToday = key === todayIsKey
        const shown = tasks.slice(0, chipBudget)
        // One honest number: the day's own hidden tasks plus any event bar
        // that could not be given a lane.
        const overflow = tasks.length - shown.length + overflowByDay[index]

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
            onDragOver={(dragEvent) => {
              if (!hasDrag(dragEvent, DRAG_TASK) && !hasDrag(dragEvent, DRAG_EVENT)) return
              dragEvent.preventDefault()
              setDropKey(key)
            }}
            onDragLeave={() => setDropKey((current) => (current === key ? null : current))}
            onDrop={(dragEvent) => {
              if (hasDrag(dragEvent, DRAG_EVENT)) onDropEvent(dragEvent, key)
              else onDropTask(dragEvent, key)
            }}
          >
            {stats.plannedMin > 0 && (
              <span className="month__load-strip" aria-hidden="true">
                <span
                  className={`month__load-strip-fill${
                    stats.plannedMin > HEAVY_DAY_MIN ? ' month__load-strip-fill--heavy' : ''
                  }`}
                  style={{ width: `${Math.min(100, (stats.plannedMin / HEAVY_DAY_MIN) * 100)}%` }}
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

            {/* Reserves the lanes' height so chips start below the bars. */}
            <div className="month__lane-spacer" aria-hidden="true" />

            <ul className="month__chips">
              {shown.map((task) => {
                const tag = getTag(task.tagId)
                return (
                  <li key={task.id}>
                    <button
                      type="button"
                      draggable
                      onDragStart={(dragEvent) => {
                        dragEvent.dataTransfer.effectAllowed = 'move'
                        dragEvent.dataTransfer.setData(
                          DRAG_TASK,
                          JSON.stringify({ id: task.id, grabOffsetMin: 0 }),
                        )
                      }}
                      className={`chip chip--dot${task.done ? ' chip--done' : ''}`}
                      style={{ '--tag': tag?.color ?? 'var(--series-1)' }}
                      onClick={() => onEdit?.(task)}
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
                  <DayPeek
                    dateKey={key}
                    count={overflow}
                    onEdit={onEdit}
                    onEditEvent={onEditEvent}
                    onFocusDay={onFocusDay}
                  />
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

      {/* The bars live in their own layer over the same seven tracks, because
          a bar has to cross cell boundaries and so cannot live inside one.
          pointer-events is off for the layer and back on for each bar, so the
          cells underneath stay fully droppable — this app runs on drag and
          drop, and an overlay that swallowed drops would break the month. */}
      {segments.length > 0 && (
        <div className="month__lanes" aria-hidden="true">
          {segments
            .filter((segment) => segment.lane < lanesUsed)
            .map((segment) => {
              const tag = getTag(segment.event.tagId)
              const spanDays = daysBetween(segment.event.startDate, segment.event.endDate) + 1
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
                        // Which day of the run was grabbed, so dropping it
                        // elsewhere moves that day there and the rest follows.
                        grabOffsetDays: daysBetween(
                          segment.event.startDate,
                          rowKeys[segment.startIndex],
                        ),
                      }),
                    )
                  }}
                  className={[
                    'month__bar',
                    segment.continuesBefore ? 'month__bar--from' : '',
                    segment.continuesAfter ? 'month__bar--to' : '',
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
                    spanDays > 1 ? `${spanDays} days` : null,
                    Number.isFinite(segment.event.startMin)
                      ? minToLabel(segment.event.startMin)
                      : 'All day',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                >
                  {segment.continuesBefore && (
                    <ChevronLeftIcon className="month__bar-carry" width="10" height="10" />
                  )}
                  <span className="month__bar-title">{segment.event.title}</span>
                  {segment.continuesAfter && (
                    <ChevronRightIcon className="month__bar-carry" width="10" height="10" />
                  )}
                  {/* Colour and shape never carry it alone. */}
                  <span className="visually-hidden">
                    {segment.continuesBefore ? 'Continues from earlier. ' : ''}
                    Event{spanDays > 1 ? `, ${spanDays} days` : ''}
                    {segment.continuesAfter ? '. Continues afterwards' : ''}
                  </span>
                </button>
              )
            })}
        </div>
      )}
    </div>
  )
}

export function MonthCalendar({ focusKey, onFocusDay, onCreate, onEdit, onEditEvent }) {
  const { tasksOn, eventsInRange, getTag, updateTask, moveEvent } = useSchedule()
  const now = useNow()
  const [dropKey, setDropKey] = useState(null)

  const keys = monthGrid(focusKey)
  const month = monthOf(focusKey)

  // Six rows of seven. A bar cannot cross a line break, so packing happens per
  // row and each row owns its own lanes.
  const rows = []
  for (let i = 0; i < keys.length; i += 7) rows.push(keys.slice(i, i + 7))

  async function onDropTask(event, key) {
    if (!hasDrag(event, DRAG_TASK)) return
    event.preventDefault()
    setDropKey(null)
    const payload = readDrag(event, DRAG_TASK)
    if (!payload?.id) return
    try {
      // Only the day changes here — whatever time the block already had is
      // still what the user meant, so it rides along.
      await updateTask(payload.id, { date: key })
    } catch (caught) {
      console.error('Could not move task.', caught)
    }
  }

  async function onDropEvent(event, key) {
    if (!hasDrag(event, DRAG_EVENT)) return
    event.preventDefault()
    setDropKey(null)
    const payload = readDrag(event, DRAG_EVENT)
    if (!payload?.id) return
    try {
      await moveEvent(payload.id, key, payload.grabOffsetDays ?? 0)
    } catch (caught) {
      console.error('Could not move event.', caught)
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
        {rows.map((rowKeys) => (
          <MonthWeek
            key={rowKeys[0]}
            rowKeys={rowKeys}
            month={month}
            todayIsKey={now.key}
            tasksOn={tasksOn}
            eventsInRange={eventsInRange}
            getTag={getTag}
            onFocusDay={onFocusDay}
            onCreate={onCreate}
            onEdit={onEdit}
            onEditEvent={onEditEvent}
            onDropTask={onDropTask}
            onDropEvent={onDropEvent}
            dropKey={dropKey}
            setDropKey={setDropKey}
          />
        ))}
      </div>
    </section>
  )
}
