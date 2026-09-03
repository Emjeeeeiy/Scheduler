/* DOM behaviour for useInstallPrompt. The hook is small, but the contract
 * it implements is easy to get subtly wrong: the browser's install event has
 * to be captured and suppressed rather than allowed to show its own banner,
 * the saved event is single-use, and "not installable" and "already
 * installed" are two different states that both mean "offer nothing."
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useInstallPrompt } from '../src/lib/useInstallPrompt.js'

/** A stand-in for the browser's BeforeInstallPromptEvent, which jsdom has no
    notion of — it is a plain Event with two extra members. */
function fireBeforeInstallPrompt({ outcome = 'accepted' } = {}) {
  // Cancelable, like the real thing — preventDefault() on a non-cancelable
  // event is a silent no-op, which would make the assertion below untrue of
  // the fixture rather than of the hook.
  const event = new Event('beforeinstallprompt', { cancelable: true })
  event.prompt = vi.fn()
  event.userChoice = Promise.resolve({ outcome })
  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useInstallPrompt', () => {
  it('offers nothing until the browser says the app is installable', () => {
    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current.canInstall).toBe(false)
    expect(result.current.installed).toBe(false)
  })

  it('becomes installable once the event fires, and suppresses the default banner', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    const event = fireBeforeInstallPrompt()
    // preventDefault is what stops Chrome showing its own install bar, so
    // the ask can happen from the Settings button instead.
    expect(event.defaultPrevented).toBe(true)
    await waitFor(() => expect(result.current.canInstall).toBe(true))
  })

  it('replays the saved event on demand and reports acceptance', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    const event = fireBeforeInstallPrompt({ outcome: 'accepted' })

    await waitFor(() => expect(result.current.canInstall).toBe(true))
    let accepted
    await act(async () => {
      accepted = await result.current.promptInstall()
    })
    expect(event.prompt).toHaveBeenCalledTimes(1)
    expect(accepted).toBe(true)
  })

  it('reports a dismissal, and does not offer the spent event again', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    fireBeforeInstallPrompt({ outcome: 'dismissed' })

    await waitFor(() => expect(result.current.canInstall).toBe(true))
    let accepted
    await act(async () => {
      accepted = await result.current.promptInstall()
    })
    expect(accepted).toBe(false)
    // The event cannot be replayed; the browser fires a fresh one when it
    // judges the moment right again.
    await waitFor(() => expect(result.current.canInstall).toBe(false))
  })

  it('stops offering once the app reports itself installed', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    fireBeforeInstallPrompt()
    await waitFor(() => expect(result.current.canInstall).toBe(true))

    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    await waitFor(() => {
      expect(result.current.installed).toBe(true)
      expect(result.current.canInstall).toBe(false)
    })
  })

  it('starts out installed when the app is already running standalone', () => {
    // Stubbed rather than spied on: jsdom does not implement matchMedia at
    // all, which is also why the hook calls it with optional chaining.
    vi.stubGlobal('matchMedia', (query) => ({
      matches: query === '(display-mode: standalone)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current.installed).toBe(true)
    expect(result.current.canInstall).toBe(false)
  })

  it('stops listening when unmounted', async () => {
    const { result, unmount } = renderHook(() => useInstallPrompt())
    unmount()
    fireBeforeInstallPrompt()
    expect(result.current.canInstall).toBe(false)
  })
})
