import { toHours } from '@cadence/shared/date.js'
import { useRevealOnView } from '../../lib/useRevealOnView.js'
import { TagBarRow } from './TagBarRow.jsx'

/**
 * Weekly goals: each tag with a goal, how much of it this week has been planned.
 * A tag's colour is its identity and its name sits beside it as text. The bar is
 * capped at the goal (a week planned past it is "full", not longer than the
 * track); the exact figures are the value at the right.
 *
 * `rows` are `{ id, name, color, plannedMin, goalMinutes }`.
 */
export function GoalBars({ rows, label }) {
  const [revealRef, seen] = useRevealOnView()

  return (
    <figure ref={revealRef} className={`chart ${seen ? 'chart--in' : 'chart--idle'}`}>
      <figcaption className="chart__title">{label}</figcaption>
      {/* Keyed by `seen` so the rows mount afresh, already in their entering state,
          the moment the chart is looked at (see BarChart for why). */}
      <ul className="tag-bars" key={seen ? 'in' : 'idle'}>
        {rows.map((row, index) => (
          <TagBarRow
            key={row.id}
            index={index}
            name={row.name}
            color={row.color}
            percent={Math.min(100, Math.round((row.plannedMin / row.goalMinutes) * 100))}
            value={`${toHours(row.plannedMin)}h / ${toHours(row.goalMinutes)}h`}
          />
        ))}
      </ul>
    </figure>
  )
}
