/* ensureConfigured() — the VAPID settings check, against the REAL web-push
 * library (the handler tests mock this module out). Its job is to turn "push
 * silently doesn't work" into one specific sentence: which setting is missing,
 * or what web-push objected to in the ones that are there. A wrong
 * VAPID_SUBJECT (say, a bare domain with no https://) used to surface as a
 * generic "Internal error." — after the due reminders had already been taken
 * off the queue.
 *
 * Named .test.jsx to route through vitest's node project; nothing here
 * touches the DOM.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import webpush from 'web-push'

const keys = webpush.generateVAPIDKeys()
const NAMES = ['VAPID_SUBJECT', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']
const saved = {}

/** A fresh copy of the module each time: it remembers having been configured. */
async function load() {
  vi.resetModules()
  return import('../api/_lib/webPush.js')
}

function validEnv(overrides = {}) {
  process.env.VAPID_SUBJECT = 'https://cadenceplan.vercel.app'
  process.env.VAPID_PUBLIC_KEY = keys.publicKey
  process.env.VAPID_PRIVATE_KEY = keys.privateKey
  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
}

/** What ensureConfigured throws, as { status, message }, or null if it doesn't. */
function attempt(fn) {
  try {
    fn()
    return null
  } catch (caught) {
    return { status: caught.status, message: caught.message }
  }
}

beforeEach(() => {
  for (const name of NAMES) saved[name] = process.env[name]
})

afterEach(() => {
  for (const name of NAMES) {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  }
})

describe('ensureConfigured', () => {
  it('accepts a proper https subject and a generated key pair', async () => {
    validEnv()
    const { ensureConfigured } = await load()
    expect(attempt(ensureConfigured)).toBeNull()
  })

  it('also accepts a mailto: subject', async () => {
    validEnv({ VAPID_SUBJECT: 'mailto:someone@example.test' })
    const { ensureConfigured } = await load()
    expect(attempt(ensureConfigured)).toBeNull()
  })

  it('names every missing setting when nothing is set', async () => {
    validEnv({ VAPID_SUBJECT: undefined, VAPID_PUBLIC_KEY: undefined, VAPID_PRIVATE_KEY: undefined })
    const { ensureConfigured } = await load()
    expect(attempt(ensureConfigured)).toEqual({
      status: 500,
      message: 'Server is missing VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.',
    })
  })

  it('names only the one that is missing', async () => {
    validEnv({ VAPID_SUBJECT: undefined })
    const { ensureConfigured } = await load()
    expect(attempt(ensureConfigured)).toEqual({ status: 500, message: 'Server is missing VAPID_SUBJECT.' })
  })

  it('treats a blank or whitespace-only value as missing', async () => {
    validEnv({ VAPID_PRIVATE_KEY: '   ' })
    const { ensureConfigured } = await load()
    expect(attempt(ensureConfigured)).toEqual({ status: 500, message: 'Server is missing VAPID_PRIVATE_KEY.' })
  })

  it('says a subject without a scheme is invalid, instead of a generic internal error', async () => {
    validEnv({ VAPID_SUBJECT: 'cadenceplan.vercel.app' })
    const { ensureConfigured } = await load()
    const failure = attempt(ensureConfigured)
    expect(failure.status).toBe(500)
    expect(failure.message).toMatch(/^VAPID configuration is invalid: /)
    expect(failure.message).toContain('cadenceplan.vercel.app')
  })

  it('says a malformed key is invalid', async () => {
    validEnv({ VAPID_PUBLIC_KEY: 'not a real key' })
    const { ensureConfigured } = await load()
    const failure = attempt(ensureConfigured)
    expect(failure.status).toBe(500)
    expect(failure.message).toMatch(/^VAPID configuration is invalid: /)
  })

  it('shrugs off stray whitespace around values, as pasted env vars often carry', async () => {
    validEnv({
      VAPID_SUBJECT: '  https://cadenceplan.vercel.app\n',
      VAPID_PUBLIC_KEY: `${keys.publicKey}\r\n`,
      VAPID_PRIVATE_KEY: ` ${keys.privateKey} `,
    })
    const { ensureConfigured } = await load()
    expect(attempt(ensureConfigured)).toBeNull()
  })

  it('does not stay "configured" after a failure: fixing the setting is enough', async () => {
    validEnv({ VAPID_SUBJECT: 'cadenceplan.vercel.app' })
    const { ensureConfigured } = await load()
    expect(attempt(ensureConfigured)).not.toBeNull()

    process.env.VAPID_SUBJECT = 'https://cadenceplan.vercel.app'
    expect(attempt(ensureConfigured)).toBeNull()
  })

  it('does the work once and stays quiet afterwards', async () => {
    validEnv()
    const { ensureConfigured } = await load()
    expect(attempt(ensureConfigured)).toBeNull()
    delete process.env.VAPID_PRIVATE_KEY // already applied; a second call is a no-op
    expect(attempt(ensureConfigured)).toBeNull()
  })
})

describe('getPublicKey', () => {
  it('returns the public key, trimmed', async () => {
    validEnv({ VAPID_PUBLIC_KEY: `  ${keys.publicKey}\n` })
    const { getPublicKey } = await load()
    expect(getPublicKey()).toBe(keys.publicKey)
  })

  it('is null when there is none', async () => {
    validEnv({ VAPID_PUBLIC_KEY: undefined })
    const { getPublicKey } = await load()
    expect(getPublicKey()).toBeNull()
  })
})

describe('sendPush before the server is configured', () => {
  it('throws the configuration error instead of reporting a delivery failure', async () => {
    validEnv({ VAPID_SUBJECT: undefined })
    const { sendPush } = await load()
    // A delivery failure is a return value; a missing setting must not hide as one.
    await expect(
      sendPush({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'p', auth: 'a' } }, {}),
    ).rejects.toMatchObject({ status: 500, message: 'Server is missing VAPID_SUBJECT.' })
  })
})
