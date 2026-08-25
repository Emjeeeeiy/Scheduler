import { useState } from 'react'
import { useSchedule } from '../state/ScheduleContext.jsx'
import { useNow } from '../lib/useNow.js'
import {
  dayStats,
  overdueTasks,
  rangeStats,
  summarize,
  tagBreakdown,
  upcomingTasks,
  weakestTag,
} from '../lib/stats.js'
import {
  addDays,
  dayOfMonth,
  durationLabel,
  formatDayLabel,
  lastNDays,
  relativeDayLabel,
  toHours,
  weekKeys,
} from '../lib/date.js'
import { StatTile } from './StatTile.jsx'
import { BarChart } from './BarChart.jsx'
import { TagBars } from './TagBars.jsx'
import { TaskRow } from './TaskRow.jsx'
import { MiniCalendar } from './MiniCalendar.jsx'
import { CheckIcon, ClockIcon, DayIcon, InboxIcon, TrendIcon, WarningIcon } from './icons.jsx'

/* Repeats land at least weekly, so two weeks of expansion always contains the
   next one — enough for "Next up" without walking the calendar forever. */
const UPCOMING_HORIZON_DAYS = 15

const RANGES = [
  { id: 7, label: 'Last 7 days' },
  { id: 30, label: 'Last 30 days' },
]

export function Dashboard({ onFocusDay, onFocusMonth, onEdit, onCreate }) {
  const { tasks, tags, tasksOn, occurrencesOn, inbox } = useSchedule()
  const now = useNow()
  const [days, setDays] = useState(7)

  const today = tasksOn(now.key)
  const todayTotals = dayStats(today)

  const week = summarize(rangeStats(tasksOn, weekKeys(now.key)))

  const overdue = overdueTasks(tasks, now.key)
  /* Stored tasks reach as far ahead as they were scheduled, so they go in
     whole; occurrences only exist once expanded, so they come from the
     horizon. */
  const horizon = Array.from({ length: UPCOMING_HORIZON_DAYS }, (_, i) =>
    occurrencesOn(addDays(now.key, i)),
  )
  const next = upcomingTasks([...tasks, ...horizon.flat()], now.key, now.min, 3)
  const openInbox = inbox.filter((t) => !t.done).length

  // Trends: the range picked here drives the chart, the tag breakdown, and
  // the insights below it together, so they always describe the same window.
  const rangeKeys = lastNDays(now.key, days)
  const rangeRows = rangeStats(tasksOn, rangeKeys).map((row, index) => ({
    ...row,
    // At 30 columns every label would collide, so thin them out and let the
    // tooltip and table carry the exact day.
    short:
      days <= 7 || index % 5 === 0 || index === rangeKeys.length - 1
        ? String(dayOfMonth(row.key))
        : '',
    label: formatDayLabel(row.key),
  }))
  const rangeTotals = summarize(rangeRows)
  const rangeTasks = rangeKeys.flatMap(tasksOn)
  const rangeByTag = tagBreakdown(rangeTasks, tags)
  const weakest = weakestTag(rangeTasks, tags)
  const activeDays = rangeRows.filter((row) => row.plannedMin > 0).length

  return (
    <div className="dashboard">
      <div className="dashboard__top">
        <section className="card hero" aria-label="Today at a glance">
          <p className="hero__label">Planned today</p>
          <p className="hero__value">
            {toHours(todayTotals.plannedMin)}
            <span className="hero__unit">h</span>
          </p>
          <p className="hero__hint">
            {todayTotals.count === 0
              ? 'Nothing on the books yet.'
              : `${todayTotals.openCount} open · ${todayTotals.doneCount} done · ${durationLabel(
                  todayTotals.remainingMin,
                )} left to work through`}
          </p>
          <button
            type="button"
            className="primary-button"
            onClick={() => onCreate?.({ date: now.key })}
          >
            Plan something for today
          </button>
        </section>

        <MiniCalendar onFocusDay={onFocusDay} onFocusMonth={onFocusMonth} />
      </div>

      <div className="tile-row">
        <StatTile
          icon={DayIcon}
          label="Open today"
          value={todayTotals.openCount}
          hint={`${todayTotals.count} scheduled in total`}
        />
        <StatTile
          icon={WarningIcon}
          label="Overdue"
          value={overdue.length}
          tone={overdue.length > 0 ? 'critical' : 'neutral'}
          hint={overdue.length === 0 ? 'Nothing left behind' : 'Open, and the day has passed'}
        />
        <StatTile
          icon={InboxIcon}
          label="In the inbox"
          value={openInbox}
          hint={openInbox === 0 ? 'All captured work is scheduled' : 'Waiting for a slot'}
        />
        <StatTile
          icon={CheckIcon}
          label="Done this week"
          value={week.completionRate === null ? '—' : Math.round(week.completionRate * 100)}
          unit={week.completionRate === null ? '' : '%'}
          hint={`${week.doneCount} of ${week.count} tasks`}
        />
      </div>

      <section className="card" aria-label="Next up">
        <div className="section-head">
          <h2 className="section-head__title">Next up</h2>
        </div>
        {next.length === 0 ? (
          <p className="empty empty--sm">Nothing scheduled ahead. Enjoy the clear run.</p>
        ) : (
          <ul>
            {next.map((task) => (
              <TaskRow key={task.id} task={task} onEdit={onEdit} showDate />
            ))}
          </ul>
        )}
      </section>

      {overdue.length > 0 && (
        <section className="card" aria-label="Overdue">
          <div className="section-head">
            <h2 className="section-head__title">
              Overdue <span className="count-pill count-pill--critical">{overdue.length}</span>
            </h2>
            <button
              type="button"
              className="ghost-button ghost-button--sm"
              onClick={() => onFocusDay(overdue[0].date)}
            >
              Go to {relativeDayLabel(overdue[0].date)}
            </button>
          </div>
          <ul>
            {overdue.slice(0, 5).map((task) => (
              <TaskRow key={task.id} task={task} onEdit={onEdit} showDate />
            ))}
          </ul>
        </section>
      )}

      <div className="section-head">
        <h2 className="section-head__title">Trends</h2>
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
      </div>

      <div className="tile-row">
        <StatTile
          icon={ClockIcon}
          label="Hours planned"
          value={toHours(rangeTotals.plannedMin)}
          unit="h"
          hint={`across ${activeDays} active day${activeDays === 1 ? '' : 's'}`}
        />
        <StatTile
          icon={CheckIcon}
          label="Hours completed"
          value={toHours(rangeTotals.completedMin)}
          unit="h"
          hint={
            rangeTotals.hourRate === null
              ? 'Nothing planned yet'
              : `${Math.round(rangeTotals.hourRate * 100)}% of planned time`
          }
        />
        <StatTile
          icon={CheckIcon}
          label="Tasks done"
          value={rangeTotals.doneCount}
          hint={`of ${rangeTotals.count} scheduled`}
        />
        <StatTile
          icon={TrendIcon}
          label="Completion rate"
          value={rangeTotals.completionRate === null ? '—' : Math.round(rangeTotals.completionRate * 100)}
          unit={rangeTotals.completionRate === null ? '' : '%'}
          tone={
            rangeTotals.completionRate !== null && rangeTotals.completionRate >= 0.7 ? 'good' : 'neutral'
          }
          hint="Share of scheduled tasks ticked off"
        />
      </div>

      <section className="card">
        <BarChart
          rows={rangeRows}
          label={`Planned versus completed — last ${days} days`}
          emptyText="Nothing scheduled in this range yet."
        />
      </section>

      <div className="chart-row">
        <section className="card">
          <TagBars rows={rangeByTag} label={`Time by tag — last ${days} days`} />
        </section>

        <section className="card">
          <div className="section-head">
            <h2 className="section-head__title">What this says</h2>
          </div>
          <ul className="notes-list">
            <li>
              You planned <strong>{durationLabel(rangeTotals.plannedMin)}</strong> and completed{' '}
              <strong>{durationLabel(rangeTotals.completedMin)}</strong>
              {rangeTotals.hourRate !== null && <> — {Math.round(rangeTotals.hourRate * 100)}% of it.</>}
            </li>
            {activeDays > 0 && (
              <li>
                That averages{' '}
                <strong>{toHours(rangeTotals.plannedMin / activeDays)}h</strong> on the days you
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
            {rangeTotals.count === 0 && <li>Schedule a few tasks and this fills in.</li>}
          </ul>
        </section>
      </div>
    </div>
  )
}
