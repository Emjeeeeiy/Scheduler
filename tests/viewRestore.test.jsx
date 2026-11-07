/* Which page the app opens on is three separate questions, and this file is
 * about the boundary between two of them:
 *
 *   a refresh resumes where you were, but a fresh sign-in opens the landing
 *   view. Nothing distinguishes those two at the auth layer by the time the
 *   shell mounts — both look like "here is a user" — so the distinction is
 *   carried by cadence-app:view being cleared on sign-out (see
 *   authSessionHint.test.jsx), and the rule falls out of that.
 *
 * Asserted on the sidebar's aria-current rather than on the page's own content,
 * so the test doesn't depend on any one view's data. All three Schedule
 * sub-pages report as the Schedule nav entry; Dashboard and Focus report as
 * their own.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/firebase.js', () => ({
  firebaseReady: true,
  missingConfigKeys: [],
  auth: {},
  db: {},
  deleteAccount: vi.fn(),
  logout: vi.fn(),
  reauthenticate: vi.fn(),
  registerWithUsername: vi.fn(),
  requestPasswordReset: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithUsernameOrEmail: vi.fn(),
}))

vi.mock('../src/state/AuthContext.jsx', () => ({
  AuthProvider: ({ children }) => <>{children}</>,
  useAuth: () => ({ user: { uid: 'user-1' }, loading: false }),
}))

/* Enough of a schedule for the shell to mount. The views themselves are stubbed
   out below — what these tests care about is which one gets chosen. */
vi.mock('../src/state/ScheduleContext.jsx', () => ({
  ScheduleProvider: ({ children }) => <>{children}</>,
  useSchedule: () => ({
    loading: false,
    error: null,
    templates: [],
    tasks: [],
    events: [],
  }),
}))

const { landingView } = vi.hoisted(() => ({ landingView: { current: 'dashboard' } }))

vi.mock('../src/state/SettingsContext.jsx', () => ({
  SettingsProvider: ({ children }) => <>{children}</>,
  useSettings: () => ({
    settings: {
      weekStartsOn: 1,
      landingView: landingView.current,
      shortcuts: { newTask: 'n', newEvent: 'e', jumpToday: 't' },
      workingHours: null,
    },
    updateSetting: vi.fn(),
  }),
}))

const VIEWS = [
  ['dashboard', 'Dashboard'],
  ['focus', 'Focus'],
  ['today', 'Schedule'],
  ['week', 'Schedule'],
  ['month', 'Schedule'],
  ['review', 'Schedule'],
  ['journal', 'Journal'],
  // Not one of the four nav tabs: its entry is the Settings link in the tools.
  ['settings', 'Settings'],
]

/* The views, plus the two shell chrome components that pull their own slice of
   schedule data. Stubbed because what these tests are about is which page gets
   chosen, and none of that is down here. */
vi.mock('../src/components/views/Dashboard.jsx', () => ({ Dashboard: () => <div className="view-dashboard" /> }))
vi.mock('../src/components/views/TodayView.jsx', () => ({ TodayView: () => <div className="view-today" /> }))
vi.mock('../src/components/views/WeekGrid.jsx', () => ({ WeekGrid: () => <div className="view-week" /> }))
vi.mock('../src/components/views/MonthCalendar.jsx', () => ({ MonthCalendar: () => <div className="view-month" /> }))
vi.mock('../src/components/views/ReviewView.jsx', () => ({ ReviewView: () => <div className="view-review" /> }))
vi.mock('../src/components/views/FocusMode.jsx', () => ({ FocusMode: () => <div className="view-focus" /> }))
vi.mock('../src/components/views/JournalView.jsx', () => ({ JournalView: () => <div className="view-journal" /> }))
vi.mock('../src/components/views/SettingsView.jsx', () => ({
  SettingsView: ({ section, detail }) => (
    <div className="view-settings" data-section={section} data-detail={String(detail)} />
  ),
}))
vi.mock('../src/components/shell/NotificationBell.jsx', () => ({ NotificationBell: () => null }))
vi.mock('../src/components/shell/AccountMenu.jsx', () => ({ AccountMenu: () => null }))

import App from '../src/App.jsx'

const SIGNED_IN_KEY = 'cadence-app:signed_in'
const LAST_VIEW_KEY = 'cadence-app:view'

/** Mount the app as a page load that started with a live session — i.e. a
 * refresh, not a sign-in. */
function refresh() {
  localStorage.setItem(SIGNED_IN_KEY, 'true')
  const { container } = render(<App />)
  return container
}

function activePage() {
  return screen.getByRole('button', { current: 'page' }).textContent
}

beforeEach(() => {
  localStorage.clear()
  landingView.current = 'dashboard'
})

describe('which page the app opens on', () => {
  // Async because the Journal is lazy-loaded: its page arrives a tick after the shell.
  it.each(VIEWS)('a refresh resumes on %s rather than bouncing to the landing view', async (view, navLabel) => {
    landingView.current = 'dashboard'
    localStorage.setItem(LAST_VIEW_KEY, JSON.stringify(view))
    const container = refresh()
    expect(activePage()).toBe(navLabel)
    await waitFor(() => expect(container.querySelector(`.view-${view}`)).toBeTruthy())
  })

  it('puts the Journal directly under Focus in the sidebar', () => {
    const container = refresh()
    const labels = [...container.querySelectorAll('.sidebar__nav .sidebar__label')].map((el) => el.textContent)
    expect(labels).toEqual(['Dashboard', 'Schedule', 'Focus', 'Journal'])
  })

  it('honours the landing view when there is nothing remembered', () => {
    landingView.current = 'month'
    const container = refresh()
    expect(activePage()).toBe('Schedule')
    expect(container.querySelector('.view-month')).toBeTruthy()
  })

  it('honours the landing view after a sign-out cleared the remembered page', () => {
    landingView.current = 'focus'
    localStorage.setItem(SIGNED_IN_KEY, 'true')
    // What noteSession(null) leaves behind.
    localStorage.removeItem(LAST_VIEW_KEY)
    const container = refresh()
    expect(activePage()).toBe('Focus')
    expect(container.querySelector('.view-focus')).toBeTruthy()
  })

  it('falls back to the landing view when the remembered page is not one we can render', () => {
    landingView.current = 'review'
    // A value from an older build, or edited by hand.
    localStorage.setItem(LAST_VIEW_KEY, JSON.stringify('timeline'))
    const container = refresh()
    expect(container.querySelector('.view-review')).toBeTruthy()
  })

  it('falls back to the landing view when the remembered page is unparseable', () => {
    landingView.current = 'week'
    localStorage.setItem(LAST_VIEW_KEY, 'not json')
    const container = refresh()
    expect(container.querySelector('.view-week')).toBeTruthy()
  })
})

describe('Settings is a page, not a dialog', () => {
  it('opens in the content area from the sidebar and marks its link as the current page', () => {
    const container = refresh()
    expect(container.querySelector('.view-dashboard')).toBeTruthy()
    fireEvent.click(screen.getByTitle('Settings'))
    expect(container.querySelector('.view-settings')).toBeTruthy()
    expect(container.querySelector('.view-dashboard')).toBeNull()
    expect(activePage()).toBe('Settings')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('has no separate Tags entry: tags are a section of Settings', () => {
    refresh()
    expect(screen.queryByTitle('Tags')).toBeNull()
  })

  it('opens on General the first time', () => {
    localStorage.setItem(LAST_VIEW_KEY, JSON.stringify('settings'))
    const container = refresh()
    expect(container.querySelector('.view-settings').dataset.section).toBe('general')
  })

  it('reopens on the category it was left on', () => {
    localStorage.setItem(LAST_VIEW_KEY, JSON.stringify('settings'))
    localStorage.setItem('cadence-app:settings-section', JSON.stringify('tags'))
    const container = refresh()
    expect(container.querySelector('.view-settings').dataset.section).toBe('tags')
  })

  it('ignores a remembered category that no longer exists', () => {
    localStorage.setItem(LAST_VIEW_KEY, JSON.stringify('settings'))
    localStorage.setItem('cadence-app:settings-section', JSON.stringify('billing'))
    const container = refresh()
    expect(container.querySelector('.view-settings').dataset.section).toBe('general')
  })

  it('opens on the list of categories, not on one category screen', () => {
    localStorage.setItem(LAST_VIEW_KEY, JSON.stringify('settings'))
    const container = refresh()
    expect(container.querySelector('.view-settings').dataset.detail).toBe('false')
  })

  it('reopens on the category screen it was left on', () => {
    localStorage.setItem(LAST_VIEW_KEY, JSON.stringify('settings'))
    localStorage.setItem('cadence-app:settings-detail', JSON.stringify(true))
    const container = refresh()
    expect(container.querySelector('.view-settings').dataset.detail).toBe('true')
  })

  it('ignores a remembered detail flag that is not a boolean', () => {
    localStorage.setItem(LAST_VIEW_KEY, JSON.stringify('settings'))
    localStorage.setItem('cadence-app:settings-detail', JSON.stringify('yes'))
    const container = refresh()
    expect(container.querySelector('.view-settings').dataset.detail).toBe('false')
  })

  it('the Settings link goes to the list, even if a category screen was left open', () => {
    localStorage.setItem('cadence-app:settings-detail', JSON.stringify(true))
    localStorage.setItem('cadence-app:settings-section', JSON.stringify('tags'))
    const container = refresh()
    fireEvent.click(screen.getByTitle('Settings'))
    const view = container.querySelector('.view-settings')
    expect(view.dataset.detail).toBe('false')
    // ...but it still remembers which category that was.
    expect(view.dataset.section).toBe('tags')
  })

  it('leaves through the ordinary nav, like any other page', () => {
    localStorage.setItem(LAST_VIEW_KEY, JSON.stringify('settings'))
    const container = refresh()
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
    expect(container.querySelector('.view-dashboard')).toBeTruthy()
    expect(container.querySelector('.view-settings')).toBeNull()
  })
})
