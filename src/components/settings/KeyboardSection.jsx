import { useState } from 'react'
import { DEFAULT_SHORTCUTS, SHORTCUT_ACTIONS, useSettings } from '../../state/SettingsContext.jsx'
import { Row } from './SettingsParts.jsx'

/** A key press as something worth storing and showing. Modifiers are refused
    rather than encoded: this is a map of single keys, and the window listener
    that reads it bails out on a modified press anyway (see App.jsx), so
    accepting Ctrl+P here would bind a shortcut that could never fire. */
function bindableKey(event) {
  if (event.key === 'Escape' || event.key === 'Tab') return null
  if (event.metaKey || event.ctrlKey || event.altKey) return null
  if (event.key === ' ') return null
  // A modifier pressed on its own reports itself as the key; waiting for a
  // real one is better than binding "Shift".
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return null
  return event.key
}

/** Arrow keys read as symbols; everything else is a literal key. */
function keyLabel(key) {
  const arrows = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' }
  return arrows[key] ?? key
}

/** The single-key shortcuts and a way to rebind each. */
export function KeyboardSection() {
  const { settings, updateSetting } = useSettings()
  const [capturing, setCapturing] = useState(null)

  /* Rebinding listens on the button itself rather than the window: only one
     row can be capturing at a time, and the button already holds focus from
     the click that started it. */
  function onCaptureKey(actionId, event) {
    /* Tab passes straight through, unhandled: swallowing it would trap focus
       on a button that is waiting for a key it will never accept. Moving
       focus away cancels the capture via onBlur, which is the right outcome. */
    if (event.key === 'Tab') return
    event.preventDefault()
    /* Kept from reaching App's window-level key listener: that one would run
       the key as a shortcut ("n" opening a new task) instead of binding it, and
       while capturing, Escape means "stop capturing". */
    event.stopPropagation()
    if (event.key === 'Escape') {
      setCapturing(null)
      return
    }
    const key = bindableKey(event)
    if (!key) return
    /* A key already spoken for is swapped, not duplicated — two actions on
       one key would leave the second permanently unreachable, since the
       listener runs the first match and stops. */
    const taken = Object.entries(settings.shortcuts).find(
      ([id, bound]) => id !== actionId && bound === key,
    )
    const next = { ...settings.shortcuts, [actionId]: key }
    if (taken) next[taken[0]] = settings.shortcuts[actionId]
    updateSetting('shortcuts', next)
    setCapturing(null)
  }

  return (
    <Row
      wide
      title="Shortcuts"
      hint="Single keys, active when you're not typing in a field. Click one and press the key you want; Escape cancels. A key another action uses swaps the two."
    >
      <ul className="shortcut-list">
        {SHORTCUT_ACTIONS.map((action) => (
          <li key={action.id} className="shortcut-list__row">
            <span className="shortcut-list__label">{action.label}</span>
            <button
              type="button"
              className={`shortcut-list__key${capturing === action.id ? ' shortcut-list__key--capturing' : ''}`}
              onClick={() => setCapturing(action.id)}
              onBlur={() => setCapturing((id) => (id === action.id ? null : id))}
              onKeyDown={(e) => capturing === action.id && onCaptureKey(action.id, e)}
              aria-label={`${action.label} shortcut: ${keyLabel(settings.shortcuts[action.id])}. Click to rebind.`}
            >
              {capturing === action.id ? 'Press a key…' : keyLabel(settings.shortcuts[action.id])}
            </button>
          </li>
        ))}
      </ul>
      <div className="settings-actions">
        <button
          type="button"
          className="ghost-button ghost-button--sm"
          onClick={() => updateSetting('shortcuts', { ...DEFAULT_SHORTCUTS })}
        >
          Reset to defaults
        </button>
      </div>
    </Row>
  )
}
