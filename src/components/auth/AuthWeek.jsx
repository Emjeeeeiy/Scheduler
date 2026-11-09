import { dayOfMonth, formatWeekLabel, todayKey, weekKeys, weekdayHeaders } from '@cadence/shared/date.js'
import { ChevronLeftIcon, ChevronRightIcon } from '../icons.jsx'
import { BLOCKS, FIRST_HOUR, HOUR_LABELS, SHORT_BELOW, SHOWS_TIME_FROM, clock } from './authWeekPlan.js'

/**
 * The Schedule page's week, in miniature: day columns on an hour grid, and
 * blocks with a tag-colour left edge, a 15% tint and a mono time line — the same
 * vocabulary the real time grid draws, filled with made-up appointments. Beside
 * the month calendar on the sign-in screen it says "this is where the days
 * go", and it moves with it: the blocks are drawn in one after another, held,
 * and cleared again on the same ten-second loop the month uses, so the two seem
 * to be planning the same stretch of time.
 *
 * The motion is CSS only (see `.auth-week` in auth.css) and `prefers-reduced-
 * motion` turns it off, leaving the planned week standing. Decoration: one
 * `role="img"`, nothing to press.
 */
export function AuthWeek() {
  const today = todayKey()
  const days = weekKeys(today, 1).slice(0, 5)
  const names = weekdayHeaders(1)

  return (
    <div className="auth-week" role="img" aria-label="A week of scheduled blocks filling a time grid">
      <div className="auth-week__head" aria-hidden="true">
        <span className="auth-week__label">{formatWeekLabel(today, 1)}</span>
        <span className="auth-week__nav">
          <ChevronLeftIcon width="14" height="14" />
          <ChevronRightIcon width="14" height="14" />
        </span>
      </div>

      <div className="auth-week__days" aria-hidden="true">
        {days.map((key, index) => (
          <span
            key={key}
            className={`auth-week__day${key === today ? ' auth-week__day--today' : ''}`}
            style={{ '--c': index }}
          >
            <span className="auth-week__dow">{names[index].slice(0, 3)}</span>
            <span className="auth-week__date">{dayOfMonth(key)}</span>
          </span>
        ))}
      </div>

      <div className="auth-week__body" aria-hidden="true">
        <div className="auth-week__gutter">
          {HOUR_LABELS.map((label, index) => (
            <span key={label} className="auth-week__mark" style={{ '--h': index }}>
              {label}
            </span>
          ))}
        </div>
        {days.map((key, column) => (
          <div key={key} className="auth-week__col" style={{ '--c': column }}>
            {BLOCKS.map((block, order) =>
              block.day === column ? (
                <span
                  key={order}
                  className={`auth-week__block${block.len < SHORT_BELOW ? ' auth-week__block--short' : ''}`}
                  style={{
                    '--tag': `var(--color-tag-${block.tag})`,
                    '--at': (block.at - FIRST_HOUR * 60) / 60,
                    '--len': block.len / 60,
                    '--b': order,
                  }}
                >
                  <span className="auth-week__title">{block.title}</span>
                  {block.len >= SHOWS_TIME_FROM ? (
                    <span className="auth-week__time">{clock(block.at)}</span>
                  ) : null}
                </span>
              ) : null,
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
