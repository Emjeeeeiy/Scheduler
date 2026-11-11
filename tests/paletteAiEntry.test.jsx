/* App's command palette lists the AI entry point as a normal default row —
 * opening the palette (the phone/tablet discovery path, with no Ctrl/Cmd+K)
 * shows "AI" before anything is typed, and running it opens the AI chat.
 * Rendered through the real App (signed in, empty schedule) so the list
 * under test is the actual paletteActions composition, not a fixture.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App.jsx'
import { parseTaskAi } from '../src/lib/aiClient.js'

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

// AI answers a confirmed email address only (api/_lib/auth.js); most of this file is
// about a confirmed account, the last describe about one that is not.
const auth = vi.hoisted(() => ({ emailVerified: true }))

vi.mock('../src/state/AuthContext.jsx', () => ({
  AuthProvider: ({ children }) => <>{children}</>,
  useAuth: () => ({
    user: { uid: 'user-1' },
    loading: false,
    error: null,
    clearError: vi.fn(),
    emailVerified: auth.emailVerified,
    resendVerification: vi.fn(async () => true),
    checkVerification: vi.fn(async () => false),
  }),
}))

vi.mock('../src/lib/aiClient.js', () => ({
  suggestTagAi: vi.fn(),
  parseTaskAi: vi.fn(),
  planDayAi: vi.fn(),
  enrichTaskAi: vi.fn(),
  aiScheduleAi: vi.fn(),
}))

vi.mock('../src/state/ScheduleContext.jsx', () => ({
  ScheduleProvider: ({ children }) => <>{children}</>,
  DEFAULT_DURATION_MIN: 30,
  useSchedule: () => ({
    addTask: vi.fn(),
    updateTask: vi.fn(),
    removeTask: vi.fn(),
    restoreItem: vi.fn(),
    addTemplate: vi.fn(),
    getSeries: () => null,
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
  auth.emailVerified = true
  vi.mocked(parseTaskAi).mockReset()
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

describe('Palette AI entries — before the email address is confirmed', () => {
  beforeEach(() => {
    auth.emailVerified = false
  })

  it('says on the AI row itself that it needs a confirmed email, instead of its usual line', () => {
    render(<App />)
    openPalette()
    expect(screen.getByText('Confirm your email to use')).toBeTruthy()
    expect(screen.queryByText('Describe it, AI schedules it')).toBeNull()
  })

  it('keeps its usual line for a confirmed account', () => {
    auth.emailVerified = true
    render(<App />)
    openPalette()
    expect(screen.getByText('Describe it, AI schedules it')).toBeTruthy()
    expect(screen.queryByText('Confirm your email to use')).toBeNull()
  })

  it('still opens the chat, which is where the explanation and the Resend button are', () => {
    render(<App />)
    openPalette()
    fireEvent.click(screen.getByText('AI'))
    const chat = screen.getByRole('dialog', { name: 'Ask AI' })
    expect(chat.textContent).toContain('Confirm your email address to use AI')
    expect(within(chat).getByRole('button', { name: 'Resend email' })).toBeTruthy()
  })

  it('says why "Parse with AI" will not use AI, asks the server nothing, and still opens the form with the text', () => {
    render(<App />)
    openPalette()
    fireEvent.change(screen.getByLabelText('Command palette search'), { target: { value: 'buy milk and eggs' } })

    const row = screen.getByText('Parse "buy milk and eggs" with AI').closest('[role="option"]')
    expect(row.textContent).toContain('Confirm your email to use')
    fireEvent.click(row)

    expect(parseTaskAi).not.toHaveBeenCalled()
    expect(screen.getByText('AI needs a confirmed email address — opened with your text as the title.')).toBeTruthy()
    expect(screen.getByLabelText('Title').value).toBe('buy milk and eggs')
  })
})
