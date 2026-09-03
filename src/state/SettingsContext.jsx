import { createContext, useContext, useMemo } from 'react'
import { usePersistentState } from '../lib/usePersistentState.js'

const SettingsContext = createContext(null)

const SETTINGS_KEY = 'cadence-app:settings'

/** The rebindable actions, in the order Settings lists them. `label` is the
    only copy for each one, so the settings row and any future hint read the
    same words. */
export const SHORTCUT_ACTIONS = [
  { id: 'newTask', label: 'New task' },
  { id: 'newEvent', label: 'New event' },
  { id: 'jumpToday', label: 'Jump to today' },
  { id: 'prevDate', label: 'Previous day/week/month' },
  { id: 'nextDate', label: 'Next day/week/month' },
]

export const DEFAULT_SHORTCUTS = {
  newTask: 'n',
  newEvent: 'e',
  jumpToday: 't',
  prevDate: 'ArrowLeft',
  nextDate: 'ArrowRight',
}

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
  // null means "no restriction" — the Day view's free-slot finder already
  // scopes itself to whatever the grid's own visible window is, and that
  // stays the entire behaviour unless someone opts in here. Not a Trends
  // reference like the other three: there is no prior hardcoded working-hours
  // concept in this app to mirror, so "off" is the only safe default.
  workingHours: null, // { startMin, endMin } once set
  /* The single-key shortcuts App.jsx's window listener answers to. The
     defaults are exactly the keys that were hardcoded there before this was
     a setting, so someone who never opens Settings notices no change.
     Values are raw KeyboardEvent.key strings — that is what the listener
     compares against, so storing anything else would mean a translation
     layer on both sides of the comparison. */
  shortcuts: { ...DEFAULT_SHORTCUTS },
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = usePersistentState(SETTINGS_KEY, DEFAULT_SETTINGS, (stored) => ({
    ...DEFAULT_SETTINGS,
    // A settings doc from an older build may be missing a key a newer one
    // added; the spread above fills it in rather than leaving it undefined.
    ...stored,
    /* Merged one level deeper than the rest, because this one is an object:
       a stored map written before an action existed would otherwise leave
       that action permanently unbound, with no way to notice from the UI. */
    shortcuts: { ...DEFAULT_SHORTCUTS, ...stored?.shortcuts },
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
