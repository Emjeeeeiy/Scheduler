import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

const ToastContext = createContext(null)

/* Long enough to read a short sentence without hunting for the mouse, short
   enough that a stack of them doesn't pile up during a run of retries. Each
   toast still carries its own dismiss button, so this is a default, not a
   deadline. An undo toast gets longer — acting on it takes a beat of actual
   thought, not just a glance. */
const AUTO_DISMISS_MS = 6000
const UNDO_DISMISS_MS = 8000

/**
 * A transient, per-action surface — distinct from AuthContext's
 * `error`/`reportError`/`clearError`, which is a single sticky banner for a
 * session-level condition (no Firebase config, rules not published). A
 * dropped drag, a failed save, or something just deleted is none of those:
 * each is one thing that happened once, so it gets its own dismissible line
 * that clears itself rather than sitting in the header until the next
 * unrelated action overwrites it.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())
  const idRef = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  /** The general form: a message, a `tone` ('error' | 'warning' | 'success',
      which ToastStack reads to pick styling — red, amber, or green — and an
      icon), and optionally one action button (`actionLabel` + `onAction`) —
      undo-delete's "Undo", or any future toast that offers a way back
      rather than just reporting what happened. */
  const push = useCallback(
    (message, { tone = 'error', actionLabel, onAction, durationMs = AUTO_DISMISS_MS } = {}) => {
      const id = ++idRef.current
      setToasts((current) => [...current, { id, message, tone, actionLabel, onAction }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), durationMs),
      )
      return id
    },
    [dismiss],
  )

  // The original, still the common case: report something that went wrong,
  // no action attached.
  const pushError = useCallback((message) => push(message, { tone: 'error' }), [push])

  // A positive confirmation ("Saved as a template") — green, same tone
  // pushUndo below uses, just without an action button to press.
  const pushSuccess = useCallback((message) => push(message, { tone: 'success' }), [push])

  // Not a full failure — a partial batch that mostly went through, a heads
  // up worth a glance but not the same alarm level as pushError's red.
  const pushWarning = useCallback((message) => push(message, { tone: 'warning' }), [push])

  const pushUndo = useCallback(
    (message, onAction) =>
      push(message, { tone: 'success', actionLabel: 'Undo', onAction, durationMs: UNDO_DISMISS_MS }),
    [push],
  )

  const value = useMemo(
    () => ({ toasts, push, pushError, pushWarning, pushSuccess, pushUndo, dismiss }),
    [toasts, push, pushError, pushWarning, pushSuccess, pushUndo, dismiss],
  )

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}
