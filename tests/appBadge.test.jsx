/* The installed app's launcher badge mirrors the notification bell's own
 * undismissed count via the Badging API — the one live channel a phone or
 * tablet OS grants a web app's icon. These tests prove the three behaviours
 * that matter: the count is set, zero clears, and a browser without the API
 * (or one that rejects, e.g. app not installed) never throws.
 */
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppBadge } from '../src/lib/useAppBadge.js'

function Probe({ count }) {
  useAppBadge(count)
  return null
}

function stubBadgeApi() {
  const setAppBadge = vi.fn(async () => {})
  const clearAppBadge = vi.fn(async () => {})
  Object.defineProperties(window.navigator, {
    setAppBadge: { value: setAppBadge, configurable: true },
    clearAppBadge: { value: clearAppBadge, configurable: true },
  })
  return { setAppBadge, clearAppBadge }
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const key of ['setAppBadge', 'clearAppBadge']) {
    if (key in window.navigator) delete window.navigator[key]
  }
})

describe('useAppBadge', () => {
  it('sets the launcher badge to the bell count', async () => {
    const { setAppBadge } = stubBadgeApi()
    render(<Probe count={3} />)
    await vi.waitFor(() => expect(setAppBadge).toHaveBeenCalledWith(3))
  })

  it('clears the badge when nothing needs attention, and on unmount', async () => {
    const { clearAppBadge } = stubBadgeApi()
    const { rerender, unmount } = render(<Probe count={2} />)
    rerender(<Probe count={0} />)
    await vi.waitFor(() => expect(clearAppBadge).toHaveBeenCalled())
    clearAppBadge.mockClear()
    unmount()
    await vi.waitFor(() => expect(clearAppBadge).toHaveBeenCalled())
  })

  it('never throws where the API is missing entirely', () => {
    expect(() => render(<Probe count={2} />)).not.toThrow()
  })

  it('never throws where the OS rejects (e.g. app not installed)', async () => {
    const { setAppBadge } = stubBadgeApi()
    setAppBadge.mockRejectedValue(new DOMException('Not installed'))
    expect(() => render(<Probe count={5} />)).not.toThrow()
    // Let the rejected promise settle — an unhandled rejection would fail
    // the run, which is exactly what the hook's catch exists to prevent.
    await vi.waitFor(() => expect(setAppBadge).toHaveBeenCalledWith(5))
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
})
