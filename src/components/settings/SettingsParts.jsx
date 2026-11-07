/** One setting: what it is and why on the left, the control on the right — the
    two-column row a wide screen has room for, stacked on a phone. The title is a
    heading so the page has an outline a screen reader can jump around.

    `wide` is for a setting whose control is a whole list or form (the tags): the
    explanation sits above it and the control takes the full width, instead of
    being squeezed into the right-hand column. `danger` marks the one setting
    that cannot be undone. */
export function Row({ title, hint, children, wide = false, danger = false }) {
  return (
    <div className={`settings-row${wide ? ' settings-row--wide' : ''}`}>
      <div className="settings-row__text">
        <h4 className={`settings-row__title${danger ? ' settings-row__title--danger' : ''}`}>{title}</h4>
        {hint && <p className="field__hint">{hint}</p>}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  )
}
