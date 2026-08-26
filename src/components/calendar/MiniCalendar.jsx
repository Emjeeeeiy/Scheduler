import { useState } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useNow } from '../../lib/useNow.js'
import { HEAVY_DAY_MIN, dayStats } from '../../lib/stats.js'
import {
  dayOfMonth,
  durationLabel,
  formatMonthLabel,
  monthGrid,
  monthOf,
  shiftMonth,
  todayKey,
  WEEKDAY_HEADERS,
} from '../../lib/date.js'
import { ChevronLeftIcon, ChevronRightIcon } from '../icons.jsx'

/* The same "heavy day" reference the week and month load bars use. Reusing it
   rather than inventing a third scale is the point: "busy" has to mean one
   thing across the app, or the dashboard would be quietly disagreeing with the
   view it links to. */

/** How many load dots a day earns — a coarse band, not a precise readout. */
function loadDots(plannedMin) {
  if (plannedMin <= 0) return 0
  if (plannedMin < HEAVY_DAY_MIN / 3) return 1
  if (plannedMin < (HEAVY_DAY_MIN * 2) / 3) return 2
  return 3
}

/**
 * A month at a glance beside the hero. Its own cursor, deliberately not the
 * app's: looking ahead to next month here should not move the date every other
 * view is pointed at. Clicking a day is what commits to a move.
 */
export function MiniCalendar({ onFocusDay, onFocusMonth }) {
  const { tasksOn, eventsOn } = useSchedule()
  const now = useNow()
  const [cursor, setCursor] = useState(() => todayKey())

  const keys = monthGrid(cursor)
  const month = monthOf(cursor)

  return (
    <section className="card mini-cal" aria-label={`Calendar — ${formatMonthLabel(cursor)}`}>
      <div className="mini-cal__head">
        <button
          type="button"
          className="mini-cal__label"
          onClick={() => onFocusMonth?.(cursor)}
          title="Open this month"
        >
          {formatMonthLabel(cursor)}
        </button>
        <div className="mini-cal__nav">
          <button
            type="button"
            className="icon-button icon-button--sm"
            onClick={() => setCursor((key) => shiftMonth(key, -1))}
            aria-label="Previous month"
          >
            <ChevronLeftIcon width="14" height="14" />
          </button>
          <button
            type="button"
            className="icon-button icon-button--sm"
            onClick={() => setCursor((key) => shiftMonth(key, 1))}
            aria-label="Next month"
          >
            <ChevronRightIcon width="14" height="14" />
          </button>
        </div>
      </div>

      <div className="mini-cal__dow" aria-hidden="true">
        {WEEKDAY_HEADERS.map((label) => (
          <span key={label}>{label.slice(0, 1)}</span>
        ))}
      </div>

      <div className="mini-cal__grid">
        {keys.map((key) => {
          const stats = dayStats(tasksOn(key))
          const events = eventsOn(key)
          const dots = loadDots(stats.plannedMin)
          const outside = monthOf(key) !== month
          const isToday = key === now.key

          return (
            <button
              key={key}
              type="button"
              className={[
                'mini-cal__day',
                outside ? 'mini-cal__day--outside' : '',
                isToday ? 'mini-cal__day--today' : '',
                events.length > 0 ? 'mini-cal__day--event' : '',
                stats.plannedMin > HEAVY_DAY_MIN ? 'mini-cal__day--heavy' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onFocusDay?.(key)}
              /* Spelled out, because a dot count and a filled numeral are both
                 shape, and shape alone is never the whole signal. */
              title={[
                key,
                stats.plannedMin > 0 ? `${durationLabel(stats.plannedMin)} planned` : 'nothing planned',
                events.length > 0 ? `${events.length} event${events.length === 1 ? '' : 's'}` : null,
              ]
                .filter(Boolean)
                .join(' — ')}
            >
              <span className="mini-cal__num">{dayOfMonth(key)}</span>
              <span className="mini-cal__dots" aria-hidden="true">
                {Array.from({ length: dots }, (_, i) => (
                  <span key={i} className="mini-cal__dot" />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
