/* The phone's Back button, through the real shell. tests/backStack.test.js pins
 * the history arithmetic against a fake `history`; this proves the shell wires
 * it up: what Back does from each place, in the order the user stacked them.
 *
 *   - from a tab other than home, Back goes home (and from home there is nothing
 *     to catch, so the browser's own Back is left alone);
 *   - a dialog closes before anything beneath it;
 *   - a day opened from the month returns to the month;
 *   - closing something with its own control leaves no stale history behind.
 *
 * It drives jsdom's real window.history (back() lands asynchronously and fires
 * popstate), with the views stubbed out as in viewRestore.test.jsx: what is
 * under test is which page Back lands on, not what the pages contain.
 * Deliberately not tested here: the Journal note's refusal while it cannot save
 * (journalSurface.test.jsx) and the Settings sub-screen (settingsPage.test.jsx).
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/firebase.js', () => ({
  firebaseReady: true,
  missingConfigKeys: [],
  auth: {},
  db: {},
  deleteAccount: vi.fn(),
  logout: vi.fn(),
  reauthenticate: vi.fn(),
  registerAccount: vi.fn(),
  refreshVerification: vi.fn(),
  resendVerification: vi.fn(),
  clearLocalData: vi.fn(),
  DISPLAY_NAME_MAX: 60,
  requestPasswordReset: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithEmail: vi.fn(),
}))

vi.mock('../src/state/AuthContext.jsx', () => ({
  AuthProvider: ({ children }) => <>{children}</>,
  useAuth: () => ({ user: { uid: 'user-1' }, loading: false, emailVerified: true }),
}))

vi.mock('../src/state/useJournal.js', async () => import('./smoke/mockJournal.js'))

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
      shortcuts: { newTask: 'n', newEvent: 'e', jumpToday: 't', dayNote: 'j' },
      workingHours: null,
    },
    updateSetting: vi.fn(),
  }),
}))

vi.mock('../src/components/views/Dashboard.jsx', () => ({ Dashboard: () => <div className="view-dashboard" /> }))
vi.mock('../src/components/views/TodayView.jsx', () => ({ TodayView: () => <div className="view-today" /> }))
vi.mock('../src/components/views/WeekGrid.jsx', () => ({ WeekGrid: () => <div className="view-week" /> }))
/* The month can open one of its days, which is the drill-down under test. */
vi.mock('../src/components/views/MonthCalendar.jsx', () => ({
  MonthCalendar: ({ onFocusDay }) => (
    <div className="view-month">
      <button type="button" onClick={() => onFocusDay('2099-01-05')}>
        open day
      </button>
    </div>
  ),
}))
vi.mock('../src/components/views/ReviewView.jsx', () => ({ ReviewView: () => <div className="view-review" /> }))
vi.mock('../src/components/views/FocusMode.jsx', () => ({ FocusMode: () => <div className="view-focus" /> }))
vi.mock('../src/components/views/JournalView.jsx', () => ({
  JournalView: () => <div className="view-journal" />,
}))
vi.mock('../src/components/views/SettingsView.jsx', () => ({
  SettingsView: () => <div className="view-settings" />,
}))
vi.mock('../src/components/shell/NotificationBell.jsx', () => ({ NotificationBell: () => null }))
vi.mock('../src/components/shell/AccountMenu.jsx', () => ({ AccountMenu: () => null }))

import App from '../src/App.jsx'
import { getBackStack } from '../src/lib/backStack.js'

const SIGNED_IN_KEY = 'cadence-app:signed_in'
const LAST_VIEW_KEY = 'cadence-app:view'

function open() {
  localStorage.setItem(SIGNED_IN_KEY, 'true')
  return render(<App />).container
}

const activePage = () => screen.getByRole('button', { current: 'page' }).textContent
const depth = () => window.history.state?.cadenceBack ?? 0
const layers = () => getBackStack().size()

/** The phone's Back button. It lands asynchronously, like a browser's. */
const pressBack = () => window.history.back()
const openPalette = () => fireEvent.click(screen.getByTitle('Command palette (Ctrl/Cmd+K)'))
const paletteIsOpen = () => screen.queryByLabelText('Command palette search') !== null

beforeEach(() => {
  localStorage.clear()
  landingView.current = 'dashboard'
})

afterEach(async () => {
  cleanup()
  // Unmounting hands every layer's history entry back, asynchronously; the next
  // test must start from an empty stack, not from this one's leftovers.
  await waitFor(() => expect(depth()).toBe(0))
})

describe('Back from a tab', () => {
  it('goes to the home tab, not to the app’s exit', async () => {
    open()
    fireEvent.click(screen.getByTitle('Journal'))
    expect(activePage()).toBe('Journal')
    await waitFor(() => expect(depth()).toBe(1))

    pressBack()
    await waitFor(() => expect(activePage()).toBe('Dashboard'))
    // At home with nothing open there is no layer: the browser's Back is left
    // alone, which is what leaves the app.
    await waitFor(() => expect(layers()).toBe(0))
  })

  it('skips the tabs in between: one press from the third tab is home, not the second', async () => {
    open()
    fireEvent.click(screen.getByTitle('Focus'))
    fireEvent.click(screen.getByTitle('Journal'))
    fireEvent.click(screen.getByTitle('Schedule'))
    expect(activePage()).toBe('Schedule')
    // Three tabs, one layer: it is "away from home", however far away.
    await waitFor(() => expect(depth()).toBe(1))

    pressBack()
    await waitFor(() => expect(activePage()).toBe('Dashboard'))
    await waitFor(() => expect(layers()).toBe(0))
  })

  it('takes the landing view for home, not always the Dashboard', async () => {
    landingView.current = 'month'
    const container = open()
    expect(container.querySelector('.view-month')).toBeTruthy()
    expect(layers()).toBe(0)

    fireEvent.click(screen.getByTitle('Focus'))
    await waitFor(() => expect(depth()).toBe(1))
    pressBack()
    await waitFor(() => expect(container.querySelector('.view-month')).toBeTruthy())
  })

  it('does not hold a layer open when the app is already at home', () => {
    open()
    expect(layers()).toBe(0)
  })
})

describe('Back from a dialog', () => {
  it('closes the dialog and stays on the page beneath it', async () => {
    open()
    openPalette()
    expect(paletteIsOpen()).toBe(true)
    await waitFor(() => expect(depth()).toBe(1))

    pressBack()
    await waitFor(() => expect(paletteIsOpen()).toBe(false))
    expect(activePage()).toBe('Dashboard')
  })

  it('closes the dialog first, and only the next press goes home', async () => {
    open()
    fireEvent.click(screen.getByTitle('Journal'))
    openPalette()
    await waitFor(() => expect(depth()).toBe(2))

    pressBack()
    await waitFor(() => expect(paletteIsOpen()).toBe(false))
    expect(activePage()).toBe('Journal')

    pressBack()
    await waitFor(() => expect(activePage()).toBe('Dashboard'))
  })

  // Regression guard: a dialog closed by its own control (here Escape) must hand
  // its history entry back. Left behind, the next real Back press would "close"
  // nothing and the one after it would leave the app.
  it('leaves no stale entry when the dialog is closed by Escape instead', async () => {
    open()
    openPalette()
    await waitFor(() => expect(depth()).toBe(1))

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(paletteIsOpen()).toBe(false))
    await waitFor(() => expect(depth()).toBe(0))
    expect(layers()).toBe(0)
    expect(activePage()).toBe('Dashboard')
  })

  it('can be reopened after Back without any leftover from the first time', async () => {
    open()
    openPalette()
    await waitFor(() => expect(depth()).toBe(1))
    pressBack()
    await waitFor(() => expect(paletteIsOpen()).toBe(false))
    await waitFor(() => expect(depth()).toBe(0))

    openPalette()
    await waitFor(() => expect(depth()).toBe(1))
    expect(paletteIsOpen()).toBe(true)
  })
})

describe('Back from a drill-down', () => {
  it('returns to the month after opening one of its days, then goes home', async () => {
    localStorage.setItem(LAST_VIEW_KEY, JSON.stringify('month'))
    const container = open()
    expect(container.querySelector('.view-month')).toBeTruthy()

    fireEvent.click(screen.getByText('open day'))
    expect(container.querySelector('.view-today')).toBeTruthy()
    expect(container.querySelector('.view-month')).toBeNull()
    // Two layers now: "away from home", and the drill-down on top of it.
    await waitFor(() => expect(depth()).toBe(2))

    pressBack()
    await waitFor(() => expect(container.querySelector('.view-month')).toBeTruthy())
    expect(container.querySelector('.view-today')).toBeNull()

    pressBack()
    await waitFor(() => expect(activePage()).toBe('Dashboard'))
  })

  it('forgets the drill-down when you move sideways to another tab', async () => {
    localStorage.setItem(LAST_VIEW_KEY, JSON.stringify('month'))
    const container = open()
    fireEvent.click(screen.getByText('open day'))
    fireEvent.click(screen.getByTitle('Focus'))
    // The drill-down is dropped, leaving only "away from home".
    await waitFor(() => expect(depth()).toBe(1))
    expect(layers()).toBe(1)

    pressBack()
    // Home, not the month the abandoned drill-down came from.
    await waitFor(() => expect(activePage()).toBe('Dashboard'))
    expect(container.querySelector('.view-month')).toBeNull()
  })
})
