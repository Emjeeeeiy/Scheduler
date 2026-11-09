
/** One skeleton per page, each drawn in that page's own layout.
 *
 * The rule this file exists to satisfy: a loading state should show the shape
 * of the thing that is arriving. A generic stack of grey bars is honest about
 * nothing — the reader has already decided what the page looks like, and a
 * placeholder that contradicts it makes the load feel longer than it is. So
 * every skeleton here reuses the *real* class names of the view it stands in
 * for (`.dashboard__top`, `.tile-row`, `.gutter`, `.month__grid`, …), which
 * means the app's existing CSS does the layout and there is no second set of
 * measurements to drift out of sync with the first.
 *
 * Two call sites, one component:
 *   - AppShell, while the schedule is loading (App.jsx's `loading` branch) —
 *     it knows the exact `view`, so the match is exact.
 *   - SessionSkeleton, while the session check runs (the Gate). It only knows
 *     the configured landing view, so the match is a good guess rather than a
 *     promise — which is why the rail is drawn there and not here.
 *
 * Every block inside is aria-hidden and the wrapper announces the status, so a
 * screen reader hears "Loading your schedule" and nothing else: the skeleton is
 * furniture, and reading its geometry out loud would be noise.
 */

/* Repetition counts are the real ones where the real view fixes them — seven
   days, seven weekday headers, four stat tiles, three hero facts, four trend
   figures, thirty-five mini-calendar cells — so the block lands at the same size
   and the swap shifts nothing.
   Counts that depend on data (how many tasks, how many tags) are the shape the
   view tends to open at, because a skeleton that resizes as it loads is the
   exact jump this is meant to avoid. */
const DAYS = 7
const MINI_CAL_CELLS = 35
const MINI_CAL_DOW = 7
const MONTH_DOW = 7
const MONTH_WEEKS = 5
const MONTH_CELLS = 7
const STAT_TILES = 4
const HERO_FACTS = 3
const TREND_FIGURES = 4
const FOCUS_FIGURES = 3
const QUEUE_ROWS = 3
const TILE_ROWS = 3
const HOUR_MARKS = 9
const GRID_HEIGHT = 620
const TAG_BARS = 4
const NOTES = 3
const BAR_COLUMNS = 7

/** StatTile's own shape (label + icon, big number, hint) at the height the
    real tile occupies. */
function TileSkeleton() {
  return (
    <div className="stat-tile">
      <div className="stat-tile__head">
        <span className="skel skel--tile-label" />
        <span className="skel skel--icon" />
      </div>
      <p className="stat-tile__value">
        <span className="skel skel--tile-value" />
      </p>
      <p className="stat-tile__hint">
        <span className="skel skel--tile-hint" />
      </p>
    </div>
  )
}

/** `section-head` in both its forms: with a sub-line (view titles) and with
    only a title (the queue and notes sections). */
function SectionHeadSkeleton({ sub = false, trailing = false }) {
  return (
    <div className="section-head">
      <div>
        <h2 className="section-head__title">
          <span className="skel skel--section-title" />
        </h2>
        {sub && (
          <p className="section-head__sub">
            <span className="skel skel--section-sub" />
          </p>
        )}
      </div>
      {trailing && <span className="skel skel--ghost-button" />}
    </div>
  )
}

/** One row of a task list, in TaskRow's own markup — the checkbox slot, the
    body with its title row, and the meta line underneath. Reusing those classes
    is what keeps the row the height the real one is; a flat bar of the right
    height would still be visibly the wrong thing. */
function TaskRowSkeleton() {
  return (
    <li className="task-row">
      <span className="task-row__check skel skel--checkbox" />
      <div className="task-row__body">
        <span className="task-row__title-row">
          <span className="task-row__title skel skel--task-title" />
        </span>
        <span className="task-row__meta">
          <span className="skel skel--task-when" />
        </span>
      </div>
    </li>
  )
}

/** A task list of the length the section usually opens at. */
function TaskListSkeleton({ count = QUEUE_ROWS }) {
  return (
    <ul>
      {Array.from({ length: count }, (_, i) => (
        <TaskRowSkeleton key={i} />
      ))}
    </ul>
  )
}

/** The hour gutter beside a time grid, and the day columns it labels. */
function GridSkeleton({ days }) {
  return (
    <>
      <div className="gutter">
        {Array.from({ length: HOUR_MARKS }, (_, i) => (
          <div key={i} className="gutter__mark">
            <span className="skel skel--gutter-mark" />
          </div>
        ))}
      </div>
      <div className="grid-columns" style={{ height: `${GRID_HEIGHT}px` }}>
        {Array.from({ length: days }, (_, i) => (
          <div key={i} className="day-column">
            <div className="day-column__surface skel skel--column" />
          </div>
        ))}
      </div>
    </>
  )
}

/** BarChart's own frame: axis ticks, gridlines, and one band per day — so the
    plot arrives at the right height rather than as a flat rectangle. */
function ChartSkeleton() {
  return (
    <figure className="chart">
      <figcaption className="chart__title">
        <span className="skel skel--chart-title" />
      </figcaption>
      <div className="chart__body">
        <div className="chart__axis">
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className="chart__tick">
              <span className="skel skel--axis-tick" />
            </span>
          ))}
        </div>
        <div className="chart__plot">
          <div className="chart__columns">
            {Array.from({ length: BAR_COLUMNS }, (_, i) => (
              <div key={i} className="chart__band">
                {/* Varied heights, because seven identical bars read as a
                    placeholder and a row of uneven ones reads as a chart. */}
                <span
                  className="chart__bar skel"
                  style={{ height: `${[52, 78, 34, 64, 88, 46, 70][i]}%` }}
                />
                <span className="chart__label">
                  <span className="skel skel--chart-label" />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </figure>
  )
}

/** TagBars' real markup, so the three-part row (dot + name, track, value)
    keeps its proportions. */
function TagBarsSkeleton() {
  return (
    <figure className="chart">
      <figcaption className="chart__title">
        <span className="skel skel--chart-title" />
      </figcaption>
      <ul className="tag-bars">
        {Array.from({ length: TAG_BARS }, (_, i) => (
          <li key={i} className="tag-bars__row">
            <span className="tag-bars__name">
              <span className="skel skel--dot" />
              <span className="skel skel--tag-name" />
            </span>
            <span className="tag-bars__track">
              <span
                className="tag-bars__fill skel"
                style={{ width: `${[88, 62, 74, 45][i]}%` }}
              />
            </span>
            <span className="tag-bars__value">
              <span className="skel skel--tag-value" />
            </span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

/** Dashboard: the hero and mini-calendar across the top, then the two task
    queues, then the head and figures of Trends. */
function DashboardSkeleton() {
  return (
    <div className="view-skeleton dashboard frame stack">
      <div className="dashboard__top divided-row">
        <section className="hero">
          <div className="hero__head">
            <div className="hero__figure">
              <p className="hero__label">
                <span className="skel skel--hero-label" />
              </p>
              <p className="hero__value">
                <span className="skel skel--hero-value" />
                <span className="hero__unit">
                  <span className="skel skel--hero-unit" />
                </span>
              </p>
            </div>
            <span className="skel skel--pixeltype" />
          </div>
          <div className="hero__load">
            <span className="hero__load-track">
              <span className="hero__load-fill skel" />
            </span>
            <p className="hero__load-note">
              <span className="skel skel--hero-note" />
            </p>
          </div>
          <div className="hero__foot">
            <dl className="hero__facts">
              {Array.from({ length: HERO_FACTS }, (_, i) => (
                <div key={i} className="hero__fact">
                  <dt>
                    <span className="skel skel--fact-label" />
                  </dt>
                  <dd>
                    <span className="skel skel--fact-value" />
                  </dd>
                </div>
              ))}
            </dl>
            <span className="skel skel--primary-button" />
          </div>
        </section>

        <section className="mini-cal">
          <div className="mini-cal__head">
            <span className="skel skel--mini-label" />
            <div className="mini-cal__nav">
              <span className="skel skel--icon" />
              <span className="skel skel--icon" />
            </div>
          </div>
          <div className="mini-cal__dow">
            {Array.from({ length: MINI_CAL_DOW }, (_, i) => (
              <span key={i}>
                <span className="skel skel--dow-letter" />
              </span>
            ))}
          </div>
          <div className="mini-cal__grid">
            {Array.from({ length: MINI_CAL_CELLS }, (_, i) => (
              <span key={i} className="skel skel--cal-cell" />
            ))}
          </div>
        </section>
      </div>

      <div className="queue-row divided-row">
        <section>
          <SectionHeadSkeleton />
          <TaskListSkeleton />
        </section>
        <section>
          <SectionHeadSkeleton trailing />
          <TaskListSkeleton />
        </section>
      </div>

      <section className="trends">
        <div className="trends__head">
          <div className="trends__intro">
            <h2 className="section-head__title">
              <span className="skel skel--section-title" />
            </h2>
            <p className="trends__takeaway">
              <span className="skel skel--takeaway" />
            </p>
          </div>
          <span className="skel skel--ghost-button" />
        </div>
        <dl className="figures">
          {Array.from({ length: TREND_FIGURES }, (_, i) => (
            <div key={i} className="figure">
              <dt>
                <span className="skel skel--tile-label" />
              </dt>
              <dd>
                <span className="skel skel--tile-value" />
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}

/** Day: the section head with its Grid/Agenda switch, the now/next line under
    it, then a single-column time grid. */
function TodaySkeleton() {
  return (
    <div className="view-skeleton day-layout frame">
      <section className="day-panel">
        <div className="section-head">
          <div>
            <h2 className="section-head__title">
              <span className="skel skel--section-title skel--section-title--wide" />
            </h2>
            <p className="section-head__sub">
              <span className="skel skel--section-sub" />
            </p>
          </div>
          <div className="day-panel__controls">
            <div className="filter-row">
              <span className="skel skel--chip skel--chip--on" />
              <span className="skel skel--chip" />
            </div>
          </div>
        </div>

        <div className="now-next">
          <span className="skel skel--now-dot" />
          <span className="skel skel--now-label" />
          <span className="skel skel--now-task" />
          <span className="skel skel--now-time" />
        </div>

        <div className="grid-scroll">
          <div className="grid-body grid-body--single">
            <GridSkeleton days={1} />
          </div>
        </div>
      </section>
    </div>
  )
}

/** Week: the summary line, the seven day headers with their load tracks, the
    all-day lane, then seven columns. */
function WeekSkeleton() {
  return (
    <section className="view-skeleton frame week">
      <p className="week__summary">
        <span className="skel skel--week-summary" />
      </p>

      <div className="grid-scroll">
        <div className="week__inner">
          <div className="week__head">
            <div className="gutter-spacer" />
            {Array.from({ length: DAYS }, (_, i) => (
              <div key={i} className="week__day">
                <span className="week__dow">
                  <span className="skel skel--dow-letter skel--dow-letter--wide" />
                </span>
                <span className="week__date">
                  <span className="skel skel--week-date" />
                </span>
                <span className="week__load-track">
                  <span className="skel skel--week-load" />
                </span>
              </div>
            ))}
          </div>

          <div className="week__allday" style={{ '--lanes': 1 }}>
            <span className="gutter-spacer all-day__label" />
            <div className="week__allday-track">
              <div className="week__allday-cells">
                {Array.from({ length: DAYS }, (_, i) => (
                  <div key={i} className="week__allday-cell">
                    <span className="skel skel--allday-chip" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid-body">
            <GridSkeleton days={DAYS} />
          </div>
        </div>
      </div>
    </section>
  )
}

/** Month: seven weekday headers over a five-by-seven grid of day cells, each
    with its date number and a couple of chip slots. */
function MonthSkeleton() {
  return (
    <section className="view-skeleton frame month">
      <div className="month__head">
        {Array.from({ length: MONTH_DOW }, (_, i) => (
          <span key={i} className="month__dow">
            <span className="skel skel--dow-letter skel--dow-letter--wide" />
          </span>
        ))}
      </div>

      <div className="month__grid">
        {Array.from({ length: MONTH_WEEKS }, (_, week) => (
          <div key={week} className="month__week" style={{ '--lanes': 2 }}>
            {Array.from({ length: MONTH_CELLS }, (_, day) => (
              <div key={day} className="month__cell">
                <div className="month__cell-head">
                  <span className="skel skel--daynum" />
                </div>
                <div className="month__lane-spacer" />
                <ul className="month__chips">
                  {Array.from({ length: TILE_ROWS }, (_, chip) => (
                    <li key={chip}>
                      <span
                        className="skel skel--month-chip"
                        style={{ width: `${[88, 70, 82][chip]}%` }}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

/** Review: the four headline tiles, the week bar chart, then time-by-tag
    beside the prose notes. */
function ReviewSkeleton() {
  return (
    <div className="view-skeleton review frame stack">
      <div className="section-head">
        <div>
          <h2 className="section-head__title">
            <span className="skel skel--section-title" />
          </h2>
          <p className="section-head__sub">
            <span className="skel skel--section-sub" />
          </p>
        </div>
      </div>

      <div className="tile-row divided-row">
        {Array.from({ length: STAT_TILES }, (_, i) => (
          <TileSkeleton key={i} />
        ))}
      </div>

      <section>
        <ChartSkeleton />
      </section>

      <div className="chart-row divided-row">
        <section>
          <TagBarsSkeleton />
        </section>
        <section>
          <div className="section-head">
            <h2 className="section-head__title">
              <span className="skel skel--section-title skel--section-title--wide" />
            </h2>
          </div>
          <ul className="notes-list">
            {Array.from({ length: NOTES }, (_, i) => (
              <li key={i}>
                <span className="skel skel--note" style={{ width: `${[96, 78, 88][i]}%` }} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

/** Focus: the timer band (the phase and its pips, the digits beside the dial, the
    controls), then the task, then three figures. */
function FocusSkeleton() {
  return (
    <div className="view-skeleton focus-page frame stack">
      <section className="focus__timer">
        <div className="focus__head">
          <div className="focus__heading">
            <h2 className="section-head__title focus__phase">
              <span className="skel skel--phase" />
            </h2>
            <p className="focus__round">
              <span className="skel skel--pips" />
            </p>
          </div>
          <span className="skel skel--ghost-button" />
        </div>
        <div className="focus__readout">
          <p className="focus__clock">
            <span className="skel skel--clock" />
          </p>
          <span className="skel skel--dial" />
        </div>
        <div className="focus__controls">
          <span className="skel skel--primary-button skel--primary-button--lg" />
          <span className="skel skel--ghost-button skel--ghost-button--tall" />
        </div>
      </section>

      <section className="focus__tasks">
        <span className="field__label skel skel--field-label" />
        <div className="focus__task-picker">
          <span className="skel skel--input" />
        </div>
      </section>

      <section className="focus__stats">
        <dl className="figures">
          {Array.from({ length: FOCUS_FIGURES }, (_, i) => (
            <div key={i} className="figure">
              <dt>
                <span className="skel skel--tile-label" />
              </dt>
              <dd>
                <span className="skel skel--tile-value" />
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}

/** Journal: the list of notes beside the page they open onto. The list rows and
    the sheet are plain blocks — what is in them depends on the account. */
function JournalSkeleton() {
  return (
    <div className="view-skeleton frame stack">
      <div className="journal-skel">
        <div className="journal-skel__list">
          <div className="note-list__head">
            <h2 className="section-head__title">
              <span className="skel skel--section-title" />
            </h2>
            <span className="skel journal-skel__action" />
          </div>
          <span className="skel skel--input" />
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} className="skel journal-skel__row" />
          ))}
        </div>
        <div className="journal-skel__page">
          <span className="skel skel--section-title skel--section-title--wide" />
          <span className="skel skel--input" />
          <span className="skel journal-skel__sheet" />
        </div>
      </div>
    </div>
  )
}

/** Settings: the page title, the side navigation (seven categories), and the
    first panel — General — with the three rows every account has in it. On a
    phone only the list of categories is shown (the page opens there; see
    `data-mobile-screen` in SettingsView), so that is what the skeleton draws
    there too. The
    optional rows (Templates, Install) are left out, since whether they exist
    isn't knowable this early and a skeleton that guessed would promise a row
    that might not arrive. Which category opens is remembered, but the panel
    drawn is always General's shape: the rows are a plausible placeholder, and
    the navigation is what carries the layout. */
function SettingsSkeleton() {
  return (
    <div className="view-skeleton settings-page frame stack" data-mobile-screen="list">
      <div className="section-head">
        <h2 className="section-head__title">
          <span className="skel skel--section-title" />
        </h2>
      </div>

      <div className="settings-layout divided-row">
        <nav className="settings-nav">
          {Array.from({ length: 7 }, (_, item) => (
            <span key={item} className="skel skel--field-label" />
          ))}
        </nav>

        <section className="settings-panel">
          <div className="settings-panel__rows">
            {Array.from({ length: 3 }, (_, row) => (
              <div key={row} className="settings-row">
                <div className="settings-row__text">
                  <span className="skel skel--section-title" />
                  <span className="skel skel--section-sub" />
                </div>
                <div className="settings-row__control">
                  <span className="skel skel--ghost-button" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

const SKELETONS = {
  dashboard: DashboardSkeleton,
  today: TodaySkeleton,
  week: WeekSkeleton,
  month: MonthSkeleton,
  review: ReviewSkeleton,
  focus: FocusSkeleton,
  journal: JournalSkeleton,
  settings: SettingsSkeleton,
}

/**
 * The loading state for one page. `view` is a view id (see NAV_ITEMS and
 * SCHEDULE_TABS in App.jsx); anything unrecognised falls back to the dashboard,
 * which is also where the app lands by default.
 */
export function ViewSkeleton({ view, label = 'Loading your schedule' }) {
  const Skeleton = SKELETONS[view] ?? DashboardSkeleton
  return (
    <div role="status" aria-label={label}>
      <Skeleton />
    </div>
  )
}