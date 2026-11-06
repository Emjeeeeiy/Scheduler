/* The browser half of push: creating, registering and removing this device's
 * subscription. jsdom has no service worker, PushManager or Notification, so
 * each is a small stand-in installed per test — the point is the sequencing
 * and the failure handling around them (what is asked first, what is undone
 * when the server says no), not the browser's own behaviour.
 *
 * What this does NOT prove: that a real browser accepts our VAPID key and a
 * real push service delivers. That needs a real device — README-push.md.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/apiClient.js', () => ({ callApi: vi.fn() }))

import { callApi } from '../src/lib/apiClient.js'
import {
  PUSH_CHANGED_EVENT,
  getLocalSubscription,
  isBrave,
  isPushSupported,
  pushPermission,
  subscribePush,
  unsubscribePush,
  urlBase64ToUint8Array,
} from '../src/lib/pushSubscription.js'

const KEY_BYTES = Uint8Array.from({ length: 65 }, (_, i) => i + 1)
const KEY = Buffer.from(KEY_BYTES).toString('base64url')
const OTHER_KEY_BYTES = Uint8Array.from({ length: 65 }, (_, i) => 200 - i)

function fakeSubscription(endpoint, keyBytes = KEY_BYTES) {
  return {
    endpoint,
    options: { applicationServerKey: keyBytes.buffer.slice(0) },
    toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh-value', auth: 'auth-value' } }),
    unsubscribe: vi.fn(async () => true),
  }
}

/** Installs the browser pieces push needs. Returns handles to assert against. */
function installBrowser({ permission = 'default', prompt = 'granted', existing = null, registration = true } = {}) {
  const order = []
  const created = fakeSubscription('https://fcm.googleapis.com/fcm/send/new-device')
  const pushManager = {
    getSubscription: vi.fn(async () => existing),
    subscribe: vi.fn(async () => created),
  }
  const getRegistration = vi.fn(async () => {
    order.push('getRegistration')
    return registration ? { pushManager } : undefined
  })

  const NotificationStub = {
    permission,
    requestPermission: vi.fn(async () => {
      order.push('requestPermission')
      NotificationStub.permission = prompt
      return prompt
    }),
  }
  vi.stubGlobal('Notification', NotificationStub)
  vi.stubGlobal('PushManager', class {})
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration } })

  return { order, created, pushManager, getRegistration, Notification: NotificationStub }
}

beforeEach(() => {
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', KEY)
  callApi.mockReset()
  callApi.mockResolvedValue({ ok: true })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  delete navigator.serviceWorker
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('support and permission', () => {
  it('reports unsupported where the pieces are missing (like jsdom itself)', () => {
    expect(isPushSupported()).toBe(false)
    expect(pushPermission()).toBe('unsupported')
  })

  it('reports supported once a service worker, PushManager and Notification exist', () => {
    installBrowser({ permission: 'granted' })
    expect(isPushSupported()).toBe(true)
    expect(pushPermission()).toBe('granted')
  })

  it('recognises Brave, which turns Google’s push service off by default', () => {
    expect(isBrave()).toBe(false)
    Object.defineProperty(navigator, 'brave', { configurable: true, value: { isBrave: () => Promise.resolve(true) } })
    try {
      expect(isBrave()).toBe(true)
    } finally {
      delete navigator.brave
    }
  })

  it('decodes the VAPID public key from base64url', () => {
    expect([...urlBase64ToUint8Array(KEY)]).toEqual([...KEY_BYTES])
    // Unpadded and padded forms both work.
    expect([...urlBase64ToUint8Array('AQID')]).toEqual([1, 2, 3])
    expect([...urlBase64ToUint8Array('AQI')]).toEqual([1, 2])
  })
})

describe('getLocalSubscription', () => {
  it('is null where push is unsupported, without throwing', async () => {
    expect(await getLocalSubscription()).toBeNull()
  })

  it('returns the browser’s existing subscription', async () => {
    const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/existing')
    installBrowser({ permission: 'granted', existing })
    expect(await getLocalSubscription()).toBe(existing)
  })

  it('is null when no service worker was ever registered (a dev build), instead of hanging', async () => {
    installBrowser({ registration: false })
    expect(await getLocalSubscription()).toBeNull()
  })

  it('is null when the browser throws', async () => {
    const browser = installBrowser()
    browser.pushManager.getSubscription.mockRejectedValue(new Error('boom'))
    expect(await getLocalSubscription()).toBeNull()
  })
})

describe('subscribePush', () => {
  it('does nothing where push is unsupported', async () => {
    expect(await subscribePush()).toEqual({ ok: false, reason: 'unsupported' })
    expect(callApi).not.toHaveBeenCalled()
  })

  it('is unavailable, and never prompts, when no VAPID key was built in', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '')
    const browser = installBrowser()
    expect(await subscribePush()).toMatchObject({ ok: false, reason: 'unavailable' })
    expect(browser.Notification.requestPermission).not.toHaveBeenCalled()
  })

  it('asks for permission before anything else is awaited', async () => {
    const browser = installBrowser()
    await subscribePush()
    // Safari only honours the prompt while the tap behind it is still recent.
    expect(browser.order[0]).toBe('requestPermission')
  })

  it('skips the prompt when permission is already granted', async () => {
    const browser = installBrowser({ permission: 'granted' })
    expect((await subscribePush()).ok).toBe(true)
    expect(browser.Notification.requestPermission).not.toHaveBeenCalled()
  })

  it('reports a block as denied, and an undecided prompt as dismissed', async () => {
    const blocked = installBrowser({ prompt: 'denied' })
    expect(await subscribePush()).toEqual({ ok: false, reason: 'denied' })
    expect(blocked.pushManager.subscribe).not.toHaveBeenCalled()

    installBrowser({ prompt: 'default' })
    expect(await subscribePush()).toEqual({ ok: false, reason: 'dismissed' })
    expect(callApi).not.toHaveBeenCalled()
  })

  it('is unavailable when there is no service worker to subscribe through', async () => {
    installBrowser({ prompt: 'granted', registration: false })
    expect(await subscribePush()).toMatchObject({ ok: false, reason: 'unavailable' })
  })

  it('subscribes visibly with our key, registers it, and announces the change', async () => {
    const browser = installBrowser()
    const changed = vi.fn()
    window.addEventListener(PUSH_CHANGED_EVENT, changed)

    const result = await subscribePush()
    window.removeEventListener(PUSH_CHANGED_EVENT, changed)

    expect(result).toEqual({ ok: true })
    const [options] = browser.pushManager.subscribe.mock.calls[0]
    expect(options.userVisibleOnly).toBe(true)
    expect([...options.applicationServerKey]).toEqual([...KEY_BYTES])
    expect(callApi).toHaveBeenCalledWith('/api/push/subscribe', { subscription: browser.created.toJSON() })
    expect(changed).toHaveBeenCalledTimes(1)
  })

  it('reuses a subscription made with the current key, but still registers it', async () => {
    const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/existing')
    const browser = installBrowser({ permission: 'granted', existing })

    expect((await subscribePush()).ok).toBe(true)

    expect(browser.pushManager.subscribe).not.toHaveBeenCalled()
    expect(existing.unsubscribe).not.toHaveBeenCalled()
    expect(callApi).toHaveBeenCalledWith('/api/push/subscribe', { subscription: existing.toJSON() })
  })

  it('replaces a subscription that was made with a different key', async () => {
    const stale = fakeSubscription('https://fcm.googleapis.com/fcm/send/stale', OTHER_KEY_BYTES)
    const browser = installBrowser({ permission: 'granted', existing: stale })

    expect((await subscribePush()).ok).toBe(true)

    expect(stale.unsubscribe).toHaveBeenCalledTimes(1)
    expect(browser.pushManager.subscribe).toHaveBeenCalledTimes(1)
    expect(callApi).toHaveBeenCalledWith('/api/push/subscribe', { subscription: browser.created.toJSON() })
  })

  it('undoes the subscription it just made when the server won’t take it', async () => {
    const browser = installBrowser()
    callApi.mockResolvedValue(null)

    expect(await subscribePush()).toEqual({ ok: false, reason: 'error' })

    // Otherwise the toggle would read "on" for a device nothing can reach.
    expect(browser.created.unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('leaves a subscription that already existed alone when the server call fails', async () => {
    const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/existing')
    installBrowser({ permission: 'granted', existing })
    callApi.mockResolvedValue(null)

    expect(await subscribePush()).toEqual({ ok: false, reason: 'error' })
    expect(existing.unsubscribe).not.toHaveBeenCalled()
  })

  it('reports an error when the browser refuses to subscribe', async () => {
    const browser = installBrowser()
    browser.pushManager.subscribe.mockRejectedValue(new Error('push service unreachable'))
    expect(await subscribePush()).toEqual({ ok: false, reason: 'error' })
    expect(callApi).not.toHaveBeenCalled()
  })

  it('names the browser’s own push service as the problem when it answers with an AbortError', async () => {
    // Chromium's "Registration failed - push service error": the browser asked
    // Google's push service for an address and was refused or couldn't reach it
    // (Brave ships with that off; a VPN or firewall can block it too).
    const browser = installBrowser()
    browser.pushManager.subscribe.mockRejectedValue(
      new DOMException('Registration failed - push service error', 'AbortError'),
    )

    expect(await subscribePush()).toEqual({ ok: false, reason: 'service' })
    // Nothing was created, so nothing reaches our server.
    expect(callApi).not.toHaveBeenCalled()
  })

  it('does not blame the push service for other errors', async () => {
    const browser = installBrowser()
    browser.pushManager.subscribe.mockRejectedValue(new DOMException('bad key', 'InvalidAccessError'))
    expect(await subscribePush()).toEqual({ ok: false, reason: 'error' })
  })
})

describe('unsubscribePush', () => {
  it('tells the server by endpoint with no session, then drops the local subscription', async () => {
    const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/existing')
    const browser = installBrowser({ permission: 'granted', existing })
    browser.pushManager.getSubscription.mockResolvedValueOnce(existing).mockResolvedValue(null)

    expect(await unsubscribePush()).toBe(true)

    expect(callApi).toHaveBeenCalledTimes(1)
    expect(callApi).toHaveBeenCalledWith('/api/push/unsubscribe', { endpoint: existing.endpoint }, { auth: false })
    expect(existing.unsubscribe).toHaveBeenCalledTimes(1)
    // The server is told first, while the endpoint is still known.
    expect(callApi.mock.invocationCallOrder[0]).toBeLessThan(existing.unsubscribe.mock.invocationCallOrder[0])
  })

  it('still turns it off locally when the server can’t be reached', async () => {
    const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/existing')
    const browser = installBrowser({ permission: 'granted', existing })
    browser.pushManager.getSubscription.mockResolvedValueOnce(existing).mockResolvedValue(null)
    callApi.mockResolvedValue(null)

    expect(await unsubscribePush()).toBe(true)
    expect(existing.unsubscribe).toHaveBeenCalled()
  })

  it('reports false if the browser keeps the subscription', async () => {
    const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/existing')
    installBrowser({ permission: 'granted', existing })
    existing.unsubscribe.mockRejectedValue(new Error('nope'))

    expect(await unsubscribePush()).toBe(false)
  })

  it('has nothing to do when this device was never subscribed', async () => {
    installBrowser({ permission: 'granted' })
    expect(await unsubscribePush()).toBe(true)
    expect(callApi).not.toHaveBeenCalled()
  })

  it('forgets the whole account too when asked to (account deletion)', async () => {
    const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/existing')
    const browser = installBrowser({ permission: 'granted', existing })
    browser.pushManager.getSubscription.mockResolvedValueOnce(existing).mockResolvedValue(null)

    await unsubscribePush({ everywhere: true })

    // The account-wide purge is authenticated (no `auth: false`)…
    expect(callApi).toHaveBeenNthCalledWith(1, '/api/push/unsubscribe', { all: true })
    // …and this device is still removed by endpoint afterwards.
    expect(callApi).toHaveBeenNthCalledWith(2, '/api/push/unsubscribe', { endpoint: existing.endpoint }, { auth: false })
  })

  it('purges the account even from a device that holds no subscription', async () => {
    installBrowser({ permission: 'granted' })
    expect(await unsubscribePush({ everywhere: true })).toBe(true)
    expect(callApi).toHaveBeenCalledTimes(1)
    expect(callApi).toHaveBeenCalledWith('/api/push/unsubscribe', { all: true })
  })
})
