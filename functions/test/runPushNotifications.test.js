import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runPushNotifications } from '../lib/runPushNotifications.js'
import { FakeFirestore, seedUser } from './fakeFirestore.js'

const DAY = '2026-08-24'
const NOW_MIN = 9 * 60 // 09:00

/** Records every call rather than truly sending anything. Every response
    defaults to success; a test overrides `responses` to exercise failure
    handling (dead-token cleanup, one push failing without the run dying). */
function fakeMessaging({ responses } = {}) {
  const calls = []
  return {
    calls,
    async sendEachForMulticast(message) {
      calls.push(message)
      const results = responses ?? message.tokens.map(() => ({ success: true }))
      return {
        successCount: results.filter((r) => r.success).length,
        failureCount: results.filter((r) => !r.success).length,
        responses: results,
      }
    },
  }
}

describe('runPushNotifications', () => {
  it('does nothing when nobody has a push token registered', async () => {
    const db = new FakeFirestore()
    const messaging = fakeMessaging()
    const result = await runPushNotifications({ db, messaging, todayKey: DAY, nowMin: NOW_MIN, logger: { warn() {}, error() {} } })
    assert.deepEqual(result, { usersProcessed: 0, pushesSent: 0 })
    assert.equal(messaging.calls.length, 0)
  })

  it('pushes an overdue task to a registered device', async () => {
    const db = new FakeFirestore()
    seedUser(db, 'u1', {
      tasks: [{ id: 't1', title: 'File taxes', date: '2026-08-01', done: false }],
      pushTokens: ['token-1'],
    })
    const messaging = fakeMessaging()

    const result = await runPushNotifications({ db, messaging, todayKey: DAY, nowMin: NOW_MIN, logger: { warn() {}, error() {} } })

    assert.equal(result.usersProcessed, 1)
    assert.equal(messaging.calls.length, 1)
    assert.deepEqual(messaging.calls[0].tokens, ['token-1'])
    assert.equal(messaging.calls[0].notification.title, 'Overdue')
    assert.equal(messaging.calls[0].notification.body, 'File taxes')
  })

  it('does not push the same item twice across two runs', async () => {
    const db = new FakeFirestore()
    seedUser(db, 'u1', {
      tasks: [{ id: 't1', title: 'File taxes', date: '2026-08-01', done: false }],
      pushTokens: ['token-1'],
    })
    const messaging = fakeMessaging()

    await runPushNotifications({ db, messaging, todayKey: DAY, nowMin: NOW_MIN, logger: { warn() {}, error() {} } })
    await runPushNotifications({ db, messaging, todayKey: DAY, nowMin: NOW_MIN, logger: { warn() {}, error() {} } })

    // The dedup state written by run 1 is what run 2 has to read back and
    // honour — this is the whole reason pushState is persisted at all.
    assert.equal(messaging.calls.length, 1)
  })

  it('pushes again once a task is done and then goes overdue a second time', async () => {
    const db = new FakeFirestore()
    seedUser(db, 'u1', {
      tasks: [{ id: 't1', title: 'File taxes', date: '2026-08-01', done: false }],
      pushTokens: ['token-1'],
    })
    const messaging = fakeMessaging()
    const logger = { warn() {}, error() {} }

    await runPushNotifications({ db, messaging, todayKey: DAY, nowMin: NOW_MIN, logger })

    // Mark it done — buildNotifications stops reporting it at all.
    db.docs.set('users/u1/tasks/t1', { title: 'File taxes', date: '2026-08-01', done: true })
    await runPushNotifications({ db, messaging, todayKey: DAY, nowMin: NOW_MIN, logger })

    // Un-done it, still overdue — this is a genuinely new occurrence of the
    // same task id, and should be allowed to notify again.
    db.docs.set('users/u1/tasks/t1', { title: 'File taxes', date: '2026-08-01', done: false })
    await runPushNotifications({ db, messaging, todayKey: DAY, nowMin: NOW_MIN, logger })

    assert.equal(messaging.calls.length, 2)
  })

  it('removes a token FCM reports as dead, and keeps a live one', async () => {
    const db = new FakeFirestore()
    seedUser(db, 'u1', {
      tasks: [{ id: 't1', title: 'File taxes', date: '2026-08-01', done: false }],
      pushTokens: ['dead-token', 'live-token'],
    })
    const messaging = fakeMessaging({
      responses: [
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
        { success: true },
      ],
    })

    await runPushNotifications({ db, messaging, todayKey: DAY, nowMin: NOW_MIN, logger: { warn() {}, error() {} } })

    // The order responses come back in matches the order tokens were sent —
    // dead-token was index 0.
    assert.deepEqual(messaging.calls[0].tokens, ['dead-token', 'live-token'])
    assert.equal(db.docs.has('users/u1/pushTokens/dead-token'), false)
    assert.equal(db.docs.has('users/u1/pushTokens/live-token'), true)
  })

  it('keeps a token FCM rejects for an unrelated reason', async () => {
    const db = new FakeFirestore()
    seedUser(db, 'u1', {
      tasks: [{ id: 't1', title: 'File taxes', date: '2026-08-01', done: false }],
      pushTokens: ['token-1'],
    })
    const messaging = fakeMessaging({ responses: [{ success: false, error: { code: 'messaging/quota-exceeded' } }] })

    await runPushNotifications({ db, messaging, todayKey: DAY, nowMin: NOW_MIN, logger: { warn() {}, error() {} } })

    // A rate limit or a transient failure says nothing about whether the
    // TOKEN is still good — only the specific "this token no longer exists"
    // codes should ever delete one.
    assert.equal(db.docs.has('users/u1/pushTokens/token-1'), true)
  })

  it("one user's failure does not stop another user's push from going out", async () => {
    const db = new FakeFirestore()
    seedUser(db, 'broken', { pushTokens: ['token-broken'] })
    db.failPaths.add('users/broken/tasks')
    seedUser(db, 'ok', {
      tasks: [{ id: 't1', title: 'File taxes', date: '2026-08-01', done: false }],
      pushTokens: ['token-ok'],
    })
    const messaging = fakeMessaging()
    const errors = []

    const result = await runPushNotifications({
      db,
      messaging,
      todayKey: DAY,
      nowMin: NOW_MIN,
      logger: { warn() {}, error: (msg) => errors.push(msg) },
    })

    assert.equal(result.usersProcessed, 2)
    assert.equal(messaging.calls.length, 1)
    assert.deepEqual(messaging.calls[0].tokens, ['token-ok'])
    assert.equal(errors.length, 1)
    assert.match(errors[0], /broken/)
  })
})
