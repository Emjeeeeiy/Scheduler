import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const ThemeContext = createContext(null)

const THEME_KEY = 'cadence-app:theme'

/** 'system' leaves the root unstamped so prefers-color-scheme decides; an
    explicit choice stamps data-theme, which wins in both directions.

    This sits above the auth gate on purpose. The theme used to be owned by
    whichever screen happened to want it — the sign-in screen and the settings
    modal — so for the entire signed-in app, nothing was holding the stamp on
    <html>. A reload landed on the session skeleton (which asks for no theme)
    painted in whatever prefers-color-scheme happened to say, and nothing
    corrected it until the user opened Settings, remounting the hook and
    snapping the page back. Owned here instead, it is mounted once for the
    whole session: the stamp is written on mount and stays written, and every
    reader shares the one piece of state instead of each keeping a private
    copy that can drift. index.html's boot script also stamps data-theme
    before first paint, so the skeleton never paints wrong either. */
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      // A first-time visitor with no stored preference lands on dark — the
      // app's primary identity now. Anyone who has already chosen anything,
      // including 'system' or 'light', keeps exactly that choice.
      return localStorage.getItem(THEME_KEY) ?? 'dark'
    } catch {
      return 'dark'
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

  const value = useMemo(() => ({ theme, setTheme }), [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>')
  return context
}
