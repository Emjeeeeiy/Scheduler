import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutosave, useDelayedFlag } from '../src/components/journal/useAutosave.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function setup(options = {}) {
  const save = options.save ?? vi.fn(() => true)
  const view = renderHook((props) => useAutosave({ save, idleMs: 800, maxWaitMs: 4000, ...props }), {
    initialProps: options.props ?? {},
  })
  return { save, ...view }
}

describe('useAutosave', () => {
  it('saves once the writer pauses, not on every keystroke', () => {
    const { result, save } = setup()
    expect(result.current.status).toBe('saved')

    act(() => result.current.markDirty())
    expect(result.current.status).toBe('dirty')
    act(() => vi.advanceTimersByTime(799))
    expect(save).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(save).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('saved')
  })

  it('restarts the idle wait while the writer keeps typing', () => {
    const { result, save } = setup()
    for (let i = 0; i < 5; i++) {
      act(() => result.current.markDirty())
      act(() => vi.advanceTimersByTime(500))
    }
    expect(save).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(800))
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('never lets a long burst of typing sit unsaved past the maximum wait', () => {
    const { result, save } = setup()
    // A keystroke every 500ms keeps resetting the idle timer forever, so only
    // the maximum wait can save this.
    const type = (ms) => {
      for (let t = 0; t < ms; t += 500) {
        act(() => result.current.markDirty())
        act(() => vi.advanceTimersByTime(500))
      }
    }
    type(3500)
    expect(save).not.toHaveBeenCalled()
    type(500)
    expect(save).toHaveBeenCalledTimes(1)

    // The window restarts: the next burst gets its own full four seconds
    // rather than inheriting what was left of the old one.
    type(3000)
    expect(save).toHaveBeenCalledTimes(1)
    type(1000)
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('flush writes immediately and cancels the pending timers', () => {
    const { result, save } = setup()
    act(() => result.current.markDirty())
    act(() => result.current.flush())
    expect(save).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(10_000))
    expect(save).toHaveBeenCalledTimes(1)
    expect(result.current.isDirty()).toBe(false)
  })

  it('does nothing when there is nothing to save', () => {
    const { result, save } = setup()
    act(() => result.current.flush())
    act(() => vi.advanceTimersByTime(10_000))
    expect(save).not.toHaveBeenCalled()
  })

  it('writes on unmount, which is what closing or switching a note does', () => {
    const { result, save, unmount } = setup()
    act(() => result.current.markDirty())
    unmount()
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('does not write on unmount when the note is clean', () => {
    const { save, unmount } = setup()
    unmount()
    expect(save).not.toHaveBeenCalled()
  })

  it('writes when the tab is hidden', () => {
    const { result, save } = setup()
    act(() => result.current.markDirty())
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(save).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('writes when the page is closed', () => {
    const { result, save } = setup()
    act(() => result.current.markDirty())
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('stays dirty and reports an error when the save is refused, then retries', () => {
    const save = vi.fn(() => false)
    const { result } = setup({ save })
    act(() => result.current.markDirty())
    act(() => vi.advanceTimersByTime(800))
    expect(result.current.status).toBe('error')
    expect(result.current.isDirty()).toBe(true)

    save.mockReturnValue(true)
    act(() => result.current.markDirty())
    act(() => vi.advanceTimersByTime(800))
    expect(save).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe('saved')
    expect(result.current.isDirty()).toBe(false)
  })

  it('treats a throwing save like a refused one', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const save = vi.fn(() => {
      throw new Error('boom')
    })
    const { result } = setup({ save })
    act(() => result.current.markDirty())
    act(() => vi.advanceTimersByTime(800))
    expect(result.current.status).toBe('error')
    expect(result.current.isDirty()).toBe(true)
  })

  it('puts the note back to dirty when the server later rejects a queued write', () => {
    const { result } = setup()
    act(() => result.current.markDirty())
    act(() => vi.advanceTimersByTime(800))
    expect(result.current.status).toBe('saved')
    act(() => result.current.fail())
    expect(result.current.status).toBe('error')
    expect(result.current.isDirty()).toBe(true)
  })

  it('writes nothing while disabled — the guard for a note that did not load cleanly', () => {
    const { result, save, rerender } = setup({ props: { enabled: false } })
    act(() => result.current.markDirty())
    act(() => vi.advanceTimersByTime(10_000))
    act(() => result.current.flush())
    expect(save).not.toHaveBeenCalled()
    expect(result.current.status).toBe('saved')

    rerender({ enabled: true })
    act(() => result.current.markDirty())
    act(() => vi.advanceTimersByTime(800))
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('reset forgets unsaved changes so a discarded edit is never written back', () => {
    const { result, save } = setup()
    act(() => result.current.markDirty())
    act(() => result.current.reset())
    act(() => vi.advanceTimersByTime(10_000))
    act(() => result.current.flush())
    expect(save).not.toHaveBeenCalled()
    expect(result.current.status).toBe('saved')
    expect(result.current.isDirty()).toBe(false)
  })

  it('hands save a fail callback, so a rejected write can be reported without a circular reference', () => {
    const save = vi.fn(() => true)
    const { result } = setup({ save })
    act(() => result.current.markDirty())
    act(() => vi.advanceTimersByTime(800))
    const { fail } = save.mock.calls[0][0]
    act(() => fail())
    expect(result.current.status).toBe('error')
    expect(result.current.isDirty()).toBe(true)
  })

  it('always calls the latest save, not the one from the first render', () => {
    const first = vi.fn(() => true)
    const second = vi.fn(() => true)
    const { result, rerender } = setup({ save: first })
    rerender({ save: second })
    act(() => result.current.markDirty())
    act(() => vi.advanceTimersByTime(800))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe('useDelayedFlag', () => {
  it('is true only after the flag has held for the delay', () => {
    const { result, rerender } = renderHook(({ flag }) => useDelayedFlag(flag, 2500), {
      initialProps: { flag: false },
    })
    expect(result.current).toBe(false)
    rerender({ flag: true })
    act(() => vi.advanceTimersByTime(2499))
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(true)
  })

  it('never turns on for a flag that clears in time, and resets when it clears', () => {
    const { result, rerender } = renderHook(({ flag }) => useDelayedFlag(flag, 2500), {
      initialProps: { flag: true },
    })
    act(() => vi.advanceTimersByTime(1000))
    rerender({ flag: false })
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current).toBe(false)

    rerender({ flag: true })
    act(() => vi.advanceTimersByTime(2500))
    expect(result.current).toBe(true)
    rerender({ flag: false })
    expect(result.current).toBe(false)
  })
})
