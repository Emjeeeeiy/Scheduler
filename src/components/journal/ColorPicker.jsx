import { useCallback, useEffect, useRef } from 'react'
import { normalizeHex } from '@cadence/shared/journal.js'
import { usePersistentState } from '../../lib/usePersistentState.js'
import { isLowContrast } from '../../lib/journalColors.js'
import { keepSelection } from './toolbarUtils.js'

/* One colour picker for every colour in the Journal — text, highlight, paper,
 * pattern, pen. Named swatches first (each a real button with a spoken name), an
 * optional "none / automatic" row, the colours this person used last, and the
 * browser's own colour dialog for anything else.
 *
 * `paperHex` is what the colour will sit on. A swatch that would be hard to read
 * against it is dimmed and says so in its tooltip, rather than being hidden:
 * the writer may well want it, but should not discover on the page that black
 * ink on midnight paper is invisible.
 */

const RECENT_MAX = 8
const lower = (value) => String(value ?? '').toLowerCase()

const reviveRecents = (stored) =>
  Array.isArray(stored) ? stored.filter((v) => typeof v === 'string').slice(0, RECENT_MAX) : []

export function ColorPicker({
  swatches,
  value,
  onPick,
  onClear,
  clearLabel = 'Automatic',
  paperHex = null,
  recentKey = 'cadence-journal:recent-colors',
  customLabel = 'Custom color',
  toValue = (hex) => hex,
  label = 'Colors',
}) {
  const [recents, setRecents] = usePersistentState(recentKey, [], reviveRecents)
  const customRef = useRef(null)
  const pickRef = useRef(onPick)
  const remember = useCallback(
    (color) => setRecents((current) => [color, ...current.filter((c) => lower(c) !== lower(color))].slice(0, RECENT_MAX)),
    [setRecents],
  )

  useEffect(() => {
    pickRef.current = onPick
  })

  /* The dialog's `input` event fires continuously while a colour is dragged
     around it, and each one would be an undo step and a write. Its `change`
     event fires once, when the choice is made — React's onChange is really
     `input`, so this listens natively. */
  useEffect(() => {
    const element = customRef.current
    if (!element) return undefined
    const onChange = () => {
      const picked = toValue(element.value)
      pickRef.current(picked)
      remember(picked)
    }
    element.addEventListener('change', onChange)
    return () => element.removeEventListener('change', onChange)
  }, [toValue, remember])

  const swatch = (color, name, key = color) => {
    const selected = value != null && lower(value) === lower(color)
    const faint = paperHex ? isLowContrast(color, paperHex) : false
    return (
      <button
        key={key}
        type="button"
        className={`swatch${selected ? ' swatch--on' : ''}${faint ? ' swatch--faint' : ''}`}
        style={{ '--swatch': color }}
        aria-label={name}
        aria-pressed={selected}
        title={faint ? `${name} — hard to read on this paper` : name}
        onMouseDown={keepSelection}
        onClick={() => onPick(color)}
      />
    )
  }

  const customStart = normalizeHex(String(value ?? '').slice(0, 7)) ?? '#000000'

  return (
    <div className="picker">
      {onClear ? (
        <button type="button" className="tb-item" onMouseDown={keepSelection} onClick={onClear}>
          <span className="tb-item__label">{clearLabel}</span>
        </button>
      ) : null}
      <div className="swatches" role="group" aria-label={label}>
        {swatches.map((s) => swatch(s.value, s.name))}
      </div>
      {recents.length > 0 ? (
        <>
          <p className="picker__label">Recent</p>
          <div className="swatches" role="group" aria-label="Recent colors">
            {recents.map((color) => swatch(color, `Recent ${color}`, `recent-${color}`))}
          </div>
        </>
      ) : null}
      <label className="picker__custom">
        <span>{customLabel}</span>
        <input ref={customRef} type="color" defaultValue={customStart} aria-label={customLabel} />
      </label>
    </div>
  )
}
