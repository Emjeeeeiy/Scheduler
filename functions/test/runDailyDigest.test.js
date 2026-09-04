import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runDailyDigest } from '../lib/runDailyDigest.js'
import { FakeFirestore, seedUser } from './fakeFirestore.js'

const DAY = '2026-08-24'
const NOW_MIN = 7 * 60

function fakeSendEmail({ ok = true } = {}) {
  const calls = []
  return {
    calls,
    async send(message) {
      calls.push(message)
      return ok ? { ok: true } : { ok: false, status: 500, body: 'simulated provider failure' }
    },
  }
}

const silent = { warn() {}, error() {} }

describe('runDailyDigest', () => {
  it('does nothing when nobody has opted in', async () => {
    const db = new FakeFirestore()
    seedUser(db, 'u1', { profile: { email: 'a@example.com' }, tasks: [] })
    const sender = fakeSendEmail()

    const result = await runDailyDigest({ db, sendEmail: sender.send, todayKey: DAY, nowMin: NOW_MIN, logger: silent })

    assert.deepEqual(result, { usersProcessed: 0, emailsSent: 0 })
    assert.equal(sender.calls.length, 0)
  })

  it('emails an opted-in user their own tasks, and skips one who has not opted in', async () => {
    const db = new FakeFirestore()
    seedUser(db, 'in', {
      profile: { email: 'in@example.com', dailyDigestEnabled: true },
      tasks: [{ id: 't1', title: 'Standup', date: DAY, startMin: 540 }],
    })
    seedUser(db, 'out', {
      profile: { email: 'out@example.com', dailyDigestEnabled: false },
      tasks: [{ id: 't2', title: 'Should not appear', date: DAY }],
    })
    const sender = fakeSendEmail()

    const result = await runDailyDigest({ db, sendEmail: sender.send, todayKey: DAY, nowMin: NOW_MIN, logger: silent })

    assert.equal(result.usersProcessed, 1)
    assert.equal(sender.calls.length, 1)
    assert.equal(sender.calls[0].to, 'in@example.com')
    assert.match(sender.calls[0].text, /Standup/)
  })

  it('skips a Google account with no email on the profile doc yet', async () => {
    const db = new FakeFirestore()
    seedUser(db, 'u1', { profile: { dailyDigestEnabled: true }, tasks: [] }) // no email field
    const sender = fakeSendEmail()

    const result = await runDailyDigest({ db, sendEmail: sender.send, todayKey: DAY, nowMin: NOW_MIN, logger: silent })

    assert.equal(sender.calls.length, 0)
    assert.equal(result.emailsSent, 0)
  })

  it("one user's send failure is logged and does not stop the next user's email", async () => {
    const db = new FakeFirestore()
    seedUser(db, 'fails', { profile: { email: 'fails@example.com', dailyDigestEnabled: true }, tasks: [] })
    seedUser(db, 'ok', { profile: { email: 'ok@example.com', dailyDigestEnabled: true }, tasks: [] })

    let call = 0
    const send = async (message) => {
      call += 1
      // Alphabetical doc order in the fake matches insertion order here —
      // 'fails' was seeded first, so it's the one made to fail.
      if (call === 1) return { ok: false, status: 500, body: 'simulated' }
      return { ok: true }
    }
    const errors = []
    const result = await runDailyDigest({
      db,
      sendEmail: send,
      todayKey: DAY,
      nowMin: NOW_MIN,
      logger: { warn() {}, error: (msg) => errors.push(msg) },
    })

    assert.equal(call, 2)
    assert.equal(result.emailsSent, 1)
    assert.equal(errors.length, 1)
  })

  it("one user's thrown error does not stop the next user's email", async () => {
    const db = new FakeFirestore()
    seedUser(db, 'broken', { profile: { email: 'broken@example.com', dailyDigestEnabled: true } })
    db.failPaths.add('users/broken/tasks')
    seedUser(db, 'ok', { profile: { email: 'ok@example.com', dailyDigestEnabled: true }, tasks: [] })
    const sender = fakeSendEmail()
    const errors = []

    const result = await runDailyDigest({
      db,
      sendEmail: sender.send,
      todayKey: DAY,
      nowMin: NOW_MIN,
      logger: { warn() {}, error: (msg) => errors.push(msg) },
    })

    assert.equal(result.usersProcessed, 2)
    assert.equal(sender.calls.length, 1)
    assert.equal(sender.calls[0].to, 'ok@example.com')
    assert.equal(errors.length, 1)
    assert.match(errors[0], /broken/)
  })

  it('carries a recurring task into the digest for today', async () => {
    const db = new FakeFirestore()
    seedUser(db, 'u1', {
      profile: { email: 'a@example.com', dailyDigestEnabled: true },
      tasks: [
        {
          id: 's1',
          title: 'Morning routine',
          date: DAY,
          startMin: 420,
          recurrence: { freq: 'interval', unit: 'day', everyN: 1, anchor: DAY },
        },
      ],
    })
    const sender = fakeSendEmail()

    await runDailyDigest({ db, sendEmail: sender.send, todayKey: DAY, nowMin: NOW_MIN, logger: silent })

    assert.match(sender.calls[0].text, /Morning routine/)
  })
})
