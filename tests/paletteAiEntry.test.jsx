/* App's command palette lists the AI entry point as a normal default row —
 * opening the palette (the phone/tablet discovery path, with no Ctrl/Cmd+K)
 * shows "AI" before anything is typed, and running it opens the AI chat.
 * Rendered through the real App (signed in, empty schedule) so the list
 * under test is the actual paletteActions composition, not a fixture.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App.jsx'

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
  disablePush: vi.fn(),
  enablePush: vi.fn(),
  isFcmSubscribed: vi.fn(),
  cleanupPushToken: vi.fn(),
}))

vi.mock('../src/state/AuthContext.jsx', () => ({
  AuthProvider: ({ children }) => <>{children}</>,
  useAuth: () => ({ user: { uid: 'user-1' }, loading: false, error: null, clearError: vi.fn() }),
}))

vi.mock('../src/state/ScheduleContext.jsx', () => ({
  ScheduleProvider: ({ children }) => <>{children}</>,
  useSchedule: () => ({
    loading: false,
    error: null,
    templates: [],
    tasks: [],
    events: [],
    occurrencesOn: () => [],
    tasksOn: () => [],
    eventsOn: () => [],
    eventsInRange: () => [],
    inbox: [],
    tags: [],
    profile: null,
    focusSessions: [],
    getTag: () => null,
  }),
}))

beforeEach(() => {
  localStorage.clear()
  // jsdom has no matchMedia; the dashboard's PixelType reads it on mount.
  window.matchMedia = vi.fn((query) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  }))
})

afterEach(() => {
  if ('matchMedia' in window) delete window.matchMedia
})

function openPalette() {
  fireEvent.click(screen.getByText('Search'))
  expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeTruthy()
}

describe('Palette AI entry', () => {
  it('lists AI before anything is typed', () => {
    render(<App />)
    openPalette()
    expect(screen.getByText('AI')).toBeTruthy()
  })

  it('opens the AI chat when the AI row runs', () => {
    render(<App />)
    openPalette()
    fireEvent.click(screen.getByText('AI'))
    expect(screen.getByRole('dialog', { name: 'Ask AI' })).toBeTruthy()
  })
})
