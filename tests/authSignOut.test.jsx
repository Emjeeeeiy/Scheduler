/* Signing out wipes this browser's offline copy of the account, and — when
 * "Remember me" was unticked, i.e. "this isn't my device" — also stops this
 * device's push reminders first. Firebase itself is mocked; what is proven
 * here is the order and the conditions.
 */
import { act, render } from '@testing-library/react'
import { onAuthStateChanged } from 'firebase/auth'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../src/state/AuthContext.jsx'

const calls = []

vi.mock('firebase/auth', () => ({ onAuthStateChanged: vi.fn() }))

vi.mock('../src/lib/pushSubscription.js', () => ({
  unsubscribePush: vi.fn(async () => {
    calls.push('unsubscribePush')
    return true
  }),
}))

vi.mock('../src/firebase.js', () => ({
  auth: {},
  firebaseReady: true,
  DISPLAY_NAME_MAX: 60,
  deleteAccount: vi.fn(),
  reauthenticate: vi.fn(),
  registerAccount: vi.fn(),
  requestPasswordReset: vi.fn(),
  resendVerification: vi.fn(),
  refreshVerification: vi.fn(async () => true),
  signInWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  logout: vi.fn(async () => {
    calls.push('logout')
  }),
  clearLocalData: vi.fn(async () => {
    calls.push('clearLocalData')
  }),
}))

const probe = { auth: null }
function Probe() {
  const auth = useAuth()
  useEffect(() => {
    probe.auth = auth
  })
  return null
}

function signedIn(user = { uid: 'user-1', emailVerified: false }) {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
  act(() => onAuthStateChanged.mock.calls.at(-1)[1](user))
}

beforeEach(() => {
  localStorage.clear()
  calls.length = 0
  onAuthStateChanged.mockClear()
})

describe('signing out', () => {
  it('signs out, then clears the offline cache — and leaves push alone on a remembered device', async () => {
    signedIn()
    await act(() => probe.auth.signOut())
    expect(calls).toEqual(['logout', 'clearLocalData'])
  })

  it('also stops push on this device first when "Remember me" was unticked', async () => {
    localStorage.setItem('cadence:remember_me', 'false')
    signedIn()
    await act(() => probe.auth.signOut())
    expect(calls).toEqual(['unsubscribePush', 'logout', 'clearLocalData'])
  })
})

describe('email verification state', () => {
  it('starts from the user, and picks up a verification done elsewhere', async () => {
    signedIn({ uid: 'user-1', emailVerified: false })
    expect(probe.auth.emailVerified).toBe(false)
    await act(() => probe.auth.checkVerification())
    expect(probe.auth.emailVerified).toBe(true)
  })

  it('treats a verified (e.g. Google) account as verified straight away', () => {
    signedIn({ uid: 'user-1', emailVerified: true })
    expect(probe.auth.emailVerified).toBe(true)
  })
})
