/** A single headline number with its label, and an optional sub-line for the
    context that stops a bare number being misread. `icon` is a component
    reference (from icons.jsx), not an element — kept small and muted so it
    reads as a category mark, never competing with the number itself. */
export function StatTile({ label, value, unit, hint, tone = 'neutral', icon: Icon }) {
  return (
    <div className={`stat-tile stat-tile--${tone}`}>
      <div className="stat-tile__head">
        <p className="stat-tile__label">{label}</p>
        {Icon && <Icon className="stat-tile__icon" />}
      </div>
      <p className="stat-tile__value">
        {value}
        {unit && <span className="stat-tile__unit">{unit}</span>}
      </p>
      {hint && <p className="stat-tile__hint">{hint}</p>}
    </div>
  )
}
