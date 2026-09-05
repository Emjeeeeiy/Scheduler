import { minToLabel, relativeDayLabel } from '../../lib/date.js'

/** The single place TaskEditor's three newer AI suggestions surface — a
    time slot, a checklist, and notes — as one review-before-you-commit
    panel rather than three separate silent writes. Tag suggestions keep
    their own existing "Use X?" button next to the Tag field (shared with
    the offline heuristic that answers first) and are deliberately not
    duplicated here — see the comment above this component's one caller in
    TaskEditor.jsx.

    Every prop is independently nullable — a partial answer (say, just a
    checklist, no good time slot) renders only the rows that came back.
    `onApply` is trusted by the caller to write only into fields that are
    still empty; this component never writes anything itself. */
export function AiSuggestionPanel({ time, checklist, notes, onApply, onDismiss }) {
  return (
    <div className="ai-suggest" role="group" aria-label="AI suggestions">
      <span className="ai-suggest__label">AI suggestions</span>

      <ul className="ai-suggest__rows">
        {time && (
          <li className="ai-suggest__row">
            <span className="ai-suggest__key">Time</span>
            <span className="ai-suggest__value">
              {relativeDayLabel(time.date)} · {minToLabel(time.startMin)} ({time.durationMin} min)
            </span>
          </li>
        )}
        {checklist && (
          <li className="ai-suggest__row">
            <span className="ai-suggest__key">Checklist</span>
            <span className="ai-suggest__value">
              {checklist.length} item{checklist.length === 1 ? '' : 's'}
            </span>
          </li>
        )}
        {notes && (
          <li className="ai-suggest__row">
            <span className="ai-suggest__key">Notes</span>
            <span className="ai-suggest__value ai-suggest__value--clamp">{notes}</span>
          </li>
        )}
      </ul>

      <div className="ai-suggest__actions">
        <button type="button" className="primary-button primary-button--sm" onClick={onApply}>
          Apply all
        </button>
        <button type="button" className="ghost-button ghost-button--sm" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  )
}
