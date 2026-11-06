import { useCallback, useEffect, useRef, useState } from 'react'

/* Debounced autosave for one open note.
 *
 * Typing marks the note dirty. It is written once the writer pauses (`idleMs`),
 * and never later than `maxWaitMs` after the first unsaved keystroke, so a long
 * burst of typing can't sit unsaved indefinitely. It is also written the moment
 * the writer could lose it: blur, the tab being hidden, the page being closed,
 * or the note being closed or switched (the unmount flush).
 *
 * `save` is synchronous from this hook's point of view: it reads the editor's
 * current state and queues a write. Returning `false` (or throwing) means "could
 * not save" — the note stays dirty and the status says so. A write the server
 * later rejects is reported by calling the `fail` it is handed — handed in,
 * rather than read off the hook's result, because `save` has to exist before the
 * hook that calls it does.
 */
export function useAutosave({ save, enabled = true, idleMs = 800, maxWaitMs = 4000 }) {
  // 'saved' | 'dirty' | 'error'
  const [status, setStatus] = useState('saved')
  const saveRef = useRef(save)
  const enabledRef = useRef(enabled)
  const dirty = useRef(false)
  const idleTimer = useRef(null)
  const waitTimer = useRef(null)

  // Always the latest closure, without making `flush` change identity (its
  // identity is what the lifecycle listeners below are keyed on).
  useEffect(() => {
    saveRef.current = save
    enabledRef.current = enabled
  })

  const clearTimers = useCallback(() => {
    clearTimeout(idleTimer.current)
    clearTimeout(waitTimer.current)
    idleTimer.current = null
    waitTimer.current = null
  }, [])

  /** A queued write the server then refused. The text is still on screen, so it
      goes back to dirty and the next change (or a retry) writes it again. */
  const fail = useCallback(() => {
    dirty.current = true
    setStatus('error')
  }, [])

  const flush = useCallback(() => {
    clearTimers()
    if (!dirty.current || !enabledRef.current) return
    dirty.current = false
    try {
      if (saveRef.current({ fail }) === false) {
        dirty.current = true
        setStatus('error')
        return
      }
      setStatus('saved')
    } catch (caught) {
      console.error('Autosave failed.', caught)
      dirty.current = true
      setStatus('error')
    }
  }, [clearTimers, fail])

  const markDirty = useCallback(() => {
    if (!enabledRef.current) return
    dirty.current = true
    setStatus('dirty')
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(flush, idleMs)
    if (!waitTimer.current) waitTimer.current = setTimeout(flush, maxWaitMs)
  }, [flush, idleMs, maxWaitMs])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  /** Forget unsaved changes — used when the writer chooses another version over
      their own, so the discarded text is not written back a moment later. */
  const reset = useCallback(() => {
    clearTimers()
    dirty.current = false
    setStatus('saved')
  }, [clearTimers])

  return { status, markDirty, flush, fail, reset, isDirty: () => dirty.current }
}

/** True once `flag` has stayed true for `ms`. A normal online save is
    acknowledged in a few hundred milliseconds, so "still syncing" is only worth
    showing when it has genuinely lasted — otherwise the status line would
    flicker on every keystroke pause. */
export function useDelayedFlag(flag, ms) {
  const [late, setLate] = useState(false)
  useEffect(() => {
    if (!flag) return undefined
    const timer = setTimeout(() => setLate(true), ms)
    return () => {
      clearTimeout(timer)
      setLate(false)
    }
  }, [flag, ms])
  return flag && late
}
