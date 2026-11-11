/* The client half of App Check: nothing is attached until firebase.js has
 * registered a token provider, and a failing provider can never break a call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { getIdToken: vi.fn(async () => 'id-token') } },
}))

import { appCheckHeaders, setAppCheckTokenProvider } from '../src/lib/appCheck.js'
import { callApi } from '../src/lib/apiClient.js'

beforeEach(() => {
  setAppCheckTokenProvider(null)
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })))
})

afterEach(() => {
  setAppCheckTokenProvider(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const sentHeaders = () => fetch.mock.calls.at(-1)[1].headers

describe('appCheckHeaders', () => {
  it('is empty until a provider is registered', async () => {
    expect(await appCheckHeaders()).toEqual({})
  })

  it('names the token in X-Firebase-AppCheck', async () => {
    setAppCheckTokenProvider(async () => 'app-check-token')
    expect(await appCheckHeaders()).toEqual({ 'X-Firebase-AppCheck': 'app-check-token' })
  })

  it('is empty, and does not throw, when the provider fails or has no token', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    setAppCheckTokenProvider(async () => {
      throw new Error('reCAPTCHA unavailable')
    })
    expect(await appCheckHeaders()).toEqual({})
    setAppCheckTokenProvider(async () => '')
    expect(await appCheckHeaders()).toEqual({})
  })
})

describe('callApi', () => {
  it('sends no App Check header when App Check is off', async () => {
    await callApi('/api/parse-task', {})
    expect(sentHeaders()).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer id-token' })
  })

  it('adds the header to an authenticated call when App Check is on', async () => {
    setAppCheckTokenProvider(async () => 'app-check-token')
    await callApi('/api/parse-task', {})
    expect(sentHeaders()['X-Firebase-AppCheck']).toBe('app-check-token')
  })

  it('still makes the call when the App Check token cannot be had', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    setAppCheckTokenProvider(async () => {
      throw new Error('nope')
    })
    expect(await callApi('/api/parse-task', {})).toEqual({ ok: true })
    expect(sentHeaders()['X-Firebase-AppCheck']).toBeUndefined()
  })

  it('attaches nothing to a session-less call, which has no token to prove anything with', async () => {
    setAppCheckTokenProvider(async () => 'app-check-token')
    await callApi('/api/push/unsubscribe', { endpoint: 'x' }, { auth: false })
    expect(sentHeaders()).toEqual({ 'Content-Type': 'application/json' })
  })
})
