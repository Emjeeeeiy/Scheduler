import { durationLabel } from '@cadence/shared/date.js'
import { useRevealOnView } from '../../lib/useRevealOnView.js'
import { TagBarRow } from './TagBarRow.jsx'

const MAX_ROWS = 7

/**
 * Hours by tag. Colour here is identity, not magnitude — each bar wears its own
 * tag's colour, and the tag name sits beside it as text, so the encoding never
 * rests on colour alone. Past `maxRows` tags (seven unless a narrower column
 * asks for fewer) the tail folds into "Other" rather than inventing new hues,
 * which would break the palette's ordering guarantee.
 */
export function TagBars({ rows, label, emptyText = 'No tagged time in this range.', maxRows = MAX_ROWS }) {
  const [revealRef, seen] = useRevealOnView()
  const scored = rows.filter((row) => row.plannedMin > 0)

  if (scored.length === 0) {
    return (
      <figure className="chart">
        <figcaption className="chart__title">{label}</figcaption>
        <p className="empty empty--sm">{emptyText}</p>
      </figure>
    )
  }

  const head = scored.slice(0, maxRows)
  const tail = scored.slice(maxRows)
  const display = tail.length
    ? [
        ...head,
        {
          id: '__other',
          tag: { id: '__other', name: `Other (${tail.length})`, color: 'var(--color-text-muted)' },
          plannedMin: tail.reduce((sum, r) => sum + r.plannedMin, 0),
          completedMin: tail.reduce((sum, r) => sum + r.completedMin, 0),
          count: tail.reduce((sum, r) => sum + r.count, 0),
        },
      ]
    : head

  const peak = Math.max(...display.map((r) => r.plannedMin))

  return (
    <figure ref={revealRef} className={`chart ${seen ? 'chart--in' : 'chart--idle'}`}>
      <figcaption className="chart__title">{label}</figcaption>
      {/* Keyed by `seen` so the rows mount afresh, already in their entering state,
          the moment the chart is looked at (see BarChart for why). */}
      <ul className="tag-bars" key={seen ? 'in' : 'idle'}>
        {display.map((row, index) => (
          <TagBarRow
            key={row.id ?? row.tag.id}
            index={index}
            name={row.tag.name}
            color={row.tag.color}
            percent={(row.plannedMin / peak) * 100}
            value={durationLabel(row.plannedMin)}
          />
        ))}
      </ul>
    </figure>
  )
}
