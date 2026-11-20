/**
 * One row of a horizontal bar list: the name with its colour dot, the bar, the
 * value. Shared by Time by tag and Weekly goals so the two cannot drift apart.
 *
 * `percent` is how much of the track is filled, 0–100. It is passed down as a
 * custom property (`--w`) rather than an inline width so the stylesheet can hold
 * the bar at zero until the chart has scrolled into view (see chart-motion.css).
 * `index` staggers the entrance, one row after another.
 */
export function TagBarRow({ name, color, percent, value, index }) {
  return (
    <li className="tag-bars__row" style={{ '--i': index }}>
      <span className="tag-bars__name">
        <span className="tag-bars__dot" style={{ background: color }} aria-hidden="true" />
        {name}
      </span>
      <span className="tag-bars__track">
        <span className="tag-bars__fill" style={{ '--w': `${percent}%`, background: color }} />
      </span>
      <span className="tag-bars__value">{value}</span>
    </li>
  )
}
