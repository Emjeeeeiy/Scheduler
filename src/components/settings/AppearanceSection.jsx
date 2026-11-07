import { useTheme } from '../../state/ThemeContext.jsx'
import { Row } from './SettingsParts.jsx'

const THEME_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/** How the app looks on this device. Just the theme today; anything that
    changes the look rather than the behaviour belongs here. */
export function AppearanceSection() {
  const { theme, setTheme } = useTheme()

  return (
    <Row title="Theme" hint="System follows your OS; Light and Dark override it.">
      <div className="filter-row" role="group" aria-label="Theme">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`filter-chip${theme === option.value ? ' filter-chip--on' : ''}`}
            aria-pressed={theme === option.value}
            onClick={() => setTheme(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </Row>
  )
}
