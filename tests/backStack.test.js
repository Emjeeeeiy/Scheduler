/* The back stack is pure logic over `history`, so it is tested here against a
 * fake one that behaves like a browser's: pushState drops everything ahead of the
 * current entry, go() lands asynchronously and then fires popstate, and a user's
 * Back press moves the index and fires popstate at once.
 *
 * What is worth pinning is the part that is easy to get subtly wrong: that the
 * history depth always converges on the number of layers, that closing a layer
 * from the UI is not mistaken for a Back press, and that one Back press closes
 * exactly one layer — the right one.
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { BACK_RANK, createBackStack } from '../src/lib/backStack.js'

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
/** Two ticks: the microtask that syncs, then the timeout a go() lands on. */
const flush = async () => {
  await tick()
  await tick()
}

function setup({ startState = null } = {}) {
  const entries = [{ state: startState }]
  let index = 0
  const log = []
  let stack = null
  const timers = []

  const history = {
    get state() {
      return entries[index].state
    },
    pushState(state) {
      entries.splice(index + 1)
      entries.push({ state })
      index += 1
      log.push(`push ${state.cadenceBack}`)
    },
    replaceState(state) {
      entries[index] = { state }
      log.push('replace')
    },
    // Like a browser: nowhere to go means no navigation and no popstate.
    go(delta) {
      log.push(`go ${delta}`)
      const target = index + delta
      if (target < 0 || target >= entries.length) return
      setTimeout(() => {
        index = target
        stack.onPopState()
      }, 0)
    },
  }
  stack = createBackStack({
    history,
    setTimer: (callback) => {
      timers.push(callback)
      return timers.length
    },
    clearTimer: () => {},
  })

  return {
    stack,
    history,
    log,
    timers,
    index: () => index,
    depth: () => history.state?.cadenceBack ?? 0,
    /** The user pressing Back `times` times (or Forward, if negative). */
    press(times = 1) {
      index = Math.max(0, Math.min(entries.length - 1, index - times))
      stack.onPopState()
    },
  }
}

describe('createBackStack', () => {
  beforeEach(() => {
    mock.method(console, 'error', () => {})
  })
  afterEach(() => {
    mock.restoreAll()
  })

  it('gives an open layer one history entry', async () => {
    const env = setup()
    env.stack.register(() => {})
    assert.equal(env.depth(), 0, 'nothing is pushed synchronously')
    await flush()
    assert.equal(env.depth(), 1)
    assert.deepEqual(env.log, ['push 1'])
  })

  // Regression guard for React StrictMode, which mounts, unmounts and mounts again
  // in development, and for one dialog handing over to another in a single update.
  it('adds no history for a layer that closes and reopens in the same tick', async () => {
    const env = setup()
    const first = env.stack.register(() => {})
    env.stack.unregister(first)
    env.stack.register(() => {})
    await flush()
    assert.deepEqual(env.log, ['push 1'])
    assert.equal(env.stack.size(), 1)
  })

  it('removes the entry when a layer closes from the UI, without calling its onBack', async () => {
    const env = setup()
    const onBack = mock.fn()
    const id = env.stack.register(onBack)
    await flush()
    env.stack.unregister(id)
    await flush()
    assert.equal(env.depth(), 0)
    assert.equal(env.index(), 0)
    assert.equal(onBack.mock.callCount(), 0, 'closing is not a Back press')
  })

  it('closes only the top layer on one Back press', async () => {
    const env = setup()
    const below = mock.fn()
    const above = mock.fn()
    env.stack.register(below, BACK_RANK.modal)
    env.stack.register(above, BACK_RANK.modal)
    await flush()
    env.press()
    assert.equal(above.mock.callCount(), 1)
    assert.equal(below.mock.callCount(), 0)
    assert.equal(env.stack.size(), 1)
  })

  // Regression guard: React runs a child's effects before its parent's, so a
  // note opened straight away registers before the shell's "back to home" layer.
  // Registration order alone would have put home on top of the note.
  it('lets rank beat registration order', async () => {
    const env = setup()
    const order = []
    env.stack.register(() => order.push('note'), BACK_RANK.screen)
    env.stack.register(() => order.push('home'), BACK_RANK.tab)
    await flush()
    env.press()
    assert.deepEqual(order, ['note'])
    await flush()
    env.press()
    assert.deepEqual(order, ['note', 'home'])
  })

  it('puts a popover above the dialog it was opened in', async () => {
    const env = setup()
    const order = []
    env.stack.register(() => order.push('popover'), BACK_RANK.popover)
    env.stack.register(() => order.push('dialog'), BACK_RANK.modal)
    await flush()
    env.press()
    assert.deepEqual(order, ['popover'])
  })

  it('keeps a layer that refuses, and gives its entry back', async () => {
    const env = setup()
    let allow = false
    const onBack = mock.fn(() => (allow ? undefined : false))
    env.stack.register(onBack, BACK_RANK.screen)
    await flush()

    env.press()
    await flush()
    assert.equal(onBack.mock.callCount(), 1)
    assert.equal(env.stack.size(), 1, 'the note stayed open')
    assert.equal(env.depth(), 1, 'and Back still has an entry to press')

    allow = true
    env.press()
    await flush()
    assert.equal(onBack.mock.callCount(), 2)
    assert.equal(env.stack.size(), 0)
    assert.equal(env.depth(), 0)
  })

  it('closes several layers when Back jumps several entries', async () => {
    const env = setup()
    const order = []
    env.stack.register(() => order.push('tab'), BACK_RANK.tab)
    env.stack.register(() => order.push('modal'), BACK_RANK.modal)
    await flush()
    assert.equal(env.depth(), 2)
    env.press(2)
    assert.deepEqual(order, ['modal', 'tab'])
    assert.equal(env.stack.size(), 0)
  })

  it('undoes a Forward press: there is nothing to go forward to', async () => {
    const env = setup()
    const onBack = mock.fn()
    const id = env.stack.register(onBack)
    await flush()
    env.stack.unregister(id)
    await flush()
    assert.equal(env.index(), 0)

    env.press(-1) // Forward, onto the entry the closed layer left behind
    assert.equal(env.index(), 1)
    await flush()
    assert.equal(env.index(), 0, 'sent straight back')
    assert.equal(onBack.mock.callCount(), 0)
  })

  it('does nothing further when a layer Back already closed is unregistered by its component', async () => {
    const env = setup()
    const id = env.stack.register(() => {})
    await flush()
    env.press()
    const before = [...env.log]
    env.stack.unregister(id) // the component unmounting, a moment later
    await flush()
    assert.deepEqual(env.log, before)
  })

  it('keeps going when a layer’s onBack throws', async () => {
    const env = setup()
    const after = mock.fn()
    env.stack.register(after, BACK_RANK.tab)
    env.stack.register(() => {
      throw new Error('boom')
    }, BACK_RANK.modal)
    await flush()
    env.press(2)
    assert.equal(after.mock.callCount(), 1)
    assert.equal(env.stack.size(), 0)
    assert.equal(console.error.mock.callCount(), 1)
  })

  // Regression guard: history.state survives a reload. A reload with a dialog open
  // would land on depth 1 with no layers, and go(-1) from there is a second reload.
  it('starts from depth 0 after a reload that landed on a stale entry', async () => {
    const env = setup({ startState: { cadenceBack: 2 } })
    await flush()
    assert.equal(env.depth(), 0)
    assert.ok(!env.log.some((line) => line.startsWith('go')), 'never navigated')
  })

  it('stops waiting for a go() that never lands, and tries again', async () => {
    const env = setup()
    const id = env.stack.register(() => {})
    await flush()
    // Make the browser swallow the next go().
    env.history.go = (delta) => env.log.push(`go ${delta}`)
    env.stack.unregister(id)
    await flush()
    assert.deepEqual(env.log.filter((line) => line.startsWith('go')), ['go -1'])
    assert.equal(env.timers.length, 1)

    env.timers[0]()
    await flush()
    assert.deepEqual(env.log.filter((line) => line.startsWith('go')), ['go -1', 'go -1'])
  })
})
