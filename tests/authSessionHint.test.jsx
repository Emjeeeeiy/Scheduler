/* AuthContext maintains the cadence-app:signed_in hint that index.html's head
 * script reads before first paint: a visit with a live session skips the
 * boot splash and goes straight to the skeleton. These tests drive the real
 * onAuthStateChanged callback (Firebase itself is mocked) and prove the hint
 * is set on sign-in and cleared on sign-out.
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

function authCallback() {
  return onAuthStateChanged.mock.calls.at(-1)[1]
}

beforeEach(() => {
  localStorage.clear()
  onAuthStateChanged.mockClear()
})

describe('AuthContext session hint', () => {
  it('records the hint when a session is live', () => {
    render(
      <AuthProvider>
        <div />
      </AuthProvider>,
    )
    authCallback()({ uid: 'user-1' })
    expect(localStorage.getItem(SIGNED_IN_KEY)).toBe('true')
  })

  it('clears the hint when the session ends', () => {
    localStorage.setItem(SIGNED_IN_KEY, 'true')
    render(
      <AuthProvider>
        <div />
      </AuthProvider>,
    )
    authCallback()(null)
    expect(localStorage.getItem(SIGNED_IN_KEY)).toBeNull()
  })
})
