/* AuthContext maintains the cadence-app:signed_in hint that index.html's head
 * script reads before first paint: a visit with a live session skips the
 * boot splash and goes straight to the skeleton. These tests drive the real
 * onAuthStateChanged callback (Firebase itself is mocked) and prove the hint
 * is set on sign-in and cleared on sign-out.
 *
 * Sign-out also clears cadence-app:view — the page the session was on. That
 * second key is what makes "a refresh keeps your place" and "a fresh sign-in
 * starts at the landing view" two different rules rather than one, so its
 * lifetime is pinned here too.
 */
import { render } from '@testing-library/react'
import { onAuthStateChanged } from 'firebase/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../src/state/AuthContext.jsx'

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
}))

vi.mock('../src/firebase.js', () => ({
  auth: {},
  firebaseReady: true,
  deleteAccount: vi.fn(),
  logout: vi.fn(),
  reauthenticate: vi.fn(),
  registerWithUsername: vi.fn(),
  requestPasswordReset: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithUsernameOrEmail: vi.fn(),
}))

const SIGNED_IN_KEY = 'cadence-app:signed_in'
const LAST_VIEW_KEY = 'cadence-app:view'

function authCallback() {
  return onAuthStateChanged.mock.calls.at(-1)[1]
}

/** Renders the provider and hands the callback a value, the way Firebase
    would once it had resolved the session. */
function resolveAs(user) {
  render(
    <AuthProvider>
      <div />
    </AuthProvider>,
  )
  authCallback()(user)
}

beforeEach(() => {
  localStorage.clear()
  onAuthStateChanged.mockClear()
})

describe('AuthContext session hint', () => {
  it('records the hint when a session is live', () => {
    resolveAs({ uid: 'user-1' })
    expect(localStorage.getItem(SIGNED_IN_KEY)).toBe('true')
  })

  it('clears the hint when the session ends', () => {
    localStorage.setItem(SIGNED_IN_KEY, 'true')
    resolveAs(null)
    expect(localStorage.getItem(SIGNED_IN_KEY)).toBeNull()
  })

  it('leaves the remembered page alone while the session lives', () => {
    localStorage.setItem(LAST_VIEW_KEY, 'week')
    resolveAs({ uid: 'user-1' })
    expect(localStorage.getItem(LAST_VIEW_KEY)).toBe('week')
  })

  it('forgets the page along with the session, so the next sign-in starts fresh', () => {
    localStorage.setItem(SIGNED_IN_KEY, 'true')
    localStorage.setItem(LAST_VIEW_KEY, 'week')
    resolveAs(null)
    expect(localStorage.getItem(LAST_VIEW_KEY)).toBeNull()
  })
})
