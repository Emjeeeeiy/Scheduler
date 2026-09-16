/* Gate's loading state splits on the session hint: a visit that started with
 * a live session gets the skeleton while Firebase restores it, while a visit
 * with no hint (first run, signed out) goes straight to the sign-in form —
 * no loader flashes on the sign-in path. Rendered through the real App so
 * the composition itself is what's proven, with Firebase and auth mocked.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

let mockAuthState = { user: null, loading: true }

vi.mock('../src/state/AuthContext.jsx', () => ({
  AuthProvider: ({ children }) => <>{children}</>,
  useAuth: () => mockAuthState,
}))

beforeEach(() => {
  localStorage.clear()
  mockAuthState = { user: null, loading: true, error: null, clearError: vi.fn() }
})

describe('Gate loading', () => {
  it('goes straight to sign-in with no session hint', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /log in/i })).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows the skeleton while restoring a returning session', () => {
    localStorage.setItem('cadence-app:signed_in', 'true')
    render(<App />)
    expect(screen.getByRole('status', { name: /checking your session/i })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /log in/i })).toBeNull()
  })
})
