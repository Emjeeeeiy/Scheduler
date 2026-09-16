/* index.html's boot splash (live clock mark + animated Cadence title) is
 * dismissed by React on first paint. These tests prove the handoff: the
 * splash fades via CSS and is then removed, reduced-motion skips the fade,
 * and a second call (or a page without the splash) is a safe no-op.
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
  it('fades the splash, then removes it', () => {
    expect(dismissBootSplash()).toBe(true)
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
