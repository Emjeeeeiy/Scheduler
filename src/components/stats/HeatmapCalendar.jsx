import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useSettings } from '../../state/SettingsContext.jsx'
import { useNow } from '../../lib/useNow.js'
import { rangeStats } from '../../lib/stats.js'
import { WEEK_STARTS_ON, formatDayLabel, lastNDays, weekdayOf } from '../../lib/date.js'

const TOTAL_DAYS = 91 // 13 full weeks — a GitHub-style trailing window

/** 0 (nothing scheduled) through 4 (mostly finished) — a coarse band, not a
    precise readout, the same "dots not decimals" idea MiniCalendar's own
    load dots already use. Bucketed by how much of the day's *task count*
    got done rather than by minutes: an all-day or unscheduled item has no
    duration to weigh, and count still says something true about the day
    even when duration can't. */
function levelFor(stats) {
  if (stats.count === 0) return 0
  const rate = stats.doneCount / stats.count
  if (rate >= 0.75) return 4
  if (rate >= 0.5) return 3
  if (rate >= 0.25) return 2
  return 1
}

/**
 * A trailing ~13-week band of single-square days, one column per calendar
 * week — the "don't break the chain" view at a glance, distinct from
 * MiniCalendar's own load dots (which show *volume* for a month) by showing
 * *completion* over a much longer window instead.
 *
 * Aligned to the account's own week-start setting: a leading run of empty
 * cells pads the first column so every real day lands in the same row
 * (Monday, say) it would in the Week/Month grids, rather than just
 * chunking the 91 days into columns of seven in raw date order.
 */
export function HeatmapCalendar() {
  const { tasksOn } = useSchedule()
  const { settings } = useSettings()
  const now = useNow()

  const days = lastNDays(now.key, TOTAL_DAYS)
  const rows = rangeStats(tasksOn, days)

  const weekStartsOn = settings.weekStartsOn ?? WEEK_STARTS_ON
  const leadingGap = (weekdayOf(days[0]) - weekStartsOn + 7) % 7
  const cells = [...Array.from({ length: leadingGap }, () => null), ...rows]

  return (
    <div className="heatmap" role="img" aria-label={`Completion over the last ${TOTAL_DAYS} days`}>
      <div className="heatmap__grid">
        {cells.map((row, index) =>
          row === null ? (
            <span key={`pad-${index}`} className="heatmap__cell heatmap__cell--pad" aria-hidden="true" />
          ) : (
            <span
              key={row.key}
              className={`heatmap__cell heatmap__cell--${levelFor(row)}`}
              title={
                row.count === 0
                  ? `${formatDayLabel(row.key)} — nothing scheduled`
                  : `${formatDayLabel(row.key)} — ${row.doneCount}/${row.count} done`
              }
            />
          ),
        )}
      </div>
      <div className="heatmap__legend" aria-hidden="true">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span key={level} className={`heatmap__cell heatmap__cell--${level}`} />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}
