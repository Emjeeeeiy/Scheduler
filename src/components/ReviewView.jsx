import { useState } from 'react'
import { useSchedule } from '../state/ScheduleContext.jsx'
import { useNow } from '../lib/useNow.js'
import { rangeStats, summarize, tagBreakdown, weakestTag } from '../lib/stats.js'
import { dayOfMonth, durationLabel, formatDayLabel, lastNDays, toHours } from '../lib/date.js'
import { StatTile } from './StatTile.jsx'
import { BarChart } from './BarChart.jsx'
import { TagBars } from './TagBars.jsx'

const RANGES = [
  { id: 7, label: 'Last 7 days' },
  { id: 30, label: 'Last 30 days' },
]

export function ReviewView() {
  const { tags, tasksByDate } = useSchedule()
  const now = useNow()
  const [days, setDays] = useState(7)

  const keys = lastNDays(now.key, days)
  const rows = rangeStats(tasksByDate, keys).map((row, index) => ({
    ...row,
    // At 30 columns every label would collide, so thin them out and let the
    // tooltip and table carry the exact day.
    short: days <= 7 || index % 5 === 0 || index === keys.length - 1 ? String(dayOfMonth(row.key)) : '',
    label: formatDayLabel(row.key),
  }))

  const totals = summarize(rows)
  const rangeTasks = keys.flatMap((key) => tasksByDate.get(key) ?? [])
  const byTag = tagBreakdown(rangeTasks, tags)
  const weakest = weakestTag(rangeTasks, tags)

  const activeDays = rows.filter((row) => row.plannedMin > 0).length

  return (
    <div className="review">
      {/* One filter row scoping everything below it, rather than a control
          buried inside each chart card. */}
      <div className="filter-row" role="group" aria-label="Time range">
        {RANGES.map((range) => (
          <button
            key={range.id}
            type="button"
            className={`filter-chip${days === range.id ? ' filter-chip--on' : ''}`}
            aria-pressed={days === range.id}
            onClick={() => setDays(range.id)}
          >
            {range.label}
          </button>
        ))}
      </div>

      <div className="tile-row">
        <StatTile
          label="Hours planned"
          value={toHours(totals.plannedMin)}
          unit="h"
          hint={`across ${activeDays} active day${activeDays === 1 ? '' : 's'}`}
        />
        <StatTile
          label="Hours completed"
          value={toHours(totals.completedMin)}
          unit="h"
          hint={
            totals.hourRate === null
              ? 'Nothing planned yet'
              : `${Math.round(totals.hourRate * 100)}% of planned time`
          }
        />
        <StatTile
          label="Tasks done"
          value={totals.doneCount}
          hint={`of ${totals.count} scheduled`}
        />
        <StatTile
          label="Completion rate"
          value={totals.completionRate === null ? '—' : Math.round(totals.completionRate * 100)}
          unit={totals.completionRate === null ? '' : '%'}
          tone={
            totals.completionRate !== null && totals.completionRate >= 0.7 ? 'good' : 'neutral'
          }
          hint="Share of scheduled tasks ticked off"
        />
      </div>

      <section className="card">
        <BarChart
          rows={rows}
          label={`Planned versus completed — last ${days} days`}
          emptyText="Nothing scheduled in this range yet."
        />
      </section>

      <div className="chart-row">
        <section className="card">
          <TagBars rows={byTag} label={`Time by tag — last ${days} days`} />
        </section>

        <section className="card review__notes">
          <div className="section-head">
            <h2 className="section-head__title">What this says</h2>
          </div>
          <ul className="notes-list">
            <li>
              You planned <strong>{durationLabel(totals.plannedMin)}</strong> and completed{' '}
              <strong>{durationLabel(totals.completedMin)}</strong>
              {totals.hourRate !== null && <> — {Math.round(totals.hourRate * 100)}% of it.</>}
            </li>
            {activeDays > 0 && (
              <li>
                That averages{' '}
                <strong>{toHours(totals.plannedMin / activeDays)}h</strong> on the days you
                planned anything.
              </li>
            )}
            {weakest && (
              <li>
                <strong>{weakest.tag.name}</strong> is the tag you finish least often —{' '}
                {Math.round(weakest.rate * 100)}% of its planned time. Either the estimates are
                optimistic or the slots are in the wrong part of the day.
              </li>
            )}
            {totals.count === 0 && <li>Schedule a few tasks and this fills in.</li>}
          </ul>
        </section>
      </div>
    </div>
  )
}
