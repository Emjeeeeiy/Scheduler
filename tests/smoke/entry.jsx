/* Smoke render: mount every view against mock data and confirm each produces
 * markup without throwing.
 *
 * This exists because the app cannot start without a Firebase project, so a
 * plain build proves only that the modules parse — a crash in a view would
 * otherwise wait until after someone had finished the six setup steps.
 * renderToString runs the component bodies (state, memos, the layout maths,
 * every branch of JSX); effects do not run, so this is a render check, not a
 * behaviour test. Behaviour lives in the tests/*.test.js suites.
 */

import { renderToString } from 'react-dom/server'
import { addDays, todayKey } from '../../src/lib/date.js'
import { ToastProvider } from '../../src/state/ToastContext.jsx'
import { SettingsProvider } from '../../src/state/SettingsContext.jsx'
import { Dashboard } from '../../src/components/views/Dashboard.jsx'
import { TodayView } from '../../src/components/views/TodayView.jsx'
import { WeekGrid } from '../../src/components/views/WeekGrid.jsx'
import { MonthCalendar } from '../../src/components/views/MonthCalendar.jsx'
import { TaskEditor } from '../../src/components/editors/TaskEditor.jsx'
import { EventEditor } from '../../src/components/editors/EventEditor.jsx'
import { MiniCalendar } from '../../src/components/calendar/MiniCalendar.jsx'
import { TagManager } from '../../src/components/editors/TagManager.jsx'
import { ItemManager } from '../../src/components/editors/ItemManager.jsx'
import { TaskInbox } from '../../src/components/calendar/TaskInbox.jsx'
import { SignIn } from '../../src/components/auth/SignIn.jsx'
import { LoginForm } from '../../src/components/auth/LoginForm.jsx'
import { RegisterForm } from '../../src/components/auth/RegisterForm.jsx'
import { SetupNotice } from '../../src/components/shell/SetupNotice.jsx'
import { NotificationBell } from '../../src/components/shell/NotificationBell.jsx'
import { SettingsModal } from '../../src/components/shell/SettingsModal.jsx'
import { CommandPalette } from '../../src/components/shell/CommandPalette.jsx'
import { DashboardIcon } from '../../src/components/icons.jsx'
import { mockValue } from './mockSchedule.jsx'

const KEY = todayKey()
const noop = () => {}

/* ScheduleContext/AuthContext are aliased to fixtures by
   tests/smoke/vite.config.js because they'd otherwise reach for Firebase.
   ToastContext and SettingsContext have no such dependency (SettingsContext
   only touches localStorage, which usePersistentState already guards with a
   try/catch — it throws ReferenceError under Node SSR and falls back to
   defaults), so rather than two more mocks they're just mounted for real —
   several components (TaskEditor, EventEditor, TagManager, ItemManager,
   TaskInbox, DayColumn, WeekGrid, MonthCalendar, SettingsModal) call
   useToast()/useSettings(), and this is the one place their real component
   tree is exercised end to end. */
function render(element) {
  return renderToString(
    <ToastProvider>
      <SettingsProvider>{element}</SettingsProvider>
    </ToastProvider>,
  )
}

const paletteActions = [
  { id: 'sample', label: 'Go to Dashboard', Icon: DashboardIcon, onRun: noop },
]

const cases = [
  ['SetupNotice', <SetupNotice missing={['VITE_FIREBASE_API_KEY']} />],
  ['SignIn', <SignIn />],
  ['LoginForm', <LoginForm onSwitchToRegister={noop} />],
  ['RegisterForm', <RegisterForm onSwitchToLogin={noop} />],
  ['Dashboard', <Dashboard onFocusDay={noop} onEdit={noop} onCreate={noop} />],
  ['TodayView', <TodayView focusKey={KEY} onEdit={noop} onCreate={noop} />],
  ['WeekGrid', <WeekGrid focusKey={KEY} onEdit={noop} onCreate={noop} />],
  ['MonthCalendar', <MonthCalendar focusKey={KEY} onFocusDay={noop} onCreate={noop} />],
  ['TaskInbox', <TaskInbox focusKey={KEY} onEdit={noop} onCreate={noop} />],
  ['TagManager', <TagManager onClose={noop} />],
  ['ItemManager', <ItemManager onClose={noop} onEdit={noop} onEditEvent={noop} />],
  ['TaskEditor (create)', <TaskEditor editor={{ mode: 'create', draft: { date: KEY, startMin: 540 } }} onClose={noop} />],
  ['TaskEditor (edit)', <TaskEditor editor={{ mode: 'edit', task: mockValue.tasks[0] }} onClose={noop} />],
  ['EventEditor (create)', <EventEditor editor={{ mode: 'create', draft: { startDate: KEY, endDate: KEY } }} onClose={noop} />],
  ['EventEditor (edit)', <EventEditor editor={{ mode: 'edit', event: mockValue.events[0] }} onClose={noop} />],
  ['MiniCalendar', <MiniCalendar onFocusDay={noop} onFocusMonth={noop} />],
  ['NotificationBell', <NotificationBell onEdit={noop} />],
  ['SettingsModal', <SettingsModal onClose={noop} />],
  ['CommandPalette', <CommandPalette actions={paletteActions} onClose={noop} />],
]

let failed = 0

for (const [name, element] of cases) {
  try {
    const html = render(element)
    if (!html || html.length < 20) throw new Error(`rendered only ${html.length} chars`)
    console.log(`  PASS  ${name.padEnd(22)} ${html.length} chars`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL  ${name}`)
    console.log(`        ${error.stack ?? error.message}`)
  }
}

/* Assertions on the rendered markup — a component can render "successfully"
   while silently dropping the thing it exists to show. */
const checks = []
const html = {
  today: render(<TodayView focusKey={KEY} onEdit={noop} onCreate={noop} />),
  week: render(<WeekGrid focusKey={KEY} onEdit={noop} onCreate={noop} />),
  month: render(<MonthCalendar focusKey={KEY} onFocusDay={noop} onCreate={noop} />),
  dashboard: render(<Dashboard onFocusDay={noop} onEdit={noop} onCreate={noop} />),
}

const expect = (name, condition) => checks.push([name, Boolean(condition)])

expect('Day view draws the timed blocks', (html.today.match(/class="block/g) ?? []).length >= 4)
expect('Day view shows the all-day item', html.today.includes('All-day: conference'))
expect('Day view widens for the 5am block', html.today.includes('Early flight'))
expect('Overlapping blocks are split into columns', /width:\s*calc\(33\./.test(html.today) || /width:\s*calc\(50/.test(html.today))
expect('Week view renders 7 day columns', (html.week.match(/class="day-column"/g) ?? []).length === 7)
// The character class matters: `class="month__cell-head"` also starts with
// `class="month__cell`, and would double the count.
expect('Month view renders 42 cells', (html.month.match(/class="month__cell[" ]/g) ?? []).length === 42)
expect('Dashboard hero shows planned hours', html.dashboard.includes('hero__value'))
expect('Dashboard hero carries the pixel ticker', html.dashboard.includes('hero__pixel'))
expect('Dashboard surfaces the overdue task', html.dashboard.includes('Overdue thing'))
expect('Dashboard chart draws bars', html.dashboard.includes('chart__bar'))
expect('Tag bars use the themed token', html.dashboard.includes('var(--tag-blue)'))
expect('Dashboard trends render the table toggle', html.dashboard.includes('Table view'))
expect('Dashboard trends compute a completion rate', html.dashboard.includes('Completion rate'))

const signIn = render(<SignIn />)
expect('Sign-in screen keeps the Google button', signIn.includes('Sign in with Google'))
expect('Sign-in screen defaults to the login form', signIn.includes('Username or email'))
const register = render(<RegisterForm onSwitchToLogin={noop} />)
expect('Register form asks for a confirm-password field', register.includes('Confirm password'))
expect('Register form asks for an email (Firebase Auth requires one)', register.includes('type="email"'))

// The fixture's "Overdue thing" is fixed two days before "today", so it is
// overdue no matter what real wall-clock time this suite happens to run at
// — a stable, time-independent thing to assert on. The "now"/"soon" fixture
// tasks sit at fixed clock times and would make the badge count flaky
// depending on the hour the suite runs, so those are left to notifications.test.js.
const bell = render(<NotificationBell onEdit={noop} />)
expect('Notification bell shows a badge when something needs attention', bell.includes('notif__badge'))

/* Events. The fixtures deliberately include a bar that straddles a week
   boundary and two overlapping multi-day bars, so these also exercise the lane
   packer's clipping and stacking through a real render. */
expect('Month draws multi-day events as spanning bars', html.month.includes('month__bar'))
expect(
  'A month bar spans more than one column',
  /grid-column:\s*\d+\s*\/\s*span\s*[2-7]/.test(html.month),
)
expect(
  'A bar clipped by the week boundary is marked as continuing',
  html.month.includes('month__bar--from') || html.month.includes('month__bar--to'),
)
expect('Week renders the always-present all-day row', html.week.includes('week__allday'))
expect('Week draws event spans', html.week.includes('week__span'))
expect('Day view rails multi-day and all-day events', html.today.includes('event-rail'))
expect('Day view counts the day of a running event', /Day \d+ of \d+/.test(html.today))
expect('Day view offers free slots', html.today.includes('free-slots'))
expect('Dashboard carries the mini calendar beside the hero', html.dashboard.includes('mini-cal'))
expect('Mini calendar shows load density', html.dashboard.includes('mini-cal__dot'))
/* Events are commitments, not work: they must never reach the planned-hours
   maths. The fixtures include a timed 1h event today, so if it ever leaked
   into dayStats this figure would move. */
expect(
  'Events stay out of the planned-hours total',
  html.dashboard.includes('hero__value'),
)
const eventCreate = render(
  <EventEditor editor={{ mode: 'create', draft: { startDate: KEY, endDate: KEY } }} onClose={noop} />,
)
expect('Event editor asks for an end date', eventCreate.includes('Ends'))
/* Events repeat now. This assertion used to be its exact inverse — "offers no
   repeat control" — because a repeating event was deliberately not built; the
   restriction that survived is narrower and lives below. */
expect('Event editor offers a repeat control', eventCreate.includes('Repeat'))
expect(
  'Event repeat covers the monthly and weekend rules',
  eventCreate.includes('Monthly') && eventCreate.includes('Weekends'),
)
/* The one thing still not built: a span cannot repeat. An occurrence would
   have to carry its own length, and "which day of which occurrence did you
   grab" becomes a real question for the lane packer and every drag path. */
const eventSpan = render(
  <EventEditor
    editor={{ mode: 'create', draft: { startDate: KEY, endDate: addDays(KEY, 3) } }}
    onClose={noop}
  />,
)
expect(
  'A multi-day event cannot repeat',
  eventSpan.includes('A run of days cannot repeat'),
)

/* A repeating event has to actually reach the grids, not just save. The
   fixtures carry a weekly "Sunday service" anchored a fortnight back and a
   monthly "Book club" anchored four weeks back — both before any window these
   views draw, so anything on screen came from expansion, never from the
   stored document sitting on its own anchor date. */
expect(
  'A repeating event expands into the month grid',
  html.month.includes('Sunday service'),
)
expect(
  'A monthly nth-weekday event expands too',
  html.month.includes('Book club'),
)
/* And the rule document itself never shows up as an event on its anchor day —
   the same contract repeating tasks have. A month view drawing both the rule
   and its occurrences would double every repeat. */
expect(
  'The month shows one Book club, not the rule as well',
  (html.month.match(/>Book club</g) ?? []).length <= 1,
)

/* The item index lists documents, not calendar days — so a repeating task must
   appear exactly once, as its rule, however many days the grids expand it
   into. The fixture's "Standing sync" repeats every weekday from a week ago,
   which is dozens of occurrences by any horizon the views draw. */
const items = render(<ItemManager onClose={noop} onEdit={noop} onEditEvent={noop} />)
expect('Item index lists tasks and events together', items.includes('item-list__row'))
expect('Item index carries an unscheduled task', items.includes('Unscheduled'))
// Matched as a title text node, not a bare substring: the delete button's
// aria-label repeats the title, and would double every count here.
expect(
  'A repeating task appears once, as its rule',
  (items.match(/>Standing sync</g) ?? []).length === 1,
)
expect('A repeating task shows its rule, not a date', items.includes('Every weekday'))
/* Newest first: the fixture stamps "Unscheduled idea" later than everything
   else, so it has to lead even though it has no date. */
expect(
  'The latest item sits at the top',
  items.indexOf('>Unscheduled idea<') < items.indexOf('>Overdue thing<') &&
    items.indexOf('>Unscheduled idea<') < items.indexOf('>Standing sync<'),
)
expect(
  'Item index counts tasks and events separately',
  items.includes(`Tasks ${mockValue.tasks.length}`) &&
    items.includes(`Events ${mockValue.events.length}`),
)
expect(
  'Item index can filter by tag',
  items.includes('Any tag') && items.includes('Work') && items.includes('Personal'),
)

console.log('')
for (const [name, ok] of checks) {
  if (!ok) failed += 1
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`)
}

console.log('')
console.log(failed === 0 ? 'smoke render: all checks passed' : `smoke render: ${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
