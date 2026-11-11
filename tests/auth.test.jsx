/* api/_lib/auth.js — what a Firebase ID token has to carry before any route
 * that costs us something will serve it. `jose` is mocked: these tests are
 * about the claims this file insists on, not about RS256 itself.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('jose', () => ({ createRemoteJWKSet: vi.fn(() => 'JWKS'), jwtVerify: vi.fn() }))

import { jwtVerify } from 'jose'
import { AuthError, verifyRequest } from '../api/_lib/auth.js'

const req = (header = 'Bearer token-1') => ({ headers: header === null ? {} : { authorization: header } })
const claims = (payload) => jwtVerify.mockResolvedValue({ payload })

/** What verifyRequest threw, as { status, message }. */
async function failure(promise) {
  try {
    await promise
  } catch (caught) {
    expect(caught).toBeInstanceOf(AuthError)
    return { status: caught.status, message: caught.message }
  }
  throw new Error('expected verifyRequest to throw')
}

let savedProject

beforeEach(() => {
  savedProject = process.env.FIREBASE_PROJECT_ID
  process.env.FIREBASE_PROJECT_ID = 'demo-project'
  jwtVerify.mockReset()
})

afterEach(() => {
  if (savedProject === undefined) delete process.env.FIREBASE_PROJECT_ID
  else process.env.FIREBASE_PROJECT_ID = savedProject
})

describe('verifyRequest', () => {
  it('returns the uid of a verified account', async () => {
    claims({ sub: 'uid-1', email_verified: true })
    await expect(verifyRequest(req())).resolves.toBe('uid-1')
  })

  it('checks the signature against this project, and only accepts RS256', async () => {
    claims({ sub: 'uid-1', email_verified: true })
    await verifyRequest(req())
    expect(jwtVerify).toHaveBeenCalledWith('token-1', 'JWKS', {
      issuer: 'https://securetoken.google.com/demo-project',
      audience: 'demo-project',
      algorithms: ['RS256'],
    })
  })

  it('refuses an account whose email address is not verified (403)', async () => {
    claims({ sub: 'uid-1', email_verified: false })
    expect(await failure(verifyRequest(req()))).toEqual({
      status: 403,
      message: 'Verify your email address to use this feature.',
    })
    claims({ sub: 'uid-1' })
    expect((await failure(verifyRequest(req()))).status).toBe(403)
  })

  it('lets a caller opt out of the verified-email rule (account deletion)', async () => {
    claims({ sub: 'uid-1', email_verified: false })
    await expect(verifyRequest(req(), { requireVerifiedEmail: false })).resolves.toBe('uid-1')
  })

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a string', 42],
    ['too long', 'u'.repeat(129)],
  ])('refuses a token whose subject is %s (401)', async (_label, sub) => {
    claims({ sub, email_verified: true })
    expect((await failure(verifyRequest(req()))).status).toBe(401)
  })

  it('refuses a token that fails verification (401)', async () => {
    jwtVerify.mockRejectedValue(new Error('signature verification failed'))
    expect(await failure(verifyRequest(req()))).toEqual({ status: 401, message: 'Invalid or expired token.' })
  })

  it('refuses a request with no bearer token, without verifying anything', async () => {
    expect((await failure(verifyRequest(req(null)))).status).toBe(401)
    expect((await failure(verifyRequest(req('Basic abc')))).status).toBe(401)
    expect(jwtVerify).not.toHaveBeenCalled()
  })

  it('is a server error, not a client one, when the project id is not configured', async () => {
    delete process.env.FIREBASE_PROJECT_ID
    expect((await failure(verifyRequest(req()))).status).toBe(500)
  })
})
