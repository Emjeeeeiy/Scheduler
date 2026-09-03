import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

const ToastContext = createContext(null)

/* Long enough to read a short sentence without hunting for the mouse, short
   enough that a stack of them doesn't pile up during a run of retries. Each
   toast still carries its own dismiss button, so this is a default, not a
   deadline. */
const AUTO_DISMISS_MS = 6000

/**
 * A transient, per-action failure surface — distinct from AuthContext's
 * `error`/`reportError`/`clearError`, which is a single sticky banner for a
 * session-level condition (no Firebase config, rules not published). A
 * dropped drag or a failed save is neither of those: it is one thing that
 * went wrong once, so it gets its own dismissible line that clears itself
 * rather than sitting in the header until the next unrelated action
 * overwrites it.
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

  const pushError = useCallback(
    (message) => {
      const id = ++idRef.current
      setToasts((current) => [...current, { id, message }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
      )
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toasts, pushError, dismiss }), [toasts, pushError, dismiss])

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}
