import { durationLabel } from '../lib/date.js'

const MAX_ROWS = 7

/**
 * Hours by tag. Colour here is identity, not magnitude — each bar wears its own
 * tag's colour, and the tag name sits beside it as text, so the encoding never
 * rests on colour alone. Past seven tags the tail folds into "Other" rather
 * than inventing new hues, which would break the palette's ordering guarantee.
 */
export function TagBars({ rows, label, emptyText = 'No tagged time in this range.' }) {
  const scored = rows.filter((row) => row.plannedMin > 0)

  if (scored.length === 0) {
    return (
      <figure className="chart">
        <figcaption className="chart__title">{label}</figcaption>
        <p className="empty empty--sm">{emptyText}</p>
      </figure>
    )
  }

  const head = scored.slice(0, MAX_ROWS)
  const tail = scored.slice(MAX_ROWS)
  const display = tail.length
    ? [
        ...head,
        {
          id: '__other',
          tag: { id: '__other', name: `Other (${tail.length})`, color: 'var(--text-muted)' },
          plannedMin: tail.reduce((sum, r) => sum + r.plannedMin, 0),
          completedMin: tail.reduce((sum, r) => sum + r.completedMin, 0),
          count: tail.reduce((sum, r) => sum + r.count, 0),
        },
      ]
    : head

  const peak = Math.max(...display.map((r) => r.plannedMin))

  return (
    <figure className="chart">
      <figcaption className="chart__title">{label}</figcaption>
      <ul className="tag-bars">
        {display.map((row) => (
          <li key={row.id ?? row.tag.id} className="tag-bars__row">
            <span className="tag-bars__name">
              <span
                className="tag-bars__dot"
                style={{ background: row.tag.color }}
                aria-hidden="true"
              />
              {row.tag.name}
            </span>
            <span className="tag-bars__track">
              <span
                className="tag-bars__fill"
                style={{
                  width: `${(row.plannedMin / peak) * 100}%`,
                  background: row.tag.color,
                }}
              />
            </span>
            <span className="tag-bars__value">{durationLabel(row.plannedMin)}</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}
