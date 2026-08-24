import { useSchedule } from '../state/ScheduleContext.jsx'
import { useNow } from '../lib/useNow.js'
import { rangeStats, dayStats, overdueTasks, summarize, tagBreakdown, upcomingTasks } from '../lib/stats.js'
import { durationLabel, formatDayLabel, relativeDayLabel, toHours, weekKeys, WEEKDAY_HEADERS } from '../lib/date.js'
import { StatTile } from './StatTile.jsx'
import { BarChart } from './BarChart.jsx'
import { TagBars } from './TagBars.jsx'
import { TaskRow } from './TaskRow.jsx'

export function Dashboard({ onFocusDay, onEdit, onCreate }) {
  const { tasks, tags, tasksByDate, tasksOn, inbox } = useSchedule()
  const now = useNow()

  const today = tasksOn(now.key)
  const todayTotals = dayStats(today)

  const keys = weekKeys(now.key)
  const rows = rangeStats(tasksByDate, keys).map((row, index) => ({
    ...row,
    short: WEEKDAY_HEADERS[index],
    label: formatDayLabel(row.key),
  }))
  const week = summarize(rows)

  const weekTasks = keys.flatMap((key) => tasksByDate.get(key) ?? [])
  const byTag = tagBreakdown(weekTasks, tags)

  const overdue = overdueTasks(tasks, now.key)
  const next = upcomingTasks(tasks, now.key, now.min, 3)
  const openInbox = inbox.filter((t) => !t.done).length

  return (
    <div className="dashboard">
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
        <button type="button" className="primary-button" onClick={() => onCreate?.({ date: now.key })}>
          Plan something for today
        </button>
      </section>

      <div className="tile-row">
        <StatTile
          label="Open today"
          value={todayTotals.openCount}
          hint={`${todayTotals.count} scheduled in total`}
        />
        <StatTile
          label="Overdue"
          value={overdue.length}
          tone={overdue.length > 0 ? 'critical' : 'neutral'}
          hint={overdue.length === 0 ? 'Nothing left behind' : 'Open, and the day has passed'}
        />
        <StatTile
          label="In the inbox"
          value={openInbox}
          hint={openInbox === 0 ? 'All captured work is scheduled' : 'Waiting for a slot'}
        />
        <StatTile
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

      <div className="chart-row">
        <section className="card">
          <BarChart rows={rows} label="This week's hours" />
        </section>
        <section className="card">
          <TagBars rows={byTag} label="Time by tag this week" />
        </section>
      </div>
    </div>
  )
}
