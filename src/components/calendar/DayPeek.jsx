import { useCallback, useState } from 'react'
import { useSchedule } from '../state/ScheduleContext.jsx'
import { usePopoverPlacement } from '../lib/usePopoverPlacement.js'
import { formatDayLabel, durationLabel, minToLabel } from '../lib/date.js'
import { eventSpanDays, isMultiDay } from '../lib/spans.js'

const PANEL_WIDTH = 260
const PANEL_MAX_HEIGHT = 320

/**
 * The "+N more" control and the panel it opens, together.
 *
 * Before this, a busy day's overflow sent you to the Day view — which meant
 * the only way to see what was on a crowded day was to leave the month. A peek
 * shows the day in place, and anything in it opens for editing directly.
 */
export function DayPeek({ dateKey, count, onEdit, onEditEvent, onFocusDay }) {
  const { tasksOn, eventsOn, getTag } = useSchedule()
  const [open, setOpen] = useState(false)
  const dismiss = useCallback(() => setOpen(false), [])
  const { placement, triggerRef, panelRef } = usePopoverPlacement({
    open,
    onDismiss: dismiss,
    width: PANEL_WIDTH,
    maxHeight: PANEL_MAX_HEIGHT,
  })

  const tasks = open ? tasksOn(dateKey) : []
  const events = open ? eventsOn(dateKey) : []

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="month__more"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        +{count} more
      </button>

      {open && placement && (
        <div
          ref={panelRef}
          className="day-peek"
          style={{ ...placement, width: PANEL_WIDTH, maxHeight: PANEL_MAX_HEIGHT }}
          role="dialog"
          aria-label={formatDayLabel(dateKey)}
        >
          <div className="day-peek__head">
            <span className="day-peek__title">{formatDayLabel(dateKey)}</span>
            <button
              type="button"
              className="ghost-button ghost-button--sm"
              onClick={() => {
                setOpen(false)
                onFocusDay?.(dateKey)
              }}
            >
              Open day
            </button>
          </div>

          <ul className="day-peek__list">
            {events.map((event) => {
              const tag = getTag(event.tagId)
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    className="day-peek__item day-peek__item--event"
                    style={{ '--tag': tag?.color ?? 'var(--series-1)' }}
                    onClick={() => {
                      setOpen(false)
                      onEditEvent?.(event)
                    }}
                  >
                    <span className="day-peek__when">
                      {Number.isFinite(event.startMin) ? minToLabel(event.startMin) : 'All day'}
                    </span>
                    <span className="day-peek__label">{event.title}</span>
                    {isMultiDay(event) && (
                      <span className="day-peek__note">{eventSpanDays(event)}d</span>
                    )}
                  </button>
                </li>
              )
            })}

            {tasks.map((task) => {
              const tag = getTag(task.tagId)
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    className={`day-peek__item${task.done ? ' day-peek__item--done' : ''}`}
                    style={{ '--tag': tag?.color ?? 'var(--series-1)' }}
                    onClick={() => {
                      setOpen(false)
                      onEdit?.(task)
                    }}
                  >
                    <span className="day-peek__when">
                      {Number.isFinite(task.startMin) ? minToLabel(task.startMin) : 'All day'}
                    </span>
                    <span className="day-peek__label">{task.title}</span>
                    {Number.isFinite(task.startMin) && (
                      <span className="day-peek__note">{durationLabel(task.durationMin)}</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </>
  )
}
