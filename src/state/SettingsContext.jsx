import { createContext, useContext, useMemo } from 'react'
import { usePersistentState } from '../lib/usePersistentState.js'

const SettingsContext = createContext(null)

const SETTINGS_KEY = 'cadence-app:settings'

/* One persisted object rather than a usePersistentState call per setting —
   every consumer reads the same snapshot, and a new setting is one more key
   here instead of a new storage entry and a new hook wired through App.jsx.
   Defaults intentionally mirror the constants they're replacing
   (WEEK_STARTS_ON in date.js, SOON_WINDOW_MIN in notifications.js), so
   turning a hardcoded value into a setting never changes behaviour for
   someone who's never opened Settings. */
export const DEFAULT_SETTINGS = {
  weekStartsOn: 1, // 0 = Sunday, 1 = Monday — see date.js's WEEK_STARTS_ON
  landingView: 'dashboard',
  notificationLeadMin: 60, // see notifications.js's SOON_WINDOW_MIN
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = usePersistentState(SETTINGS_KEY, DEFAULT_SETTINGS, (stored) => ({
    ...DEFAULT_SETTINGS,
    // A settings doc from an older build may be missing a key a newer one
    // added; the spread above fills it in rather than leaving it undefined.
    ...stored,
  }))

  const value = useMemo(
    () => ({
      settings,
      updateSetting: (key, next) => setSettings((current) => ({ ...current, [key]: next })),
    }),
    [settings, setSettings],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) throw new Error('useSettings must be used inside <SettingsProvider>')
  return context
}
