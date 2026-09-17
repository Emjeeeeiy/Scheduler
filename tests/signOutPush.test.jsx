/* Logout is auth-only: signing out must end the Firebase session WITHOUT
 * touching the push subscription — no disablePush, no token delete. Push
 * stops only via the explicit Turn-off toggle (see pushToggle.test.jsx),
 * account deletion, or server-side dead-token pruning. This pins that
 * contract so a future "cleanup on sign-out" cannot silently return.
 */
import { act, render } from '@testing-library/react'
import { onAuthStateChanged } from 'firebase/auth'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../src/state/AuthContext.jsx'

const { mockLogout, mockDisablePush, mockEnablePush } = vi.hoisted(() => ({
  mockLogout: vi.fn(),
  mockDisablePush: vi.fn(),
  mockEnablePush: vi.fn(),
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(),
}))

vi.mock('../src/firebase.js', () => ({
  auth: {},
  firebaseReady: true,
  deleteAccount: vi.fn(),
  logout: mockLogout,
  reauthenticate: vi.fn(),
  registerWithUsername: vi.fn(),
  requestPasswordReset: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithUsernameOrEmail: vi.fn(),
  disablePush: mockDisablePush,
  enablePush: mockEnablePush,
}))

let liveCtx = null
function Probe() {
  const ctx = useAuth()
  // Latest context after every render — outer mutation inside an effect,
  // never during render itself.
  useEffect(() => {
    liveCtx = ctx
  })
  return null
}

beforeEach(() => {
  localStorage.clear()
  liveCtx = null
  onAuthStateChanged.mockClear()
  mockLogout.mockReset().mockResolvedValue(undefined)
  mockDisablePush.mockClear()
  mockEnablePush.mockClear()
})

describe('signOut push contract', () => {
  it('ends the session without disabling push', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    const callback = onAuthStateChanged.mock.calls.at(-1)[1]
    await act(async () => {
      callback({ uid: 'user-1' })
    })
    expect(localStorage.getItem('cadence-app:signed_in')).toBe('true')

    await act(async () => {
      await liveCtx.signOut()
    })

    expect(mockLogout).toHaveBeenCalledTimes(1)
    expect(mockDisablePush).not.toHaveBeenCalled()
    expect(mockEnablePush).not.toHaveBeenCalled()
  })
})
