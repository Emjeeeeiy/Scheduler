import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useSettings } from '../../state/SettingsContext.jsx'
import {
  focusByTag,
  focusStatsFor,
  rangeStats,
  summarize,
  tagBreakdown,
  weakestTag,
} from '../../lib/stats.js'
import { durationLabel, formatDayLabel, formatWeekLabel, toHours, weekKeys } from '../../lib/date.js'
import { StatTile } from '../stats/StatTile.jsx'
import { BarChart } from '../stats/BarChart.jsx'
import { TagBars } from '../stats/TagBars.jsx'
import { HeatmapCalendar } from '../stats/HeatmapCalendar.jsx'
import { FrameTicks } from '../shell/FrameTicks.jsx'
import { CheckIcon, ClockIcon, FocusIcon, TrendIcon } from '../icons.jsx'

/**
 * A retrospective for one specific week, sharing the app's own date cursor
 * and Prev/Next header (see App.jsx's DATE_NAV) rather than inventing a
 * second one — "review last week" is just stepping the same cursor Day and
 * Week already use, one week at a time. Built from the exact aggregation
 * functions Dashboard's own Trends section already uses, so a number here
 * never has a second, competing definition of "planned" or "done."
 *
 * The heatmap at the bottom is the one thing on this page that does NOT
 * move with the week cursor — 13 weeks of completion history is a "how am I
 * doing lately" band, not something scoped to whichever single week is
 * currently in view.
 */
export function ReviewView({ focusKey }) {
  const { tasksOn, tags, focusSessions } = useSchedule()
  const { settings } = useSettings()

  const keys = weekKeys(focusKey, settings.weekStartsOn)
  const rows = rangeStats(tasksOn, keys).map((row) => ({ ...row, label: formatDayLabel(row.key) }))
  const totals = summarize(rows)
  const weekTasks = keys.flatMap(tasksOn)
  const byTag = tagBreakdown(weekTasks, tags)
  const weakest = weakestTag(weekTasks, tags)
  const activeDays = rows.filter((row) => row.plannedMin > 0).length

  const weekFocus = focusStatsFor(focusSessions, keys)
  const weekFocusByTag = focusByTag(
    focusSessions.filter((s) => keys.includes(s.date)),
    tags,
  )

  return (
    <div className="review frame stack">
      <FrameTicks />

      <div className="section-head">
        <div>
          <h2 className="section-head__title">Review</h2>
          <p className="section-head__sub">Week of {formatWeekLabel(focusKey, settings.weekStartsOn)}</p>
        </div>
      </div>

      <div className="tile-row divided-row">
        <StatTile
          icon={ClockIcon}
          label="Hours planned"
          value={toHours(totals.plannedMin)}
          unit="h"
          hint={`across ${activeDays} active day${activeDays === 1 ? '' : 's'}`}
        />
        <StatTile
          icon={CheckIcon}
          label="Hours completed"
          value={toHours(totals.completedMin)}
          unit="h"
          hint={totals.hourRate === null ? 'Nothing planned yet' : `${Math.round(totals.hourRate * 100)}% of planned time`}
        />
        <StatTile
          icon={TrendIcon}
          label="Completion rate"
          value={totals.completionRate === null ? '—' : Math.round(totals.completionRate * 100)}
          unit={totals.completionRate === null ? '' : '%'}
          tone={totals.completionRate !== null && totals.completionRate >= 0.7 ? 'good' : 'neutral'}
          hint={`${totals.doneCount} of ${totals.count} tasks`}
        />
        <StatTile
          icon={FocusIcon}
          label="Focus time"
          value={toHours(weekFocus.minutes)}
          unit="h"
          hint={`${weekFocus.count} round${weekFocus.count === 1 ? '' : 's'}`}
        />
      </div>

      <section>
        <BarChart rows={rows} label="Planned versus completed this week" />
      </section>

      <div className="chart-row divided-row">
        <section>
          <TagBars rows={byTag} label="Time by tag this week" />
        </section>

        <section>
          <div className="section-head">
            <h2 className="section-head__title">What this says</h2>
          </div>
          <ul className="notes-list">
            {totals.count === 0 ? (
              <li>Nothing scheduled this week yet.</li>
            ) : (
              <li>
                You planned <strong>{durationLabel(totals.plannedMin)}</strong> and completed{' '}
                <strong>{durationLabel(totals.completedMin)}</strong>
                {totals.hourRate !== null && <> — {Math.round(totals.hourRate * 100)}% of it.</>}
              </li>
            )}
            {weakest && (
              <li>
                <strong>{weakest.tag.name}</strong> is this week's weakest spot —{' '}
                {Math.round(weakest.rate * 100)}% of its planned time finished.
              </li>
            )}
            {weekFocusByTag.length > 0 && (
              <li>
                Most focus time went to <strong>{weekFocusByTag[0].tag.name}</strong> —{' '}
                {durationLabel(weekFocusByTag[0].minutes)} across {weekFocusByTag[0].count} round
                {weekFocusByTag[0].count === 1 ? '' : 's'}.
              </li>
            )}
          </ul>
        </section>
      </div>

      <section>
        <div className="section-head">
          <h2 className="section-head__title">Last 13 weeks</h2>
        </div>
        <HeatmapCalendar />
      </section>
    </div>
  )
}
