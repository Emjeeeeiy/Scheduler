import {
  dayOfMonth,
  formatMonthLabel,
  monthGrid,
  monthOf,
  todayKey,
  weekdayHeaders,
} from '@cadence/shared/date.js'
import { ChevronLeftIcon, ChevronRightIcon } from '../icons.jsx'

/* The days that get "planned" in the loop, by position in the month grid rather
   than by date, so it reads as a lived-in month whichever month it is.
   Positions 8–25 sit in the grid's second to fourth rows, which are inside the
   month in every month (only the first and last row can hold days from a
   neighbour). `dots` is how loaded the day gets; `event` fills the numeral, as an
   event day does in the real calendar. They are listed in the order they appear,
   which is what `--t` carries to the stylesheet. */
const PLAN = [
  { at: 8, dots: 1 },
  { at: 9, dots: 2, event: true },
  { at: 11, dots: 1 },
  { at: 14, dots: 2 },
  { at: 16, dots: 3, event: true },
  { at: 17, dots: 1 },
  { at: 22, dots: 1 },
  { at: 24, dots: 2, event: true },
  { at: 25, dots: 1 },
]

const PLAN_BY_POSITION = new Map(PLAN.map((day, order) => [day.at, { ...day, order }]))

/**
 * A month drawn like the Dashboard's own calendar — the same mono numerals, the
 * same weekday header, an ink circle for today, a lighter circle on event days,
 * load dots under busy ones — standing in for a screenshot on the sign-in screen,
 * and quietly planning itself: the days fade in, then the planned ones fill in
 * one after another and clear again, a slow loop.
 *
 * All motion is CSS (see `.auth-cal` in auth.css), so it costs no timers and is
 * switched off wholesale by `prefers-reduced-motion`, which leaves the planned
 * month standing still. It is decoration: not interactive, and described to a
 * screen reader as one picture rather than as sixty cells.
 */
export function AuthCalendar() {
  const today = todayKey()
  const keys = monthGrid(today, 1)
  const month = monthOf(today)
  const headers = weekdayHeaders(1)

  return (
    <div className="auth-cal" role="img" aria-label="A month calendar filling up with planned days">
      <div className="auth-cal__head" aria-hidden="true">
        <span className="auth-cal__label">{formatMonthLabel(today)}</span>
        <span className="auth-cal__nav">
          <ChevronLeftIcon width="14" height="14" />
          <ChevronRightIcon width="14" height="14" />
        </span>
      </div>

      <div className="auth-cal__dow" aria-hidden="true">
        {headers.map((label, index) => (
          <span key={index}>{label.slice(0, 1)}</span>
        ))}
      </div>

      <div className="auth-cal__grid" aria-hidden="true">
        {keys.map((key, index) => {
          const plan = monthOf(key) === month ? PLAN_BY_POSITION.get(index) : undefined
          return (
            <span
              key={key}
              className={[
                'auth-cal__day',
                monthOf(key) !== month ? 'auth-cal__day--outside' : '',
                key === today ? 'auth-cal__day--today' : '',
                plan?.event ? 'auth-cal__day--event' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ '--i': index, ...(plan ? { '--t': plan.order } : null) }}
            >
              <span className="auth-cal__num">{dayOfMonth(key)}</span>
              {plan ? (
                <span className="auth-cal__dots">
                  {Array.from({ length: plan.dots }, (_, dot) => (
                    <span key={dot} className="auth-cal__dot" style={{ '--d': dot }} />
                  ))}
                </span>
              ) : null}
            </span>
          )
        })}
      </div>
    </div>
  )
}
