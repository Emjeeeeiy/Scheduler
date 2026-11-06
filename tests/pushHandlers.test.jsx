/* The /api/push/* routes end to end through their real glue and the real
 * pushStore, against an in-memory Redis (tests/fakeRedis.js). Only the edges
 * are mocked: verifyRequest (JWKS needs a live Firebase project) and sendPush
 * (a real send needs a real browser subscription).
 *
 * What this DOES prove: who owns a device and what happens when that changes,
 * that an overlapping pair of ticks never sends one reminder twice, that a
 * reminder too late to be useful is dropped instead of sent, that a dead
 * device is forgotten, and that bad input is refused before it reaches Redis.
 * What it does NOT: that web-push's encryption is accepted by FCM / Mozilla /
 * Apple — that needs a real device, see README-push.md's checklist.
 *
 * Named .test.jsx to route through vitest's node project (vitest.config.js);
 * nothing here touches the DOM.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REMINDER_KINDS } from '@cadence/shared/reminders.js'
import { FakeRedis } from './fakeRedis.js'

const holder = vi.hoisted(() => ({ redis: null }))

vi.mock('../api/_lib/auth.js', async () => {
  const actual = await vi.importActual('../api/_lib/auth.js')
  return { ...actual, verifyRequest: vi.fn() }
})
vi.mock('../api/_lib/webPush.js', () => ({
  sendPush: vi.fn(),
  ensureConfigured: vi.fn(),
  getPublicKey: vi.fn(),
}))
vi.mock('../api/_lib/redis.js', () => ({ getRedis: () => holder.redis }))

import { AuthError, verifyRequest } from '../api/_lib/auth.js'
import { ensureConfigured, getPublicKey, sendPush } from '../api/_lib/webPush.js'
import { STALE_AFTER_MS, isPushEndpoint } from '../api/_lib/pushInput.js'
import { ApiError } from '../api/_lib/pushRoute.js'
import { createPushStore, subIdOf } from '../api/_lib/pushStore.js'
import subscribeHandler from '../api/push/subscribe.js'
import unsubscribeHandler from '../api/push/unsubscribe.js'
import scheduleHandler from '../api/push/schedule.js'
import tickHandler from '../api/push/tick.js'
import diagnoseHandler from '../api/push/diagnose.js'

const NOW = Date.UTC(2026, 7, 24, 12, 0, 0)
const MIN = 60_000

const P256DH = Buffer.alloc(65, 7).toString('base64url')
const AUTH = Buffer.alloc(16, 9).toString('base64url')
const device = (n = 1, host = 'fcm.googleapis.com') => ({
  endpoint: `https://${host}/fcm/send/device-${n}`,
  keys: { p256dh: P256DH, auth: AUTH },
})

const reminder = (id, fireAt, patch = {}) => ({
  id,
  kind: 'start',
  fireAt,
  title: 'Standup',
  body: 'Happening now · 30m',
  tag: `now-${id}`,
  url: '/',
  ...patch,
})

function fakeReq({ method = 'POST', body = {}, headers } = {}) {
  return { method, body, headers: headers ?? { authorization: 'Bearer token' } }
}

function fakeRes() {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, value) {
      res.headers[name] = value
    },
    status(code) {
      res.statusCode = code
      return res
    },
    json(payload) {
      res.body = payload
      return res
    },
  }
  return res
}

async function call(handler, req) {
  const res = fakeRes()
  await handler(req, res)
  return res
}

const cronHeaders = { authorization: 'Bearer cron-secret' }
const tick = (headers = cronHeaders) => call(tickHandler, fakeReq({ method: 'GET', headers }))

let redis
let store

/** A device registered to an account, and a schedule — set up through the
    store so each test starts from the state it is actually about. */
const register = (uid, sub = device(1)) => store.upsertSubscription(uid, sub, { ua: 'test' })
const schedule = (uid, reminders) => store.replaceSchedule(uid, reminders)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.resetAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  redis = new FakeRedis()
  holder.redis = redis
  store = createPushStore(redis)
  process.env.CRON_SECRET = 'cron-secret'
  verifyRequest.mockResolvedValue('uid-1')
  sendPush.mockResolvedValue({ ok: true, gone: false, retryable: false, status: 201 })
  ensureConfigured.mockReturnValue(undefined)
  getPublicKey.mockReturnValue('server-public-key')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('shared contract', () => {
  it('knows exactly the reminder kinds the client schedules', () => {
    expect(Object.keys(STALE_AFTER_MS).sort()).toEqual([...REMINDER_KINDS].sort())
  })

  it('refuses every route for the wrong method', async () => {
    for (const handler of [subscribeHandler, unsubscribeHandler, scheduleHandler, diagnoseHandler]) {
      const res = await call(handler, fakeReq({ method: 'GET' }))
      expect(res.statusCode).toBe(405)
      expect(res.headers.Allow).toBe('POST')
    }
    expect((await call(tickHandler, fakeReq({ method: 'DELETE', headers: cronHeaders }))).statusCode).toBe(405)
  })
})

describe('push endpoints', () => {
  it('accepts the push services real browsers use', () => {
    for (const url of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://fcm.googleapis.com/wp/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/abc',
      'https://wns2-par02p.notify.windows.com/w/?token=abc',
    ]) {
      expect(isPushEndpoint(url), url).toBe(true)
    }
  })

  it('refuses anything else, so the server can’t be pointed at an arbitrary address', () => {
    for (const url of [
      'http://fcm.googleapis.com/fcm/send/abc', // not https
      'https://localhost/x',
      'https://169.254.169.254/latest/meta-data',
      'https://example.com/x',
      'https://fcm.googleapis.com.evil.test/x', // suffix trick
      'https://evilfcm.googleapis.com.example/x',
      'https://user:pw@fcm.googleapis.com/x', // credentials
      'https://fcm.googleapis.com:8443/x', // odd port
      'not a url',
      '',
      null,
    ]) {
      expect(isPushEndpoint(url), String(url)).toBe(false)
    }
  })
})

describe('POST /api/push/subscribe', () => {
  it('registers the device against the signed-in account', async () => {
    const sub = device(1)
    const res = await call(
      subscribeHandler,
      fakeReq({ body: { subscription: sub }, headers: { authorization: 'Bearer t', 'user-agent': 'TestBrowser/1.0' } }),
    )

    expect(res.statusCode).toBe(200)
    const id = subIdOf(sub.endpoint)
    expect(await redis.smembers('push:subs:uid-1')).toEqual([id])
    expect(JSON.parse(await redis.get(`push:sub:${id}`))).toMatchObject({
      uid: 'uid-1',
      endpoint: sub.endpoint,
      keys: sub.keys,
      ua: 'TestBrowser/1.0',
    })
  })

  it('does not duplicate a device that registers twice', async () => {
    const sub = device(1)
    await call(subscribeHandler, fakeReq({ body: { subscription: sub } }))
    await call(subscribeHandler, fakeReq({ body: { subscription: sub } }))
    expect(await redis.smembers('push:subs:uid-1')).toHaveLength(1)
  })

  it('refuses a bare call with neither a session nor an old endpoint', async () => {
    const res = await call(subscribeHandler, fakeReq({ body: { subscription: device(1) }, headers: {} }))
    expect(res.statusCode).toBe(401)
    expect(redis.keys()).toEqual([])
  })

  it('refuses a bad token outright, even when a valid old endpoint came with it', async () => {
    await register('uid-1', device(1))
    verifyRequest.mockRejectedValue(new AuthError(401, 'Invalid or expired token.'))
    const res = await call(
      subscribeHandler,
      fakeReq({ body: { subscription: device(2), oldEndpoint: device(1).endpoint } }),
    )
    expect(res.statusCode).toBe(401)
    expect(await redis.smembers('push:subs:uid-1')).toEqual([subIdOf(device(1).endpoint)])
  })

  it('refuses a subscription that isn’t a real push endpoint or has malformed keys', async () => {
    const bad = [
      { endpoint: 'https://example.com/x', keys: device(1).keys },
      { endpoint: 'http://fcm.googleapis.com/x', keys: device(1).keys },
      { endpoint: device(1).endpoint, keys: { p256dh: P256DH } },
      { endpoint: device(1).endpoint, keys: { p256dh: 'short', auth: AUTH } },
      { endpoint: device(1).endpoint, keys: { p256dh: P256DH, auth: Buffer.alloc(8).toString('base64url') } },
      { endpoint: device(1).endpoint },
      null,
    ]
    for (const subscription of bad) {
      const res = await call(subscribeHandler, fakeReq({ body: { subscription } }))
      expect(res.statusCode, JSON.stringify(subscription)).toBe(400)
    }
    expect(redis.keys()).toEqual([])
  })

  it('hands a shared device to whoever signed in last', async () => {
    const shared = device(1)
    await register('uid-1', shared)
    verifyRequest.mockResolvedValue('uid-2')

    await call(subscribeHandler, fakeReq({ body: { subscription: shared } }))

    const id = subIdOf(shared.endpoint)
    expect(await redis.smembers('push:subs:uid-1')).toEqual([])
    expect(await redis.smembers('push:subs:uid-2')).toEqual([id])
    expect(JSON.parse(await redis.get(`push:sub:${id}`)).uid).toBe('uid-2')
  })

  it('clears the previous owner’s schedule when the takeover leaves them no device', async () => {
    const shared = device(1)
    await register('uid-1', shared)
    await schedule('uid-1', [reminder('a', NOW + 5 * MIN)])
    verifyRequest.mockResolvedValue('uid-2')

    await call(subscribeHandler, fakeReq({ body: { subscription: shared } }))

    expect(redis.queue()).toEqual([])
    expect(redis.has('push:rem:uid-1')).toBe(false)
  })

  it('keeps the previous owner’s schedule while they still have another device', async () => {
    await register('uid-1', device(1))
    await register('uid-1', device(2))
    await schedule('uid-1', [reminder('a', NOW + 5 * MIN)])
    verifyRequest.mockResolvedValue('uid-2')

    await call(subscribeHandler, fakeReq({ body: { subscription: device(1) } }))

    expect(redis.queue()).toEqual(['uid-1|a'])
  })

  describe('after the browser rotates the subscription (no session in a service worker)', () => {
    it('moves the account’s device to the new endpoint and keeps the schedule', async () => {
      await register('uid-1', device(1))
      await schedule('uid-1', [reminder('a', NOW + 5 * MIN)])

      const res = await call(
        subscribeHandler,
        fakeReq({ body: { oldEndpoint: device(1).endpoint, subscription: device(2) }, headers: {} }),
      )

      expect(res.statusCode).toBe(200)
      expect(verifyRequest).not.toHaveBeenCalled()
      expect(await redis.smembers('push:subs:uid-1')).toEqual([subIdOf(device(2).endpoint)])
      expect(redis.has(`push:sub:${subIdOf(device(1).endpoint)}`)).toBe(false)
      expect(redis.queue()).toEqual(['uid-1|a'])
    })

    it('does not trust an old endpoint it has never seen', async () => {
      const res = await call(
        subscribeHandler,
        fakeReq({ body: { oldEndpoint: device(9).endpoint, subscription: device(2) }, headers: {} }),
      )
      expect(res.statusCode).toBe(404)
      expect(redis.keys()).toEqual([])
    })

    it('leaves the device registered when the “new” subscription is the old one', async () => {
      await register('uid-1', device(1))
      const res = await call(
        subscribeHandler,
        fakeReq({ body: { oldEndpoint: device(1).endpoint, subscription: device(1) }, headers: {} }),
      )
      expect(res.statusCode).toBe(200)
      expect(await redis.smembers('push:subs:uid-1')).toEqual([subIdOf(device(1).endpoint)])
    })
  })
})

describe('POST /api/push/unsubscribe', () => {
  it('forgets one device by its endpoint, with no session at all', async () => {
    await register('uid-1', device(1))
    const res = await call(unsubscribeHandler, fakeReq({ body: { endpoint: device(1).endpoint }, headers: {} }))
    expect(res.body).toEqual({ ok: true, removed: true })
    expect(verifyRequest).not.toHaveBeenCalled()
    expect(redis.keys()).toEqual([])
  })

  it('shrugs at an endpoint it never knew', async () => {
    const res = await call(unsubscribeHandler, fakeReq({ body: { endpoint: device(5).endpoint }, headers: {} }))
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ ok: true, removed: false })
  })

  it('asks for an endpoint', async () => {
    const res = await call(unsubscribeHandler, fakeReq({ body: {}, headers: {} }))
    expect(res.statusCode).toBe(400)
  })

  it('drops the account’s schedule with its last device, and not before', async () => {
    await register('uid-1', device(1))
    await register('uid-1', device(2))
    await schedule('uid-1', [reminder('a', NOW + 5 * MIN)])

    await call(unsubscribeHandler, fakeReq({ body: { endpoint: device(1).endpoint }, headers: {} }))
    expect(redis.queue()).toEqual(['uid-1|a'])

    await call(unsubscribeHandler, fakeReq({ body: { endpoint: device(2).endpoint }, headers: {} }))
    expect(redis.queue()).toEqual([])
    expect(redis.has('push:rem:uid-1')).toBe(false)
  })

  it('will not purge an account without a valid session', async () => {
    await register('uid-1', device(1))
    verifyRequest.mockRejectedValue(new AuthError(401, 'Missing bearer token.'))
    const res = await call(unsubscribeHandler, fakeReq({ body: { all: true }, headers: {} }))
    expect(res.statusCode).toBe(401)
    expect(await redis.smembers('push:subs:uid-1')).toHaveLength(1)
  })

  it('purges every device and queued reminder for the signed-in account', async () => {
    await register('uid-1', device(1))
    await register('uid-1', device(2))
    await register('uid-2', device(3))
    await schedule('uid-1', [reminder('a', NOW + 5 * MIN)])
    await schedule('uid-2', [reminder('b', NOW + 6 * MIN)])

    const res = await call(unsubscribeHandler, fakeReq({ body: { all: true } }))

    expect(res.body).toEqual({ ok: true, subscriptions: 2, reminders: 1 })
    expect(redis.queue()).toEqual(['uid-2|b']) // the other account is untouched
    expect(await redis.smembers('push:subs:uid-2')).toHaveLength(1)
    expect(redis.keys('push:sub:').length).toBe(1)
  })
})

describe('POST /api/push/schedule', () => {
  it('needs a signed-in account', async () => {
    verifyRequest.mockRejectedValue(new AuthError(401, 'Missing bearer token.'))
    const res = await call(scheduleHandler, fakeReq({ body: { reminders: [reminder('a', NOW + 5 * MIN)] }, headers: {} }))
    expect(res.statusCode).toBe(401)
    expect(redis.keys()).toEqual([])
  })

  it('stores each reminder and queues it by its due time', async () => {
    const res = await call(
      scheduleHandler,
      fakeReq({ body: { reminders: [reminder('late', NOW + 30 * MIN), reminder('soon', NOW + 5 * MIN)] } }),
    )

    expect(res.body).toEqual({ ok: true, count: 2, skipped: 0 })
    expect(redis.queue()).toEqual(['uid-1|soon', 'uid-1|late'])
    expect(redis.score('push:queue', 'uid-1|soon')).toBe(NOW + 5 * MIN)
    expect(JSON.parse(await redis.hget('push:rem:uid-1', 'soon'))).toMatchObject({
      id: 'soon',
      kind: 'start',
      fireAt: NOW + 5 * MIN,
      title: 'Standup',
      body: 'Happening now · 30m',
      tag: 'now-soon',
      url: '/',
    })
  })

  it('replaces the previous schedule wholesale', async () => {
    await schedule('uid-1', [reminder('old', NOW + 5 * MIN), reminder('keep', NOW + 6 * MIN)])
    await call(scheduleHandler, fakeReq({ body: { reminders: [reminder('keep', NOW + 7 * MIN), reminder('new', NOW + 8 * MIN)] } }))

    expect(redis.queue()).toEqual(['uid-1|keep', 'uid-1|new'])
    expect(await redis.hkeys('push:rem:uid-1')).toEqual(['keep', 'new'])
    expect(redis.score('push:queue', 'uid-1|keep')).toBe(NOW + 7 * MIN)
  })

  it('clears the schedule when the app sends an empty list', async () => {
    await schedule('uid-1', [reminder('a', NOW + 5 * MIN)])
    const res = await call(scheduleHandler, fakeReq({ body: { reminders: [] } }))
    expect(res.body.count).toBe(0)
    expect(redis.queue()).toEqual([])
    expect(redis.has('push:rem:uid-1')).toBe(false)
  })

  it('drops what it can’t use and says how much, instead of failing the lot', async () => {
    const good = reminder('good', NOW + 5 * MIN)
    const res = await call(
      scheduleHandler,
      fakeReq({
        body: {
          reminders: [
            good,
            reminder('past', NOW - 5 * MIN), // already missed
            reminder('far', NOW + 16 * 24 * 60 * MIN), // beyond the window
            reminder('bad kind', NOW + MIN, { kind: 'shout' }),
            reminder('pipe|id', NOW + MIN),
            reminder('no-title', NOW + MIN, { title: '   ' }),
            reminder('nan', Number.NaN),
            { id: 'x' },
            'nonsense',
            null,
          ],
        },
      }),
    )
    expect(res.body).toEqual({ ok: true, count: 1, skipped: 9 })
    expect(redis.queue()).toEqual(['uid-1|good'])
  })

  it('allows a reminder a few seconds late, for clock skew', async () => {
    const res = await call(scheduleHandler, fakeReq({ body: { reminders: [reminder('a', NOW - 30_000)] } }))
    expect(res.body.count).toBe(1)
  })

  it('lets the later of two reminders with the same id win', async () => {
    await call(
      scheduleHandler,
      fakeReq({ body: { reminders: [reminder('a', NOW + 5 * MIN), reminder('a', NOW + 9 * MIN, { title: 'Moved' })] } }),
    )
    expect(redis.queue()).toEqual(['uid-1|a'])
    expect(JSON.parse(await redis.hget('push:rem:uid-1', 'a')).title).toBe('Moved')
  })

  it('clips long text and only allows a same-site click target', async () => {
    await call(
      scheduleHandler,
      fakeReq({
        body: {
          reminders: [
            reminder('a', NOW + MIN, { title: 'T'.repeat(500), body: 'B'.repeat(900), url: 'https://evil.test/' }),
            reminder('b', NOW + MIN, { url: '//evil.test/' }),
            reminder('c', NOW + MIN, { url: '/\\evil.test' }),
            reminder('d', NOW + MIN, { url: '/?view=focus' }),
          ],
        },
      }),
    )
    const a = JSON.parse(await redis.hget('push:rem:uid-1', 'a'))
    expect(a.title).toHaveLength(200)
    expect(a.body).toHaveLength(300)
    expect(a.url).toBe('/')
    expect(JSON.parse(await redis.hget('push:rem:uid-1', 'b')).url).toBe('/')
    expect(JSON.parse(await redis.hget('push:rem:uid-1', 'c')).url).toBe('/')
    expect(JSON.parse(await redis.hget('push:rem:uid-1', 'd')).url).toBe('/?view=focus')
  })

  it('never cuts an emoji in half', async () => {
    await call(scheduleHandler, fakeReq({ body: { reminders: [reminder('a', NOW + MIN, { title: '🔔'.repeat(300) })] } }))
    const { title } = JSON.parse(await redis.hget('push:rem:uid-1', 'a'))
    expect([...title]).toHaveLength(200)
    expect(title).toBe('🔔'.repeat(200))
  })

  it('refuses a body that isn’t a list, or is too long', async () => {
    for (const reminders of [undefined, 'a', {}, 5]) {
      const res = await call(scheduleHandler, fakeReq({ body: { reminders } }))
      expect(res.statusCode).toBe(400)
    }
    const many = Array.from({ length: 1001 }, (_, i) => reminder(`r${i}`, NOW + MIN))
    expect((await call(scheduleHandler, fakeReq({ body: { reminders: many } }))).statusCode).toBe(400)
    const max = Array.from({ length: 1000 }, (_, i) => reminder(`r${i}`, NOW + MIN))
    expect((await call(scheduleHandler, fakeReq({ body: { reminders: max } }))).body.count).toBe(1000)
  })

  it('accepts a body delivered as a JSON string, and rejects one that isn’t JSON', async () => {
    const asString = JSON.stringify({ reminders: [reminder('a', NOW + MIN)] })
    expect((await call(scheduleHandler, fakeReq({ body: asString }))).body.count).toBe(1)
    expect((await call(scheduleHandler, fakeReq({ body: '{not json' }))).statusCode).toBe(400)
  })

  it('keeps one account’s schedule out of another’s', async () => {
    await schedule('uid-2', [reminder('theirs', NOW + 5 * MIN)])
    await call(scheduleHandler, fakeReq({ body: { reminders: [reminder('mine', NOW + 5 * MIN)] } }))
    expect(redis.queue()).toEqual(['uid-1|mine', 'uid-2|theirs'])
  })

  it('lets an abandoned schedule expire on its own', async () => {
    await call(scheduleHandler, fakeReq({ body: { reminders: [reminder('a', NOW + MIN)] } }))
    expect(redis.ttls.get('push:rem:uid-1')).toBe(16 * 24 * 60 * 60)
  })
})

describe('GET|POST /api/push/tick', () => {
  describe('who may call it', () => {
    it('is unusable until CRON_SECRET is configured', async () => {
      delete process.env.CRON_SECRET
      const res = await tick({ authorization: 'Bearer ' })
      expect(res.statusCode).toBe(500)
    })

    it('turns away a missing or wrong secret', async () => {
      await register('uid-1')
      await schedule('uid-1', [reminder('a', NOW - 10_000)])
      for (const headers of [{}, { authorization: 'Bearer nope' }, { authorization: 'cron-secret' }, { authorization: 'Bearer cron-secret-and-more' }]) {
        const res = await tick(headers)
        expect(res.statusCode, JSON.stringify(headers)).toBe(401)
      }
      expect(sendPush).not.toHaveBeenCalled()
      expect(redis.queue()).toEqual(['uid-1|a']) // nothing was claimed
    })

    it('answers to both GET and POST', async () => {
      expect((await call(tickHandler, fakeReq({ method: 'GET', headers: cronHeaders }))).statusCode).toBe(200)
      expect((await call(tickHandler, fakeReq({ method: 'POST', headers: cronHeaders }))).statusCode).toBe(200)
    })
  })

  it('does nothing, cheaply, when nothing is due', async () => {
    await register('uid-1')
    await schedule('uid-1', [reminder('later', NOW + 30 * MIN)])
    const res = await tick()
    expect(res.body).toEqual({
      claimed: 0,
      sent: 0,
      dropped: 0,
      retried: 0,
      removedSubs: 0,
      rejected: 0,
      failed: 0,
      statuses: {},
    })
    expect(sendPush).not.toHaveBeenCalled()
    expect(redis.queue()).toEqual(['uid-1|later'])
  })

  it('sends a due reminder to every device the account has', async () => {
    await register('uid-1', device(1))
    await register('uid-1', device(2, 'updates.push.services.mozilla.com'))
    await schedule('uid-1', [reminder('a', NOW + MIN, { kind: 'soon', title: 'Dentist', body: 'Starts in 30m · 9:00 AM', tag: 'soon-a' })])
    vi.setSystemTime(NOW + 90_000)

    const res = await tick()

    expect(res.body).toEqual({
      claimed: 1,
      sent: 1,
      dropped: 0,
      retried: 0,
      removedSubs: 0,
      rejected: 0,
      failed: 0,
      statuses: { 201: 2 }, // one 201 from each device
    })
    expect(sendPush).toHaveBeenCalledTimes(2)
    const endpoints = sendPush.mock.calls.map(([sub]) => sub.endpoint).sort()
    expect(endpoints).toEqual([device(1).endpoint, device(2, 'updates.push.services.mozilla.com').endpoint].sort())
    const [sub, payload, options] = sendPush.mock.calls[0]
    expect(sub.keys).toEqual({ p256dh: P256DH, auth: AUTH })
    expect(payload).toEqual({ title: 'Dentist', body: 'Starts in 30m · 9:00 AM', tag: 'soon-a', url: '/', kind: 'soon' })
    expect(options.urgency).toBe('high')
  })

  it('sends only the account’s own reminders to the account’s own devices', async () => {
    await register('uid-1', device(1))
    await register('uid-2', device(2))
    await schedule('uid-1', [reminder('mine', NOW + MIN)])
    vi.setSystemTime(NOW + 90_000)

    await tick()

    expect(sendPush).toHaveBeenCalledTimes(1)
    expect(sendPush.mock.calls[0][0].endpoint).toBe(device(1).endpoint)
  })

  it('leaves future reminders queued and takes due ones off the queue', async () => {
    await register('uid-1')
    await schedule('uid-1', [reminder('due', NOW + MIN), reminder('future', NOW + 30 * MIN)])
    vi.setSystemTime(NOW + 2 * MIN)

    await tick()

    expect(redis.queue()).toEqual(['uid-1|future'])
    expect(await redis.hkeys('push:rem:uid-1')).toEqual(['future'])
  })

  it('sends each reminder once: the next run finds nothing', async () => {
    await register('uid-1')
    await schedule('uid-1', [reminder('a', NOW + MIN)])
    vi.setSystemTime(NOW + 90_000)

    await tick()
    vi.setSystemTime(NOW + 150_000)
    const second = await tick()

    expect(second.body.claimed).toBe(0)
    expect(sendPush).toHaveBeenCalledTimes(1)
  })

  it('never lets two overlapping runs send the same reminder', async () => {
    await register('uid-1')
    await schedule('uid-1', [reminder('a', NOW + MIN), reminder('b', NOW + MIN), reminder('c', NOW + MIN)])
    vi.setSystemTime(NOW + 90_000)

    const [one, two] = await Promise.all([tick(), tick()])

    expect(one.body.claimed + two.body.claimed).toBe(3)
    expect(sendPush).toHaveBeenCalledTimes(3)
    expect(one.body.sent + two.body.sent).toBe(3)
  })

  it('drops a reminder that is too late to be useful, without sending it', async () => {
    await register('uid-1')
    await schedule('uid-1', [reminder('soon', NOW + MIN, { kind: 'soon' })])
    vi.setSystemTime(NOW + MIN + STALE_AFTER_MS.soon + 1_000)

    const res = await tick()

    expect(res.body).toMatchObject({ claimed: 1, sent: 0, dropped: 1 })
    expect(sendPush).not.toHaveBeenCalled()
  })

  it('still sends the morning nudge hours late, which is when it is still worth reading', async () => {
    await register('uid-1')
    await schedule('uid-1', [reminder('nudge', NOW + MIN, { kind: 'nudge', title: 'Overdue', body: '2 overdue: A, B' })])
    vi.setSystemTime(NOW + MIN + 2 * 60 * MIN)

    const res = await tick()

    expect(res.body.sent).toBe(1)
  })

  it('tells the push service to stop holding a reminder once it stops being useful', async () => {
    await register('uid-1')
    await schedule('uid-1', [reminder('a', NOW + MIN, { kind: 'soon' })])
    vi.setSystemTime(NOW + MIN + 60_000) // one minute late, ten allowed

    await tick()

    const [, , options] = sendPush.mock.calls[0]
    expect(options.ttl).toBe((STALE_AFTER_MS.soon - 60_000) / 1000)
  })

  it('drops a reminder the account replaced after it was queued', async () => {
    await register('uid-1')
    await schedule('uid-1', [reminder('a', NOW + MIN)])
    await redis.hdel('push:rem:uid-1', 'a') // payload gone, queue entry left behind
    vi.setSystemTime(NOW + 90_000)

    const res = await tick()

    expect(res.body).toMatchObject({ claimed: 1, sent: 0, dropped: 1 })
    expect(sendPush).not.toHaveBeenCalled()
  })

  it('drops a reminder for an account with no device left', async () => {
    await schedule('uid-1', [reminder('a', NOW + MIN)])
    vi.setSystemTime(NOW + 90_000)
    const res = await tick()
    expect(res.body).toMatchObject({ claimed: 1, sent: 0, dropped: 1 })
  })

  describe('when delivery doesn’t go through', () => {
    it('forgets a device the push service says is gone, and the schedule with its last one', async () => {
      await register('uid-1', device(1))
      await schedule('uid-1', [reminder('a', NOW + MIN), reminder('b', NOW + 30 * MIN)])
      sendPush.mockResolvedValue({ ok: false, gone: true, retryable: false, status: 410 })
      vi.setSystemTime(NOW + 90_000)

      const res = await tick()

      expect(res.body).toMatchObject({ sent: 0, dropped: 1, removedSubs: 1 })
      expect(await redis.smembers('push:subs:uid-1')).toEqual([])
      expect(redis.queue()).toEqual([]) // 'b' had no device left to go to
    })

    it('keeps going when one device is gone and another is fine', async () => {
      await register('uid-1', device(1))
      await register('uid-1', device(2))
      await schedule('uid-1', [reminder('a', NOW + MIN), reminder('b', NOW + 30 * MIN)])
      sendPush.mockImplementation(async (sub) =>
        sub.endpoint === device(1).endpoint
          ? { ok: false, gone: true, retryable: false, status: 404 }
          : { ok: true, gone: false, retryable: false, status: 201 },
      )
      vi.setSystemTime(NOW + 90_000)

      const res = await tick()

      expect(res.body).toMatchObject({ sent: 1, dropped: 0, removedSubs: 1 })
      expect(await redis.smembers('push:subs:uid-1')).toEqual([subIdOf(device(2).endpoint)])
      expect(redis.queue()).toEqual(['uid-1|b']) // still has a device, so still scheduled
    })

    it('puts a reminder back for the next minute after a transient failure, then gives up', async () => {
      await register('uid-1')
      await schedule('uid-1', [reminder('a', NOW + MIN)])
      sendPush.mockResolvedValue({ ok: false, gone: false, retryable: true, status: 503 })

      vi.setSystemTime(NOW + 90_000)
      const first = await tick()
      expect(first.body).toMatchObject({ retried: 1, dropped: 0 })
      expect(redis.queue()).toEqual(['uid-1|a'])
      expect(redis.score('push:queue', 'uid-1|a')).toBe(NOW + 90_000 + MIN)
      expect(JSON.parse(await redis.hget('push:rem:uid-1', 'a')).attempts).toBe(1)

      vi.setSystemTime(NOW + 90_000 + MIN + 1_000)
      expect((await tick()).body.retried).toBe(1)

      vi.setSystemTime(NOW + 90_000 + 2 * MIN + 2_000)
      const third = await tick()
      expect(third.body).toMatchObject({ retried: 0, dropped: 1 })
      expect(sendPush).toHaveBeenCalledTimes(3)
      expect(redis.queue()).toEqual([])
    })

    it('does not retry a refusal that won’t change', async () => {
      await register('uid-1')
      await schedule('uid-1', [reminder('a', NOW + MIN)])
      sendPush.mockResolvedValue({ ok: false, gone: false, retryable: false, status: 403 })
      vi.setSystemTime(NOW + 90_000)

      const res = await tick()

      expect(res.body).toMatchObject({ retried: 0, dropped: 1, removedSubs: 0 })
      expect(await redis.smembers('push:subs:uid-1')).toHaveLength(1) // a config problem, not a dead device
      expect(redis.queue()).toEqual([])
    })

    it('says WHY a refusal happened: rejected, with the HTTP status counted', async () => {
      await register('uid-1', device(1))
      await register('uid-1', device(2))
      await schedule('uid-1', [reminder('a', NOW + MIN)])
      sendPush.mockResolvedValue({ ok: false, gone: false, retryable: false, status: 403 })
      vi.setSystemTime(NOW + 90_000)

      const res = await tick()

      // A 403 from the push service almost always means the client's and the
      // server's VAPID keys differ — cron-job.org's history should show that.
      expect(res.body).toMatchObject({ claimed: 1, sent: 0, dropped: 1, rejected: 1, statuses: { 403: 2 } })
    })

    it('does not call a dead device a rejection, and counts its status', async () => {
      await register('uid-1')
      await schedule('uid-1', [reminder('a', NOW + MIN)])
      sendPush.mockResolvedValue({ ok: false, gone: true, retryable: false, status: 410 })
      vi.setSystemTime(NOW + 90_000)

      const res = await tick()

      expect(res.body).toMatchObject({ rejected: 0, removedSubs: 1, statuses: { 410: 1 } })
    })

    it('counts a send that got no HTTP answer at all as "none"', async () => {
      await register('uid-1')
      await schedule('uid-1', [reminder('a', NOW + MIN)])
      sendPush.mockResolvedValue({ ok: false, gone: false, retryable: true, status: null })
      vi.setSystemTime(NOW + 90_000)

      expect((await tick()).body).toMatchObject({ retried: 1, statuses: { none: 1 } })
    })

    it('is never cached, since every call has to actually run', async () => {
      const res = await tick()
      expect(res.headers['Cache-Control']).toBe('no-store')
    })
  })

  describe('a misconfigured server', () => {
    it('fails the run loudly and leaves the due reminders QUEUED, instead of consuming them', async () => {
      await register('uid-1')
      await schedule('uid-1', [reminder('a', NOW + MIN), reminder('b', NOW + MIN)])
      ensureConfigured.mockImplementation(() => {
        throw new ApiError(500, 'Server is missing VAPID_SUBJECT.')
      })
      vi.setSystemTime(NOW + 90_000)

      const res = await tick()

      expect(res.statusCode).toBe(500)
      expect(res.body).toEqual({ error: 'Server is missing VAPID_SUBJECT.' })
      expect(sendPush).not.toHaveBeenCalled()
      // The whole point: nothing was claimed, so fixing the setting loses nothing.
      expect(redis.queue()).toEqual(['uid-1|a', 'uid-1|b'])
      expect(await redis.hkeys('push:rem:uid-1')).toEqual(['a', 'b'])
    })

    it('delivers those same reminders once the setting is fixed', async () => {
      await register('uid-1')
      await schedule('uid-1', [reminder('a', NOW + MIN)])
      vi.setSystemTime(NOW + 90_000)

      ensureConfigured.mockImplementationOnce(() => {
        throw new ApiError(500, 'VAPID configuration is invalid: bad subject')
      })
      expect((await tick()).statusCode).toBe(500)

      const fixed = await tick()
      expect(fixed.body).toMatchObject({ claimed: 1, sent: 1 })
    })
  })

  describe('an unexpected error while sending', () => {
    it('puts the reminder back instead of losing it, and gives up after three tries', async () => {
      await register('uid-1')
      await schedule('uid-1', [reminder('a', NOW + MIN)])
      sendPush.mockRejectedValue(new Error('something nobody planned for'))

      vi.setSystemTime(NOW + 90_000)
      expect((await tick()).body).toMatchObject({ claimed: 1, retried: 1, dropped: 0, failed: 0 })
      expect(redis.queue()).toEqual(['uid-1|a'])

      vi.setSystemTime(NOW + 90_000 + MIN + 1_000)
      expect((await tick()).body).toMatchObject({ retried: 1 })

      vi.setSystemTime(NOW + 90_000 + 2 * MIN + 2_000)
      expect((await tick()).body).toMatchObject({ retried: 0, dropped: 1 })
      expect(redis.queue()).toEqual([])
    })

    it('reports it as failed when even requeueing is impossible, rather than hiding it', async () => {
      await register('uid-1')
      await schedule('uid-1', [reminder('a', NOW + MIN)])
      sendPush.mockRejectedValue(new Error('boom'))
      // requeue writes through multi(); take it away only once the claim is done.
      vi.spyOn(redis, 'multi').mockImplementation(() => {
        throw new Error('redis is down')
      })
      vi.setSystemTime(NOW + 90_000)

      const res = await tick()

      expect(res.statusCode).toBe(200)
      expect(res.body).toMatchObject({ claimed: 1, failed: 1, retried: 0 })
    })

    it('does not let one reminder’s error stop the others', async () => {
      await register('uid-1')
      await schedule('uid-1', [reminder('bad', NOW + MIN), reminder('good', NOW + MIN)])
      sendPush.mockImplementation(async (sub, payload) => {
        if (payload.tag === 'now-bad') throw new Error('boom')
        return { ok: true, gone: false, retryable: false, status: 201 }
      })
      vi.setSystemTime(NOW + 90_000)

      const res = await tick()

      expect(res.body).toMatchObject({ claimed: 2, sent: 1, retried: 1 })
    })
  })
})

describe('POST /api/push/diagnose', () => {
  const alice = (n) => register('uid-1', device(n))

  it('needs a signed-in account', async () => {
    verifyRequest.mockRejectedValue(new AuthError(401, 'Missing bearer token.'))
    const res = await call(diagnoseHandler, fakeReq({ headers: {} }))
    expect(res.statusCode).toBe(401)
  })

  it('reports an account with nothing set up as exactly that', async () => {
    const res = await call(diagnoseHandler, fakeReq())
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({
      ok: true,
      configured: true,
      vapidPublicKey: 'server-public-key',
      devices: [],
      reminders: { count: 0, next: null },
    })
    expect(res.body.test).toBeUndefined()
  })

  it('lists each device by push-service host and user agent, never by endpoint or keys', async () => {
    await alice(1)
    await register('uid-1', device(2, 'updates.push.services.mozilla.com'))

    const res = await call(diagnoseHandler, fakeReq())

    expect(res.body.devices).toEqual([
      { host: 'fcm.googleapis.com', ua: 'test', registeredAt: NOW },
      { host: 'updates.push.services.mozilla.com', ua: 'test', registeredAt: NOW },
    ])
    // The endpoint is a capability URL that can wake the device; the keys decrypt for it.
    const text = JSON.stringify(res.body)
    expect(text).not.toContain('device-1')
    expect(text).not.toContain('/fcm/send/')
    expect(text).not.toContain(P256DH)
    expect(text).not.toContain(AUTH)
  })

  it('counts the queued reminders and names the next one', async () => {
    await alice(1)
    await schedule('uid-1', [
      reminder('later', NOW + 30 * MIN, { title: 'Later task' }),
      reminder('sooner', NOW + 5 * MIN, { title: 'Sooner task', kind: 'soon' }),
    ])

    const res = await call(diagnoseHandler, fakeReq())

    expect(res.body.reminders).toEqual({
      count: 2,
      next: { kind: 'soon', title: 'Sooner task', fireAt: NOW + 5 * MIN },
    })
  })

  it('only describes the signed-in account', async () => {
    await register('uid-2', device(9))
    await schedule('uid-2', [reminder('theirs', NOW + 5 * MIN)])
    const res = await call(diagnoseHandler, fakeReq())
    expect(res.body).toMatchObject({ devices: [], reminders: { count: 0, next: null } })
  })

  it('never sends anything unless asked to', async () => {
    await alice(1)
    await call(diagnoseHandler, fakeReq({ body: {} }))
    await call(diagnoseHandler, fakeReq({ body: { test: false } }))
    await call(diagnoseHandler, fakeReq({ body: { test: 'yes' } }))
    expect(sendPush).not.toHaveBeenCalled()
  })

  it('sends a test to every device now and reports each result', async () => {
    await alice(1)
    await register('uid-1', device(2, 'updates.push.services.mozilla.com'))
    sendPush.mockImplementation(async (sub) =>
      sub.endpoint === device(1).endpoint
        ? { ok: true, gone: false, retryable: false, status: 201 }
        : { ok: false, gone: false, retryable: false, status: 403 },
    )

    const res = await call(diagnoseHandler, fakeReq({ body: { test: true } }))

    expect(sendPush).toHaveBeenCalledTimes(2)
    const [, payload, options] = sendPush.mock.calls[0]
    expect(payload).toEqual({
      title: 'Cadence',
      body: 'Test notification — push is working.',
      tag: 'cadence-test',
      url: '/',
      kind: 'test',
    })
    expect(options).toMatchObject({ urgency: 'high' })
    expect(res.body.test).toEqual([
      { host: 'fcm.googleapis.com', ok: true, gone: false, status: 201 },
      { host: 'updates.push.services.mozilla.com', ok: false, gone: false, status: 403 },
    ])
  })

  it('forgets a device the push service says is gone', async () => {
    await alice(1)
    sendPush.mockResolvedValue({ ok: false, gone: true, retryable: false, status: 410 })

    const res = await call(diagnoseHandler, fakeReq({ body: { test: true } }))

    expect(res.body.test).toEqual([{ host: 'fcm.googleapis.com', ok: false, gone: true, status: 410 }])
    expect(await redis.smembers('push:subs:uid-1')).toEqual([])
  })

  it('has nothing to test when no device is registered', async () => {
    const res = await call(diagnoseHandler, fakeReq({ body: { test: true } }))
    expect(res.body.test).toEqual([])
    expect(sendPush).not.toHaveBeenCalled()
  })

  it('says what is wrong with the server settings, and sends nothing', async () => {
    await alice(1)
    ensureConfigured.mockImplementation(() => {
      throw new ApiError(500, 'VAPID configuration is invalid: subject is not a URL')
    })

    const res = await call(diagnoseHandler, fakeReq({ body: { test: true } }))

    expect(res.statusCode).toBe(200) // a diagnosis, not a failure of the diagnosis
    expect(res.body).toMatchObject({
      configured: false,
      configError: 'VAPID configuration is invalid: subject is not a URL',
    })
    expect(res.body.devices).toHaveLength(1)
    expect(res.body.test).toBeUndefined()
    expect(sendPush).not.toHaveBeenCalled()
  })

  it('is never cached', async () => {
    const res = await call(diagnoseHandler, fakeReq())
    expect(res.headers['Cache-Control']).toBe('no-store')
  })
})
