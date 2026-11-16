import { useMemo, useRef } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useSettings } from '../../state/SettingsContext.jsx'
import { useModalA11y } from '../../lib/useModalA11y.js'
import {
  formatDayLabel,
  formatFullDayLabel,
  formatMonthLabel,
  formatWeekLabel,
  monthGrid,
  monthOf,
  todayKey,
  weekKeys,
} from '@cadence/shared/date.js'
import { CloseIcon } from '../icons.jsx'
import { DayAgendaList as AgendaList } from './DayAgendaList.jsx'
import { DayNoteButton } from './DayNoteButton.jsx'

/** One day's events then tasks, each already chronological — the same
    ordering DayPeek uses for its own single-day summary, reused here so a
    day looks identical whether it's opened from the month grid or from one
    of these palette commands. */
function dayAgenda(tasksOn, eventsOn, key) {
  return { key, tasks: tasksOn(key), events: eventsOn(key) }
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
export function AgendaModal({ range, onClose, onEdit, onEditEvent, onFocusDay, onOpenDayNote }) {
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

  // Leaving for the Journal closes this first, the same way "Open day" does.
  const openDayNote = onOpenDayNote
    ? (key) => {
        onClose()
        onOpenDayNote(key)
      }
    : undefined

  return (
    <div className="modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} className="modal__panel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__head">
          <h2 className="modal__title">{title}</h2>
          <div className="modal__head-actions">
            {range === 'today' && <DayNoteButton dayKey={today} onOpen={openDayNote} />}
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
                  <div className="day-peek__actions">
                    <DayNoteButton dayKey={day.key} onOpen={openDayNote} />
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
