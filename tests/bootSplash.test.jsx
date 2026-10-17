/* index.html's boot splash (the clock mark's single turn, then the rising
 * word mark) is dismissed by React on first paint. These tests prove the
 * handoff: the dismissal waits out the animation's own deadline before
 * fading, a slow load that already blew past the deadline isn't held at all,
 * reduced-motion skips both hold and fade, and a second call (or a page
 * without the splash) is a safe no-op.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BOOT_SPLASH_HIDE_CLASS,
  BOOT_SPLASH_ID,
  dismissBootSplash,
} from '../src/lib/bootSplash.js'

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = `<div id="${BOOT_SPLASH_ID}"></div>`
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  if ('matchMedia' in window) delete window.matchMedia
})

describe('dismissBootSplash', () => {
  it('holds for the animation to settle, then fades and removes', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0)
    expect(dismissBootSplash()).toBe(true)
    const el = document.getElementById(BOOT_SPLASH_ID)

    // Still on screen: the fade must not start while the hand turn or the
    // word mark are still running.
    expect(el.classList.contains(BOOT_SPLASH_HIDE_CLASS)).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(document.getElementById(BOOT_SPLASH_ID)).not.toBeNull()
    expect(el.classList.contains(BOOT_SPLASH_HIDE_CLASS)).toBe(false)

    vi.advanceTimersByTime(800)
    expect(el.classList.contains(BOOT_SPLASH_HIDE_CLASS)).toBe(true)
    vi.advanceTimersByTime(500)
    expect(document.getElementById(BOOT_SPLASH_ID)).toBeNull()
  })

  it('owes no hold when the animation settled before React mounted', () => {
    // A slow bundle means the turn and the word mark finished long ago —
    // holding for them again would just be dead air in front of the app.
    vi.spyOn(performance, 'now').mockReturnValue(9999)
    expect(dismissBootSplash()).toBe(true)
    vi.advanceTimersByTime(0)
    const el = document.getElementById(BOOT_SPLASH_ID)
    expect(el.classList.contains(BOOT_SPLASH_HIDE_CLASS)).toBe(true)
    vi.advanceTimersByTime(500)
    expect(document.getElementById(BOOT_SPLASH_ID)).toBeNull()
  })

  it('removes immediately under prefers-reduced-motion', () => {
    window.matchMedia = () => ({ matches: true })
    expect(dismissBootSplash()).toBe(true)
    expect(document.getElementById(BOOT_SPLASH_ID)).toBeNull()
  })

  it('is a safe no-op when the splash is already gone', () => {
    document.body.innerHTML = ''
    expect(dismissBootSplash()).toBe(false)
  })
})
