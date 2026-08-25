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
import { todayKey } from '../../src/lib/date.js'
import { Dashboard } from '../../src/components/Dashboard.jsx'
import { TodayView } from '../../src/components/TodayView.jsx'
import { WeekGrid } from '../../src/components/WeekGrid.jsx'
import { MonthCalendar } from '../../src/components/MonthCalendar.jsx'
import { TaskEditor } from '../../src/components/TaskEditor.jsx'
import { TagManager } from '../../src/components/TagManager.jsx'
import { TaskInbox } from '../../src/components/TaskInbox.jsx'
import { SignIn } from '../../src/components/SignIn.jsx'
import { LoginForm } from '../../src/components/LoginForm.jsx'
import { RegisterForm } from '../../src/components/RegisterForm.jsx'
import { SetupNotice } from '../../src/components/SetupNotice.jsx'
import { NotificationBell } from '../../src/components/NotificationBell.jsx'
import { mockValue } from './mockSchedule.jsx'

const KEY = todayKey()
const noop = () => {}

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
  ['TaskEditor (create)', <TaskEditor editor={{ mode: 'create', draft: { date: KEY, startMin: 540 } }} onClose={noop} />],
  ['TaskEditor (edit)', <TaskEditor editor={{ mode: 'edit', task: mockValue.tasks[0] }} onClose={noop} />],
  ['NotificationBell', <NotificationBell onEdit={noop} />],
]

let failed = 0

for (const [name, element] of cases) {
  try {
    const html = renderToString(element)
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
  today: renderToString(<TodayView focusKey={KEY} onEdit={noop} onCreate={noop} />),
  week: renderToString(<WeekGrid focusKey={KEY} onEdit={noop} onCreate={noop} />),
  month: renderToString(<MonthCalendar focusKey={KEY} onFocusDay={noop} onCreate={noop} />),
  dashboard: renderToString(<Dashboard onFocusDay={noop} onEdit={noop} onCreate={noop} />),
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
expect('Dashboard surfaces the overdue task', html.dashboard.includes('Overdue thing'))
expect('Dashboard chart draws bars', html.dashboard.includes('chart__bar'))
expect('Tag bars use the themed token', html.dashboard.includes('var(--tag-blue)'))
expect('Dashboard trends render the table toggle', html.dashboard.includes('Table view'))
expect('Dashboard trends compute a completion rate', html.dashboard.includes('Completion rate'))

const signIn = renderToString(<SignIn />)
expect('Sign-in screen keeps the Google button', signIn.includes('Sign in with Google'))
expect('Sign-in screen defaults to the login form', signIn.includes('Username or email'))
const register = renderToString(<RegisterForm onSwitchToLogin={noop} />)
expect('Register form asks for a confirm-password field', register.includes('Confirm password'))
expect('Register form asks for an email (Firebase Auth requires one)', register.includes('type="email"'))

// The fixture's "Overdue thing" is fixed two days before "today", so it is
// overdue no matter what real wall-clock time this suite happens to run at
// — a stable, time-independent thing to assert on. The "now"/"soon" fixture
// tasks sit at fixed clock times and would make the badge count flaky
// depending on the hour the suite runs, so those are left to notifications.test.js.
const bell = renderToString(<NotificationBell onEdit={noop} />)
expect('Notification bell shows a badge when something needs attention', bell.includes('notif__badge'))

console.log('')
for (const [name, ok] of checks) {
  if (!ok) failed += 1
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`)
}

console.log('')
console.log(failed === 0 ? 'smoke render: all checks passed' : `smoke render: ${failed} FAILED`)
process.exit(failed === 0 ? 0 : 1)
