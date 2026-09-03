import { useMemo, useRef, useState } from 'react'
import { useModalA11y } from '../../lib/useModalA11y.js'
import { SearchIcon } from '../icons.jsx'

/** Case-insensitive: an exact substring match first (the common case reads
    fastest), a subsequence match as a fallback so "nweek" still finds "New
    event" style items. No dependency pulled in for this — the action list
    this filters is a couple dozen entries at most, not a document index. */
function matches(query, label) {
  if (!query) return true
  const q = query.toLowerCase()
  const text = label.toLowerCase()
  if (text.includes(q)) return true
  let qi = 0
  for (let ti = 0; ti < text.length && qi < q.length; ti++) {
    if (text[ti] === q[qi]) qi += 1
  }
  return qi === q.length
}

/**
 * A global "jump to anything" overlay — Cmd/Ctrl+K, same idiom as every
 * other app that has one. `actions` is a flat list of
 * `{ id, label, hint, Icon, onRun }`; this component owns only the search
 * box, the filtered list, and arrow-key/Enter navigation through it. It
 * knows nothing about what a "New task" or "Go to Week" action actually
 * does — App.jsx builds that list from the same handlers the sidebar and
 * keyboard shortcuts already call, so a palette entry can never drift from
 * what its equivalent button does.
 */
export function CommandPalette({ onClose, actions }) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const panelRef = useRef(null)
  const inputRef = useRef(null)
  useModalA11y(panelRef, { onClose, initialFocusRef: inputRef })

  const filtered = useMemo(
    () => actions.filter((action) => matches(query, action.label)),
    [actions, query],
  )
  // Clamped rather than reset to 0 on every filter change: losing the
  // selection on each keystroke would make arrowing down right after typing
  // land somewhere unpredictable.
  const boundedIndex = Math.min(activeIndex, Math.max(filtered.length - 1, 0))

  function run(action) {
    onClose()
    action.onRun()
  }

  function onInputKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const action = filtered[boundedIndex]
      if (action) run(action)
    }
    // Escape and Tab are handled by useModalA11y's window-level listener —
    // nothing extra needed here.
  }

  return (
    <div
      className="modal modal--palette"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        className="modal__panel palette__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="palette__search">
          <SearchIcon className="palette__search-icon" />
          <input
            ref={inputRef}
            className="palette__input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Jump to a view, or create something…"
            aria-label="Command palette search"
            autoComplete="off"
          />
        </div>

        <ul className="palette__list" role="listbox" aria-label="Commands">
          {filtered.length === 0 && <li className="palette__empty">No matches.</li>}
          {filtered.map((action, index) => (
            <li key={action.id}>
              <button
                type="button"
                className={`palette__item${index === boundedIndex ? ' palette__item--active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => run(action)}
                role="option"
                aria-selected={index === boundedIndex}
              >
                {action.Icon && <action.Icon className="palette__item-icon" />}
                <span className="palette__item-label">{action.label}</span>
                {action.hint && <span className="palette__item-hint">{action.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
