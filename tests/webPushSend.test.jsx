/* sendPush() — how a push service's answer becomes the three things tick.js
 * acts on. The mapping is the whole job: a 410 means "forget this device", a
 * 5xx means "try again", a 403 means "stop, something is wrong with us". Get
 * one wrong and a dead device is retried forever, or a transient blip deletes
 * a working one. web-push itself is stubbed; what it throws is what a push
 * service's rejection looks like (an Error carrying `statusCode`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}))

import webpush from 'web-push'

process.env.VAPID_SUBJECT = 'https://cadenceplan.vercel.app'
process.env.VAPID_PUBLIC_KEY = 'public-key-for-the-stub'
process.env.VAPID_PRIVATE_KEY = 'private-key-for-the-stub'

const { sendPush } = await import('../api/_lib/webPush.js')

const SUB = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'p', auth: 'a' } }
const refusal = (statusCode) => Object.assign(new Error(`push service said ${statusCode}`), { statusCode })

beforeEach(() => {
  webpush.sendNotification.mockReset()
})

describe('sendPush', () => {
  it('sends the payload as JSON with the TTL, urgency and a timeout', async () => {
    webpush.sendNotification.mockResolvedValue({ statusCode: 201 })

    const result = await sendPush(SUB, { title: 'Hi', body: 'There' }, { ttl: 540, urgency: 'high' })

    expect(result).toEqual({ ok: true, gone: false, retryable: false, status: 201 })
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      SUB,
      JSON.stringify({ title: 'Hi', body: 'There' }),
      { TTL: 540, urgency: 'high', timeout: 8000 },
    )
  })

  it.each([404, 410])('treats %i as a device that is gone, not worth retrying', async (status) => {
    webpush.sendNotification.mockRejectedValue(refusal(status))
    expect(await sendPush(SUB, {})).toEqual({ ok: false, gone: true, retryable: false, status })
  })

  it.each([429, 500, 502, 503])('treats %i as a bad moment worth retrying', async (status) => {
    webpush.sendNotification.mockRejectedValue(refusal(status))
    expect(await sendPush(SUB, {})).toEqual({ ok: false, gone: false, retryable: true, status })
  })

  it.each([400, 401, 403, 413])('treats %i as a refusal that will not change', async (status) => {
    webpush.sendNotification.mockRejectedValue(refusal(status))
    expect(await sendPush(SUB, {})).toEqual({ ok: false, gone: false, retryable: false, status })
  })

  it('treats no HTTP answer at all (a dropped connection, a timeout) as retryable', async () => {
    webpush.sendNotification.mockRejectedValue(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }))
    expect(await sendPush(SUB, {})).toEqual({ ok: false, gone: false, retryable: true, status: null })
  })
})
