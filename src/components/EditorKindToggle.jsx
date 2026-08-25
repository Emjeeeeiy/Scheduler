/* Which kind of thing is being created. Only ever shown while creating — an
   existing task cannot become an event, because the two live in different
   collections and carry different fields.

   Uses the system's one "pick one from a small set" idiom (a neutral pill that
   fills with the accent when chosen), the same control as the trends range
   picker and the repeat presets, rather than inventing a second selected-state
   treatment for a third place. */
export function EditorKindToggle({ kind, onChangeKind }) {
  return (
    <div className="field editor-kind">
      <span className="field__label" id="editor-kind-label">
        Kind
      </span>
      <div className="editor-kind__options" role="group" aria-labelledby="editor-kind-label">
        <button
          type="button"
          className={`filter-chip${kind === 'task' ? ' filter-chip--on' : ''}`}
          aria-pressed={kind === 'task'}
          onClick={() => onChangeKind?.('task')}
        >
          Task
        </button>
        <button
          type="button"
          className={`filter-chip${kind === 'event' ? ' filter-chip--on' : ''}`}
          aria-pressed={kind === 'event'}
          onClick={() => onChangeKind?.('event')}
        >
          Event
        </button>
      </div>
      <span className="field__hint">
        {kind === 'task'
          ? 'Something to get done — it can be ticked off.'
          : 'Something that is happening — it can run across days, and has nothing to tick off.'}
      </span>
    </div>
  )
}
