/** A single headline number with its label, and an optional sub-line for the
    context that stops a bare number being misread. */
export function StatTile({ label, value, unit, hint, tone = 'neutral' }) {
  return (
    <div className={`stat-tile stat-tile--${tone}`}>
      <p className="stat-tile__label">{label}</p>
      <p className="stat-tile__value">
        {value}
        {unit && <span className="stat-tile__unit">{unit}</span>}
      </p>
      {hint && <p className="stat-tile__hint">{hint}</p>}
    </div>
  )
}
