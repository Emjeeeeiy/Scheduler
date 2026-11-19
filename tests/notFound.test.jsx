/* The 404 page and its dot field. Worth pinning:
 *  - the page says what happened and offers the one way out (a real link home);
 *  - the dot field is decoration: hidden from assistive tech, and degrades to
 *    nothing — not an error — where there is no 2D canvas;
 *  - the draw is cheap by construction (a fixed handful of fills a frame, not one
 *    per dot), and the pointer affects the ribbon alone — the grid never reacts;
 *  - it cleans up after itself, and with reduced motion it paints once, with no
 *    loop and no pointer listeners.
 * Deliberately not tested: how the ribbon *looks* (src/lib/dotField.js is covered
 * for its numbers in tests/dotField.test.js; the look is checked by eye).
 */
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotFound } from '../src/components/shell/NotFound.jsx'

/* jsdom has no 2D canvas, so each canvas gets a recording stand-in, keyed by
   element: the page's canvas and the offscreen grid cache are told apart. */
const BANDS = 8
let contexts
let frames

function fakeContext() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
    globalAlpha: 1,
  }
}

function install({ context = true, reduced = false, size = [800, 600] } = {}) {
  contexts = new WeakMap()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function getContext() {
    if (!context) return null
    if (!contexts.has(this)) contexts.set(this, fakeContext())
    return contexts.get(this)
  })
  // jsdom lays nothing out; give every element the canvas's size.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(size[0])
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(size[1])
  frames = { next: 1, pending: new Map() }
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    const id = frames.next
    frames.next += 1
    frames.pending.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id) => frames.pending.delete(id))
  window.matchMedia = vi.fn((query) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }))
}

/** Runs the one frame that is waiting, as the browser would at `now`. */
function runFrame(now) {
  const [[id, callback]] = [...frames.pending]
  frames.pending.delete(id)
  callback(now)
}

const mainContext = (container) => contexts.get(container.querySelector('canvas'))

beforeEach(() => {
  document.title = 'Cadence'
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete window.matchMedia
})

describe('NotFound', () => {
  it('says nothing is here, names the address, and links home', () => {
    install()
    render(<NotFound path="/does/not/exist" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Nothing is scheduled here.' })).toBeTruthy()
    expect(screen.getByText('/does/not/exist')).toBeTruthy()
    // A real link, not a button: there is no router, and "copy link" must work.
    expect(screen.getByRole('link', { name: 'Back to Cadence' }).getAttribute('href')).toBe('/')
  })

  it('titles the tab, and puts the old title back on the way out', () => {
    install()
    const { unmount } = render(<NotFound path="/x" />)
    expect(document.title).toBe('Page not found · Cadence')
    unmount()
    expect(document.title).toBe('Cadence')
  })

  it('clips a very long address rather than letting it take over the page', () => {
    install()
    render(<NotFound path={`/${'a'.repeat(400)}`} />)
    const shown = document.querySelector('.not-found__path').textContent
    expect([...shown].length).toBeLessThanOrEqual(61)
    expect(shown.endsWith('…')).toBe(true)
  })

  it('shows an address as text, never as markup', () => {
    install()
    render(<NotFound path="/<img src=x onerror=alert(1)>" />)
    expect(document.querySelector('.not-found__path img')).toBeNull()
  })

  it('hides the decorative canvas from assistive tech', () => {
    install()
    const { container } = render(<NotFound path="/x" />)
    expect(container.querySelector('canvas').getAttribute('aria-hidden')).toBe('true')
  })

  it('still renders its message where there is no 2D canvas', () => {
    install({ context: false })
    render(<NotFound path="/x" />)
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
    expect(frames.pending.size).toBe(0)
  })
})

describe('DotField', () => {
  it('runs a frame loop, and a resting frame costs a fixed handful of fills', () => {
    install()
    const { container } = render(<NotFound path="/x" />)
    expect(frames.pending.size).toBe(1)

    const ctx = mainContext(container)
    runFrame(1000)
    // One fill per opacity band whatever the dot count: thousands of fills a
    // frame is how a canvas backdrop becomes a laptop fan.
    expect(ctx.fill.mock.calls.length).toBe(BANDS)
    expect(ctx.arc.mock.calls.length).toBeGreaterThan(300)
    // …and it has asked for the next frame.
    expect(frames.pending.size).toBe(1)
  })

  /* The 800x600 ribbon passes through about (400, 515); a pointer there is on it. */
  const ON_RIBBON = { clientX: 400, clientY: 515 }
  /* A resting dot is at most 1.4px across; the pointer swells those near it. */
  const RESTING_MAX_RADIUS = 1.4 + 1e-6
  const largestDot = (ctx) => Math.max(...ctx.arc.mock.calls.map((call) => call[2]))

  it('swells the ribbon where the pointer is on it', () => {
    install()
    const { container } = render(<NotFound path="/x" />)
    const ctx = mainContext(container)

    runFrame(1000)
    expect(largestDot(ctx)).toBeLessThanOrEqual(RESTING_MAX_RADIUS)
    ctx.arc.mockClear()

    window.dispatchEvent(new MouseEvent('pointermove', ON_RIBBON))
    // Strength eases in over a few frames.
    for (let i = 1; i <= 10; i += 1) runFrame(1000 + i * 17)

    expect(largestDot(ctx)).toBeGreaterThan(RESTING_MAX_RADIUS + 0.3)
  })

  // The grid is still and only the ribbon answers the cursor, so the pointer
  // must cost nothing extra: the same few fills, and no grid dot drawn per frame.
  it('leaves the grid alone: the pointer adds no fills and no dots of its own', () => {
    install()
    const { container } = render(<NotFound path="/x" />)
    const ctx = mainContext(container)

    runFrame(1000)
    const restingArcs = ctx.arc.mock.calls.length
    ctx.fill.mockClear()
    ctx.arc.mockClear()

    window.dispatchEvent(new MouseEvent('pointermove', ON_RIBBON))
    for (let i = 1; i <= 10; i += 1) runFrame(1000 + i * 17)

    expect(ctx.fill.mock.calls.length).toBe(10 * BANDS)
    // The ribbon has the same dots with or without a pointer (give or take the
    // few at the screen's edge that the push or the passing time moves across it).
    expect(Math.abs(ctx.arc.mock.calls.length / 10 - restingArcs)).toBeLessThan(restingArcs * 0.05)
  })

  it('lets go when the pointer leaves, and the ribbon settles back', () => {
    install()
    const { container } = render(<NotFound path="/x" />)
    const ctx = mainContext(container)

    window.dispatchEvent(new MouseEvent('pointermove', ON_RIBBON))
    for (let i = 1; i <= 10; i += 1) runFrame(1000 + i * 17)
    document.documentElement.dispatchEvent(new Event('pointerleave'))
    for (let i = 1; i <= 80; i += 1) runFrame(1200 + i * 17)

    ctx.arc.mockClear()
    runFrame(3000)
    expect(largestDot(ctx)).toBeLessThanOrEqual(RESTING_MAX_RADIUS)
  })

  it('stops its loop and its listeners when the page goes', () => {
    install()
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<NotFound path="/x" />)
    expect(frames.pending.size).toBe(1)

    unmount()
    expect(frames.pending.size).toBe(0)
    expect(remove.mock.calls.some(([type]) => type === 'pointermove')).toBe(true)

    // A late pointer event reaches nothing.
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 10, clientY: 10 }))
    expect(frames.pending.size).toBe(0)
  })

  // Regression guard for React StrictMode, which mounts, unmounts and mounts
  // again in development: a loop that survived the first unmount would draw
  // twice a frame forever.
  it('runs exactly one loop after a mount, unmount, mount', () => {
    install()
    const first = render(<NotFound path="/x" />)
    first.unmount()
    render(<NotFound path="/x" />)
    expect(frames.pending.size).toBe(1)
  })

  it('with reduced motion paints one still frame, and neither loops nor listens', () => {
    install({ reduced: true })
    const add = vi.spyOn(window, 'addEventListener')
    const { container } = render(<NotFound path="/x" />)

    expect(frames.pending.size).toBe(0)
    expect(mainContext(container).fill.mock.calls.length).toBe(BANDS)
    expect(add.mock.calls.some(([type]) => type === 'pointermove')).toBe(false)
  })

  it('does not start a loop for a box with no size', () => {
    install({ size: [0, 0] })
    render(<NotFound path="/x" />)
    expect(frames.pending.size).toBe(0)
  })
})
