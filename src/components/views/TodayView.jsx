import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useNow } from '../../lib/useNow.js'
import { usePersistentState } from '../../lib/usePersistentState.js'
import { hourMarks, visibleWindow } from '../../lib/layout.js'
import { freeSlots } from '../../lib/slots.js'
import { dayOfSpan, eventSpanDays, isMultiDay } from '../../lib/spans.js'
import { dayStats, upcomingTasks } from '../../lib/stats.js'
import {
  durationLabel,
  formatFullDayLabel,
  minToLabel,
  minToShortLabel,
  toHours,
} from '../../lib/date.js'
import { DayColumn } from '../calendar/DayColumn.jsx'
import { TaskInbox } from '../calendar/TaskInbox.jsx'
import { TaskRow } from '../calendar/TaskRow.jsx'
import { SpanIcon } from '../icons.jsx'

const HOUR_HEIGHT = 52
const HEAVY_DAY_MIN = 10 * 60

/* Below this, a gap is not really schedulable — offering "12 minutes free"
   would be noise rather than help. */
const MIN_SLOT_MIN = 30
/* What clicking a gap proposes. Filling a three-hour hole with a three-hour
   task is rarely what anyone means; an hour is the sane default, and the
   editor is right there to change it. */
const SLOT_FILL_MIN = 60

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

export function TodayView({ focusKey, onEdit, onCreate, onEditEvent, onCreateEvent }) {
  const { tasksOn, eventsOn, getTag } = useSchedule()
  const now = useNow()
  const [mode, setMode] = usePersistentState('cadence-app:day-mode', 'grid')

  const tasks = tasksOn(focusKey)
  const events = eventsOn(focusKey)
  const allDay = tasks.filter((t) => !Number.isFinite(t.startMin))
  const timed = tasks.filter((t) => Number.isFinite(t.startMin))

  /* A single-day timed event shares the grid with tasks; anything all-day or
     spanning is shown on the rail above it instead. */
  const gridEvents = events.filter(
    (e) => Number.isFinite(e.startMin) && e.startDate === e.endDate,
  )
  const [windowStart, windowEnd] = visibleWindow([...tasks, ...gridEvents])
  const marks = hourMarks(windowStart, windowEnd)
  const stats = dayStats(tasks)

  /* What is actually still open. Events count as busy here even though they
     never count as planned work — you cannot schedule over a meeting just
     because it is not a task. */
  const gaps = freeSlots([...timed, ...gridEvents], windowStart, windowEnd, MIN_SLOT_MIN)

  /* "Right now" only means something on today's own page — a day you've
     navigated to isn't happening, so the callout is Focus's identity for
     today specifically, not a feature of every date this view can show. */
  const isToday = focusKey === now.key
  const current = isToday ? taskHappeningNow(tasks, now.min) : null
  // An all-day item has no place in a time sequence — it isn't "next", it's
  // just true all day — so only a timed block is eligible here.
  const next = isToday && !current ? upcomingTasks(timed, focusKey, now.min, 1)[0] : null
  const focusTask = current ?? next

  /* Events that own the whole day, or run across several: these get the rail
     above rather than a place in the day's sequence, because they do not
     happen *at* a time. */
  const railEvents = events.filter((e) => !Number.isFinite(e.startMin) || isMultiDay(e))

  /* One chronological sequence for agenda mode: all-day tasks first, then
     everything with a clock time. Deliberately excludes the rail's events —
     they are already on screen directly above, and listing them twice makes
     the day look busier than it is. */
  const agenda = [
    ...allDay.map((t) => ({ kind: 'task', item: t })),
    ...[...timed, ...gridEvents]
      .sort((a, b) => a.startMin - b.startMin)
      .map((item) => ({ kind: item.startDate === undefined ? 'task' : 'event', item })),
  ]

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
          <div className="day-panel__controls">
            {/* The system's one "pick one from a small set" idiom, the same
                control as the trends range picker and the repeat presets. */}
            <div className="filter-row" role="group" aria-label="How to show the day">
              {['grid', 'agenda'].map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`filter-chip${mode === id ? ' filter-chip--on' : ''}`}
                  aria-pressed={mode === id}
                  onClick={() => setMode(id)}
                >
                  {id === 'grid' ? 'Grid' : 'Agenda'}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="ghost-button ghost-button--sm"
              onClick={() => onCreate?.({ date: focusKey })}
            >
              Add to this day
            </button>
          </div>
        </div>

        {/* Shown as their own rail rather than mixed into the task list,
            because there is nothing here to tick off. */}
        {railEvents.length > 0 && (
          <ul className="event-rail">
            {railEvents
              .map((event) => {
                const tag = getTag(event.tagId)
                return (
                  <li key={event.id}>
                    <button
                      type="button"
                      className="event-rail__item"
                      style={{ '--tag': tag?.color ?? 'var(--color-baseline)' }}
                      onClick={() => onEditEvent?.(event)}
                    >
                      <SpanIcon className="event-rail__mark" width="13" height="13" />
                      <span className="event-rail__title">{event.title}</span>
                      {isMultiDay(event) && (
                        <span className="event-rail__meta">
                          {/* One template literal, not adjacent expressions:
                              SSR puts comment markers between sibling text
                              nodes, which would split this phrase apart in the
                              rendered markup. Only a real span model can say
                              this, and it is the clearest signal that what you
                              are looking at is not a task. */}
                          {`Day ${dayOfSpan(event, focusKey)} of ${eventSpanDays(event)}`}
                        </span>
                      )}
                      {!isMultiDay(event) && <span className="event-rail__meta">All day</span>}
                    </button>
                  </li>
                )
              })}
          </ul>
        )}

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

        {/* The inverse of the schedule, and the question a time-blocker
            actually asks: not "what is on today" but "where can this go". */}
        {gaps.length > 0 && (
          <div className="free-slots">
            <span className="free-slots__label">Free</span>
            <ul className="free-slots__list">
              {gaps.map((gap) => (
                <li key={gap.startMin}>
                  <button
                    type="button"
                    className="free-slots__slot"
                    onClick={() =>
                      onCreate?.({
                        date: focusKey,
                        startMin: gap.startMin,
                        durationMin: Math.min(gap.lengthMin, SLOT_FILL_MIN),
                      })
                    }
                    title={`Add a task at ${minToLabel(gap.startMin)}`}
                  >
                    <span className="free-slots__when">
                      {minToLabel(gap.startMin)} – {minToLabel(gap.endMin)}
                    </span>
                    <span className="free-slots__len">{durationLabel(gap.lengthMin)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {mode === 'agenda' ? (
          <ul className="agenda">
            {agenda.length === 0 && <p className="empty empty--sm">Nothing scheduled yet.</p>}
            {agenda.map(({ kind, item }) => {
              const tag = getTag(item.tagId)
              const isEvent = kind === 'event'
              return (
                <li key={`${kind}-${item.id}`}>
                  <button
                    type="button"
                    className={`agenda__row${item.done ? ' agenda__row--done' : ''}${
                      isEvent ? ' agenda__row--event' : ''
                    }`}
                    style={{ '--tag': tag?.color ?? 'var(--color-baseline)' }}
                    onClick={() => (isEvent ? onEditEvent?.(item) : onEdit?.(item))}
                  >
                    <span className="agenda__when">
                      {Number.isFinite(item.startMin) ? minToLabel(item.startMin) : 'All day'}
                    </span>
                    <span className="agenda__title">{item.title}</span>
                    <span className="agenda__meta">
                      {isEvent ? 'Event' : durationLabel(item.durationMin)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
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
                style={{ height: `${((windowEnd - windowStart) / 60) * HOUR_HEIGHT}px` }}
              >
                <DayColumn
                  dateKey={focusKey}
                  tasks={tasks}
                  events={events}
                  windowStart={windowStart}
                  windowEnd={windowEnd}
                  hourMarkList={marks}
                  onCreate={onCreate}
                  onEdit={onEdit}
                  onEditEvent={onEditEvent}
                  nowMinute={now.key === focusKey ? now.min : null}
                />
              </div>
            </div>
          </div>
        )}

        {stats.plannedMin > 0 && (
          <p className="day-panel__foot">
            {toHours(stats.plannedMin)}h planned of a 24h day
            {stats.plannedMin > HEAVY_DAY_MIN && (
              <span className="warn-text"> · that is a heavy day</span>
            )}
          </p>
        )}
      </section>

      <TaskInbox
        focusKey={focusKey}
        onEdit={onEdit}
        onCreate={onCreate}
        onCreateEvent={onCreateEvent}
      />
    </div>
  )
}
