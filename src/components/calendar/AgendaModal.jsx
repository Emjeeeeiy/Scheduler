import { useMemo, useRef } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useSettings } from '../../state/SettingsContext.jsx'
import { useModalA11y } from '../../lib/useModalA11y.js'
import {
  durationLabel,
  formatDayLabel,
  formatFullDayLabel,
  formatMonthLabel,
  formatWeekLabel,
  minToLabel,
  monthGrid,
  monthOf,
  todayKey,
  weekKeys,
} from '../../lib/date.js'
import { CloseIcon } from '../icons.jsx'
import { TagGlyph } from '../editors/TagGlyph.jsx'

/** One day's events then tasks, each already chronological — the same
    ordering DayPeek uses for its own single-day summary, reused here so a
    day looks identical whether it's opened from the month grid or from one
    of these palette commands. */
function dayAgenda(tasksOn, eventsOn, key) {
  return { key, tasks: tasksOn(key), events: eventsOn(key) }
}

function AgendaList({ tasks, events, getTag, onEdit, onEditEvent, onClose, toggleDone }) {
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
                onClose()
                onEditEvent(event)
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
                onClose()
                onEdit(task)
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

/**
 * The three "what's on" command-palette entries (Today / This week / This
 * month) all open this one modal, parameterised by `range` — a quick read of
 * what's scheduled without leaving whatever view you're already on. Always
 * anchored to the real current date, not the app's date cursor: the point is
 * "what's on my plate", the same answer regardless of which day you'd
 * navigated the calendar to before opening the palette.
 *
 * Today is a single list (mirrors DayPeek). Week and month group by day,
 * inside a `.stack` for the hairline between days, and skip any day with
 * nothing on it — a wall of "Nothing scheduled" rows for every empty day of
 * the month would bury the days that actually matter.
 */
export function AgendaModal({ range, onClose, onEdit, onEditEvent, onFocusDay }) {
  const { tasksOn, eventsOn, getTag, toggleDone } = useSchedule()
  const { settings } = useSettings()
  const panelRef = useRef(null)
  useModalA11y(panelRef, { onClose })

  const today = todayKey()

  const keys = useMemo(() => {
    if (range === 'today') return [today]
    if (range === 'week') return weekKeys(today, settings.weekStartsOn)
    const month = monthOf(today)
    return monthGrid(today, settings.weekStartsOn).filter((key) => monthOf(key) === month)
  }, [range, today, settings.weekStartsOn])

  const days = useMemo(
    () => keys.map((key) => dayAgenda(tasksOn, eventsOn, key)),
    [keys, tasksOn, eventsOn],
  )

  const title =
    range === 'today'
      ? formatFullDayLabel(today)
      : range === 'week'
        ? `Week of ${formatWeekLabel(today, settings.weekStartsOn)}`
        : formatMonthLabel(today)

  const nonEmptyDays = days.filter((day) => day.tasks.length > 0 || day.events.length > 0)

  return (
    <div className="modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} className="modal__panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__head">
          <h2 className="modal__title">{title}</h2>
          <div className="modal__head-actions">
            <button
              type="button"
              className="ghost-button ghost-button--sm"
              onClick={() => {
                onClose()
                onFocusDay(today)
              }}
            >
              Open today
            </button>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
        </div>

        {range === 'today' ? (
          <AgendaList
            tasks={days[0].tasks}
            events={days[0].events}
            getTag={getTag}
            onEdit={onEdit}
            onEditEvent={onEditEvent}
            onClose={onClose}
            toggleDone={toggleDone}
          />
        ) : nonEmptyDays.length === 0 ? (
          <p className="empty empty--sm">Nothing scheduled.</p>
        ) : (
          <div className="stack">
            {nonEmptyDays.map((day) => (
              <div key={day.key}>
                <div className="day-peek__head">
                  <span className="day-peek__title">{formatDayLabel(day.key)}</span>
                  <button
                    type="button"
                    className="ghost-button ghost-button--sm"
                    onClick={() => {
                      onClose()
                      onFocusDay(day.key)
                    }}
                  >
                    Open day
                  </button>
                </div>
                <AgendaList
                  tasks={day.tasks}
                  events={day.events}
                  getTag={getTag}
                  onEdit={onEdit}
                  onEditEvent={onEditEvent}
                  onClose={onClose}
                  toggleDone={toggleDone}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
