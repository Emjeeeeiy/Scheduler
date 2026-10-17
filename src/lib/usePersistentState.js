import { useEffect, useState } from 'react'

/** State mirrored to localStorage, so a refresh keeps the view and the date
    cursor where you left them. Storage can be blocked (private windows, an
    embedded frame); every access is guarded and simply falls back to memory.

    `revive` gets the value read back from storage and returns what to actually
    start from. Because it runs inside the lazy initializer, it sees the
    restored value and nothing else — never a later `setValue`. That is what
    lets a caller correct a stale persisted value exactly once, on mount,
    without the correction re-applying to everything the user does afterwards.
    Keep a `revive` total: it runs inside the try, so throwing would discard
    the stored value and fall back to `initial`.

    The setter it returns is a plain `useState` setter, so it is referentially
    stable for the life of the component exactly as one would be — safe to leave
    out of a `useMemo`/`useCallback` dep list, and safe to put in. Lint rules
    that special-case `useState`'s own setter don't know that about this one, so
    a `usePersistentState` setter used inside a memo may still need naming
    explicitly to satisfy exhaustive-deps. */
export function usePersistentState(key, initial, revive) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return typeof initial === 'function' ? initial() : initial
      const parsed = JSON.parse(raw)
      return revive ? revive(parsed) : parsed
    } catch {
      return typeof initial === 'function' ? initial() : initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* non-fatal: the value still works for this visit */
    }
  }, [key, value])

  return [value, setValue]
}
