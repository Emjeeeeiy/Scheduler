import { useEffect, useState } from 'react'

/** State mirrored to localStorage, so a refresh keeps the view and the date
    cursor where you left them. Storage can be blocked (private windows, an
    embedded frame); every access is guarded and simply falls back to memory. */
export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw === null) return typeof initial === 'function' ? initial() : initial
      return JSON.parse(raw)
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
