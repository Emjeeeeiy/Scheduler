/* What a notification is built from, per platform — for both ways one gets
 * raised: the push handler in public/sw.js (a server push, with every tab
 * closed) and showLocalNotification (the app's own desktop alerts).
 *
 * The rule: the small `badge` glyph goes everywhere; the large `icon` goes
 * everywhere EXCEPT Android, where the logo is already in the card header and
 * a second one on the right is clutter. On desktop the large icon is the only
 * place the logo shows.
 *
 * public/sw.js is a plain script with no exports, so it is run for real in a
 * sandbox that stands in for a service worker's global scope, and its `push`
 * listener is driven directly.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import vm from 'node:vm'
import { showLocalNotification } from '@cadence/shared/notifications.js'

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'

const BADGE = '/notif-badge-96.png'
const ICON = '/notif-icon-256.png'

const swSource = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')

/** Loads the real service worker script; returns its listeners and what it showed. */
function loadWorker(userAgent) {
  const listeners = {}
  const shown = []
  const self = {
    navigator: { userAgent },
    location: { origin: 'https://example.test' },
    addEventListener: (type, listener) => {
      listeners[type] = listener
    },
    skipWaiting() {},
    registration: {
      showNotification: (title, options) => {
        shown.push({ title, options })
        return Promise.resolve()
      },
    },
  }
  vm.runInNewContext(swSource, { self, URL, Response, console })
  return {
    shown,
    /** Delivers a push. `payload` is the parsed JSON, or a function that throws. */
    async push(payload) {
      let waited
      const event = {
        data:
          payload === undefined
            ? null
            : { json: typeof payload === 'function' ? payload : () => payload },
        waitUntil: (promise) => {
          waited = promise
        },
      }
      listeners.push(event)
      await waited
      return shown.at(-1)
    },
  }
}

describe('a server push, shown by the service worker', () => {
  const reminder = { title: 'Church happenings', body: 'Happening now · 3h', tag: 'now-abc', url: '/' }

  it('leaves the large icon off on Android, where the logo is already in the header', async () => {
    const { options } = await loadWorker(ANDROID).push(reminder)
    assert.equal(options.badge, BADGE)
    assert.equal('icon' in options, false)
  })

  it('keeps the large icon on desktop, where it is the only logo', async () => {
    const { options } = await loadWorker(WINDOWS).push(reminder)
    assert.equal(options.badge, BADGE)
    assert.equal(options.icon, ICON)
  })

  it('keeps it on iPhone too (the OS uses the app icon regardless; nothing to gain by omitting)', async () => {
    const { options } = await loadWorker(IPHONE).push(reminder)
    assert.equal(options.icon, ICON)
  })

  it('shows the reminder text, tag and a same-site click target', async () => {
    const { title, options } = await loadWorker(ANDROID).push(reminder)
    assert.equal(title, 'Church happenings')
    assert.equal(options.body, 'Happening now · 3h')
    assert.equal(options.tag, 'now-abc')
    // (Compared by field: the object comes from the sandbox's own realm, so a
    // strict deep-equal against a literal would trip on the prototype.)
    assert.equal(options.data.url, '/')
  })

  it('refuses a click target that leaves the site', async () => {
    for (const url of ['https://evil.test/', '//evil.test/', '/\\evil.test']) {
      const { options } = await loadWorker(WINDOWS).push({ ...reminder, url })
      assert.equal(options.data.url, '/', url)
    }
    const { options } = await loadWorker(WINDOWS).push({ ...reminder, url: '/?view=focus' })
    assert.equal(options.data.url, '/?view=focus')
  })

  describe('always shows something — the subscription promised every push is visible', () => {
    it('a push with no payload becomes a plain "Cadence" notification', async () => {
      const { title, options } = await loadWorker(ANDROID).push(undefined)
      assert.equal(title, 'Cadence')
      assert.equal(options.body, '')
      assert.equal(options.badge, BADGE)
    })

    it('a payload that is not valid JSON does too', async () => {
      const { title } = await loadWorker(WINDOWS).push(() => {
        throw new SyntaxError('Unexpected token')
      })
      assert.equal(title, 'Cadence')
    })

    it('a payload of the wrong shape does not break it', async () => {
      const { title, options } = await loadWorker(WINDOWS).push({ title: 5, body: {}, tag: 7, url: null })
      assert.equal(title, 'Cadence')
      assert.equal(options.body, '')
      assert.equal('tag' in options, false)
      assert.equal(options.data.url, '/')
    })
  })
})

describe('the app’s own desktop alerts (showLocalNotification)', () => {
  /** Runs `fn` with a stand-in `navigator`, then puts the real one back. */
  async function withNavigator(userAgent, fn) {
    const shown = []
    const stand = {
      userAgent,
      serviceWorker: {
        getRegistration: async () => ({
          showNotification: async (title, options) => {
            shown.push({ title, options })
          },
        }),
      },
    }
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'navigator', { value: stand, configurable: true, writable: true })
    try {
      await fn(shown)
    } finally {
      if (saved) Object.defineProperty(globalThis, 'navigator', saved)
      else delete globalThis.navigator
    }
  }

  it('omits the large icon on Android', async () => {
    await withNavigator(ANDROID, async (shown) => {
      assert.equal(await showLocalNotification('Standup', { body: 'Starts in 15m' }), true)
      assert.equal(shown[0].options.badge, BADGE)
      assert.equal('icon' in shown[0].options, false)
    })
  })

  it('keeps it on desktop', async () => {
    await withNavigator(WINDOWS, async (shown) => {
      await showLocalNotification('Standup', { body: 'Starts in 15m' })
      assert.equal(shown[0].options.icon, ICON)
      assert.equal(shown[0].options.badge, BADGE)
    })
  })

  it('lets a caller’s own options win, even on Android', async () => {
    await withNavigator(ANDROID, async (shown) => {
      await showLocalNotification('Standup', { icon: '/custom.png', tag: 'soon-1' })
      assert.equal(shown[0].options.icon, '/custom.png')
      assert.equal(shown[0].options.tag, 'soon-1')
    })
  })
})
