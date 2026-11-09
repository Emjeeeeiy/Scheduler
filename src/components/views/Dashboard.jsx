import { useState } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useSettings } from '../../state/SettingsContext.jsx'
import { useNow } from '../../lib/useNow.js'
import {
  HEAVY_DAY_MIN,
  bestDayOfWeek,
  dayStats,
  isSeriesTemplate,
  overdueTasks,
  rangeStats,
  rollUpTags,
  summarize,
  tagBreakdown,
  upcomingTasks,
} from '@cadence/shared/stats.js'
import {
  DAY_LONG,
  addDays,
  dayOfMonth,
  durationLabel,
  formatDayLabel,
  lastNDays,
  relativeDayLabel,
  toHours,
  weekKeys,
} from '@cadence/shared/date.js'
import { BarChart } from '../stats/BarChart.jsx'
import { TagBars } from '../stats/TagBars.jsx'
import { TaskRow } from '../calendar/TaskRow.jsx'
import { MiniCalendar } from '../calendar/MiniCalendar.jsx'
import { PixelType } from './PixelType.jsx'

/* Repeats land at least weekly, so two weeks of expansion always contains the
   next one — enough for "Next up" without walking the calendar forever. */
const UPCOMING_HORIZON_DAYS = 15

/* The overdue pile is a prompt to deal with it, not the place to do it all:
   three rows say how bad it is, and the count beside the title and the "Go to"
   button reach the rest. */
const OVERDUE_ROWS = 3

/* The tag breakdown shares a column with the chart, so it shows the few tags
   that carry the time; the tail folds into "Other". */
const TREND_TAG_ROWS = 5

const RANGES = [
  { id: 7, label: 'Last 7 days' },
  { id: 30, label: 'Last 30 days' },
]

/**
 * The Dashboard is three bands, read top to bottom, and nothing else:
 *   1. Today — the hero (one figure, one action) beside the month at a glance.
 *   2. Up next — Next up, and Overdue / Pinned when there are any.
 *   3. Trends — planned versus completed over a range, the loop PRODUCT.md
 *      principle 3 closes.
 * Counts that used to be tiles of their own live where they belong: today's
 * open/done/left in the hero, the inbox beside Next up, overdue in its list.
 */
export function Dashboard({ onFocusDay, onFocusMonth, onEdit, onCreate }) {
  const { tasks, tags, tasksOn, occurrencesOn, inbox } = useSchedule()
  const { settings } = useSettings()
  const now = useNow()
  const [days, setDays] = useState(7)

  const today = tasksOn(now.key)
  const todayTotals = dayStats(today)

  const weekKeysList = weekKeys(now.key, settings.weekStartsOn)
  const weekByTag = tagBreakdown(weekKeysList.flatMap(tasksOn), tags)
  const goalTags = tags.filter((t) => t.goalMinutes)

  const overdue = overdueTasks(tasks, now.key)
  /* Stored tasks reach as far ahead as they were scheduled, so they go in
     whole; occurrences only exist once expanded, so they come from the
     horizon. */
  const horizon = Array.from({ length: UPCOMING_HORIZON_DAYS }, (_, i) =>
    occurrencesOn(addDays(now.key, i)),
  )
  const next = upcomingTasks([...tasks, ...horizon.flat()], now.key, now.min, 3)
  const openInbox = inbox.filter((t) => !t.done).length
  // Pinned surfaces regardless of date — a deliberate exception to every
  // other section here, which is built around "when." A repeating task's
  // own rule document is never itself "on" a day (see isSeriesTemplate in
  // stats.js), so it has no business in a dated pinned list either.
  const pinned = tasks.filter((t) => t.pinned && !t.done && !isSeriesTemplate(t))

  /* Today's load against the same 10-hour reference the week bar, month strip,
     and mini calendar all scale to — the hero states the number, this says how
     full the day that number describes actually is. */
  const heavyToday = todayTotals.plannedMin > HEAVY_DAY_MIN
  const loadPct = Math.min(100, Math.round((todayTotals.plannedMin / HEAVY_DAY_MIN) * 100))

  // Trends: the range picked here drives the chart, the figures, the tag
  // breakdown, and the takeaway together, so they always describe one window.
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
  /* Rolled up to top-level tags: a nested tag's hours belong to the thing it
     files under, and charting both would draw the same time twice. The
     weekly-goal bars deliberately don't roll up — a goal is set on one
     specific tag, so it is measured against that tag's own hours. */
  const rangeByTag = rollUpTags(tagBreakdown(rangeTasks, tags), tags)
  const best = bestDayOfWeek(rangeRows)
  const completionPct =
    rangeTotals.completionRate === null ? null : Math.round(rangeTotals.completionRate * 100)

  return (
    <div className="dashboard frame stack">
      <div className="dashboard__top divided-row">
        {/* Three zones anchored top and bottom rather than one stack piled at
            the top: the figure, then the day's load, then a footer pairing the
            day's breakdown with its one action. The load bar carries the
            auto margin, so the lower two travel to the bottom together. */}
        <section className="hero" aria-label="Today at a glance">
          <div className="hero__head">
            <div className="hero__figure">
              <p className="hero__label">Planned today</p>
              <p className="hero__value">
                {toHours(todayTotals.plannedMin)}
                <span className="hero__unit">h</span>
              </p>
            </div>
            <PixelType hourMin={now.min} />
          </div>

          <div className="hero__load">
            <span className="hero__load-track" aria-hidden="true">
              <span
                className={`hero__load-fill${heavyToday ? ' hero__load-fill--heavy' : ''}`}
                style={{ width: `${loadPct}%` }}
              />
            </span>
            {/* The track is decorative; this line is the accessible readout. */}
            <p className="hero__load-note">
              {heavyToday ? 'Over a 10-hour day' : `${loadPct}% of a 10-hour day`}
            </p>
          </div>

          <div className="hero__foot">
            {todayTotals.count === 0 ? (
              <p className="hero__hint">Nothing on the books yet.</p>
            ) : (
              <dl className="hero__facts">
                <div className="hero__fact">
                  <dt>Open</dt>
                  <dd>{todayTotals.openCount}</dd>
                </div>
                <div className="hero__fact">
                  <dt>Done</dt>
                  <dd>{todayTotals.doneCount}</dd>
                </div>
                <div className="hero__fact">
                  <dt>Left</dt>
                  <dd>{durationLabel(todayTotals.remainingMin)}</dd>
                </div>
              </dl>
            )}
            <button
              type="button"
              className="primary-button"
              onClick={() => onCreate?.({ date: now.key })}
            >
              Plan something for today
            </button>
          </div>
        </section>

        <MiniCalendar onFocusDay={onFocusDay} onFocusMonth={onFocusMonth} />
      </div>

      {/* The queues side by side, one row of one to three columns. Next up leads
          because it is always there — a column that keeps its place is easier to
          read than one that slides left whenever nothing is overdue. Overdue and
          Pinned join it when they exist; `.divided-row` rules off only the
          siblings that are actually rendered. */}
      <div className="queue-row divided-row">
        <section aria-label="Next up">
          <div className="section-head">
            <h2 className="section-head__title">Next up</h2>
            {openInbox > 0 && <span className="section-head__meta">{openInbox} in the inbox</span>}
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
          <section aria-label="Overdue">
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
              {overdue.slice(0, OVERDUE_ROWS).map((task) => (
                <TaskRow key={task.id} task={task} onEdit={onEdit} showDate showQuickActions />
              ))}
            </ul>
          </section>
        )}

        {pinned.length > 0 && (
          <section aria-label="Pinned">
            <div className="section-head">
              <h2 className="section-head__title">Pinned</h2>
            </div>
            <ul>
              {pinned.map((task) => (
                <TaskRow key={task.id} task={task} onEdit={onEdit} showDate />
              ))}
            </ul>
          </section>
        )}
      </div>

      <section className="trends" aria-label="Trends">
        <div className="trends__head">
          <div className="trends__intro">
            <h2 className="section-head__title">Trends</h2>
            {/* One sentence, not a list: what the range says at a glance. The
                longer reading — weakest tag, where to put the postponed work —
                lives on the Review page. */}
            <p className="trends__takeaway">
              {rangeTotals.count === 0 ? (
                'Schedule a few tasks and this fills in.'
              ) : (
                <>
                  You planned <strong>{durationLabel(rangeTotals.plannedMin)}</strong> and completed{' '}
                  <strong>{durationLabel(rangeTotals.completedMin)}</strong>
                  {rangeTotals.hourRate !== null && <> — {Math.round(rangeTotals.hourRate * 100)}% of it</>}.
                  {best && best.rate > 0 && (
                    <>
                      {' '}
                      <strong>{DAY_LONG[best.day]}</strong> is where you follow through most.
                    </>
                  )}
                </>
              )}
            </p>
          </div>
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

        {/* Nothing scheduled in the range: the takeaway above already says so, and
            four zeros over two empty panels would only repeat it. */}
        {rangeTotals.count > 0 && (
          <>
            {/* Figures, not tiles: a label and a number each, with no icon, hint, or
                rule of their own. The chart below is where the detail lives. */}
            <dl className="figures">
              <div className="figure">
                <dt>Planned</dt>
                <dd>
                  {toHours(rangeTotals.plannedMin)}
                  <span className="figure__unit">h</span>
                </dd>
              </div>
              <div className="figure">
                <dt>Completed</dt>
                <dd>
                  {toHours(rangeTotals.completedMin)}
                  <span className="figure__unit">h</span>
                </dd>
              </div>
              <div className="figure">
                <dt>Tasks done</dt>
                <dd>
                  {rangeTotals.doneCount}
                  <span className="figure__of">/ {rangeTotals.count}</span>
                </dd>
              </div>
              <div
                className={`figure${
                  rangeTotals.completionRate !== null && rangeTotals.completionRate >= 0.7
                    ? ' figure--good'
                    : ''
                }`}
              >
                <dt>Completion rate</dt>
                <dd>
                  {completionPct === null ? '—' : completionPct}
                  {completionPct !== null && <span className="figure__unit">%</span>}
                </dd>
              </div>
            </dl>

            <div className="trends__body">
              <BarChart
                rows={rangeRows}
                label="Planned vs completed"
                emptyText="Nothing scheduled in this range yet."
              />

              <div className="trends__aside">
                {goalTags.length > 0 && (
                  <figure className="chart">
                    <figcaption className="chart__title">Weekly goals — this week</figcaption>
                    <ul className="tag-bars">
                      {goalTags.map((tag) => {
                        const plannedMin = weekByTag.find((row) => row.id === tag.id)?.plannedMin ?? 0
                        const pct = Math.min(100, Math.round((plannedMin / tag.goalMinutes) * 100))
                        return (
                          <li key={tag.id} className="tag-bars__row">
                            <span className="tag-bars__name">
                              <span
                                className="tag-bars__dot"
                                style={{ background: tag.color }}
                                aria-hidden="true"
                              />
                              {tag.name}
                            </span>
                            <span className="tag-bars__track">
                              <span
                                className="tag-bars__fill"
                                style={{ width: `${pct}%`, background: tag.color }}
                              />
                            </span>
                            <span className="tag-bars__value">
                              {toHours(plannedMin)}h / {toHours(tag.goalMinutes)}h
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </figure>
                )}

                <TagBars rows={rangeByTag} label="Time by tag" maxRows={TREND_TAG_ROWS} />
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
