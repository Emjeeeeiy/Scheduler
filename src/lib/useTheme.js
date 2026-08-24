import { useEffect, useState } from 'react'

const THEME_KEY = 'scheduler-app:theme'

/** 'system' leaves the root unstamped so prefers-color-scheme decides; an
    explicit choice stamps data-theme, which wins in both directions. */
export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) ?? 'system'
    } catch {
      return 'system'
    }
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* storage can be blocked; the stamp above still applies for this visit */
    }
  }, [theme])

  function cycleTheme() {
    setTheme((current) =>
      current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system',
    )
  }

  return { theme, setTheme, cycleTheme }
}
