/** One setting: what it is on the left, the control on the right — a column of
    names and a column of values, stacked on a phone. The title is a heading so
    the page has an outline a screen reader can jump around. `hint` is one short
    line saying what it does; leave it out when it would only repeat the title.

    `wide` is for a setting whose control is a whole list or form (the tags, the
    shortcuts): the explanation sits above it and the control takes the full
    width, instead of being squeezed into the right-hand column. `below` is for
    what the control reports or caveats (a status, a "blocked in your browser"),
    set under the row at its full width rather than inside the control column.
    `danger` marks the one setting that cannot be undone. */
export function Row({ title, hint, children, below, wide = false, danger = false }) {
  return (
    <div className={`settings-row${wide ? ' settings-row--wide' : ''}`}>
      <div className="settings-row__text">
        <h4 className={`settings-row__title${danger ? ' settings-row__title--danger' : ''}`}>{title}</h4>
        {hint && <p className="field__hint">{hint}</p>}
      </div>
      {children ? <div className="settings-row__control">{children}</div> : null}
      {below ? <div className="settings-row__below">{below}</div> : null}
    </div>
  )
}
