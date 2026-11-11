/* api/_lib/appCheck.js through verifyRequest — App Check is off until
 * APPCHECK_ENFORCE=true, and once on, a verified account still needs a token
 * that proves the call came from this app. `jose` is mocked: these tests are
 * about when the check runs and what it answers, not about RS256.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('jose', () => ({ createRemoteJWKSet: vi.fn(() => 'JWKS'), jwtVerify: vi.fn() }))

import { jwtVerify } from 'jose'
import { AuthError, verifyRequest } from '../api/_lib/auth.js'

const ENV = ['FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_NUMBER', 'APPCHECK_ENFORCE']
const saved = {}

const req = (extra = {}) => ({ headers: { authorization: 'Bearer id-token', ...extra } })

/** Stands in for jose: the account token and the App Check token verify,
    anything else does not. */
function tokens({ idToken = { sub: 'uid-1', email_verified: true }, appCheck = {} } = {}) {
  jwtVerify.mockImplementation(async (token) => {
    if (token === 'id-token') return { payload: idToken }
    if (token === 'app-check-token') return { payload: appCheck }
    throw new Error('signature verification failed')
  })
}

async function failure(promise) {
  try {
    await promise
  } catch (caught) {
    expect(caught).toBeInstanceOf(AuthError)
    return { status: caught.status, message: caught.message }
  }
  throw new Error('expected verifyRequest to throw')
}

beforeEach(() => {
  for (const name of ENV) saved[name] = process.env[name]
  process.env.FIREBASE_PROJECT_ID = 'demo-project'
  process.env.FIREBASE_PROJECT_NUMBER = '123456789'
  delete process.env.APPCHECK_ENFORCE
  jwtVerify.mockReset()
})

afterEach(() => {
  for (const name of ENV) {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  }
})

describe('App Check, not yet enforced', () => {
  it('does not ask for a token, so deploying the code changes nothing', async () => {
    tokens()
    await expect(verifyRequest(req())).resolves.toBe('uid-1')
    expect(jwtVerify).toHaveBeenCalledTimes(1) // the account token only
  })

  it('treats anything but the exact word "true" as off', async () => {
    tokens()
    process.env.APPCHECK_ENFORCE = 'false'
    await expect(verifyRequest(req())).resolves.toBe('uid-1')
    process.env.APPCHECK_ENFORCE = '1'
    await expect(verifyRequest(req())).resolves.toBe('uid-1')
  })
})

describe('App Check, enforced', () => {
  beforeEach(() => {
    process.env.APPCHECK_ENFORCE = 'true'
  })

  it('serves a verified account whose request carries a valid App Check token', async () => {
    tokens()
    await expect(verifyRequest(req({ 'x-firebase-appcheck': 'app-check-token' }))).resolves.toBe('uid-1')
  })

  it('checks the token against the project NUMBER, with RS256 only', async () => {
    tokens()
    await verifyRequest(req({ 'x-firebase-appcheck': 'app-check-token' }))
    expect(jwtVerify).toHaveBeenLastCalledWith('app-check-token', 'JWKS', {
      issuer: 'https://firebaseappcheck.googleapis.com/123456789',
      audience: 'projects/123456789',
      algorithms: ['RS256'],
    })
  })

  it('refuses a request with no App Check token (403), without verifying anything for it', async () => {
    tokens()
    expect(await failure(verifyRequest(req()))).toEqual({ status: 403, message: 'App Check verification failed.' })
    expect(await failure(verifyRequest(req({ 'x-firebase-appcheck': '   ' })))).toEqual({
      status: 403,
      message: 'App Check verification failed.',
    })
    expect(jwtVerify.mock.calls.every(([token]) => token === 'id-token')).toBe(true)
  })

  it('refuses a token that does not verify (403), saying nothing about why', async () => {
    tokens()
    expect(await failure(verifyRequest(req({ 'x-firebase-appcheck': 'forged' })))).toEqual({
      status: 403,
      message: 'App Check verification failed.',
    })
  })

  it('is a server error, not a client one, when the project number is not configured', async () => {
    tokens()
    delete process.env.FIREBASE_PROJECT_NUMBER
    expect((await failure(verifyRequest(req({ 'x-firebase-appcheck': 'app-check-token' })))).status).toBe(500)
  })

  it('still answers 401 first for a bad account token', async () => {
    tokens()
    const bad = { headers: { authorization: 'Bearer nope', 'x-firebase-appcheck': 'app-check-token' } }
    expect((await failure(verifyRequest(bad))).status).toBe(401)
  })
})
