import { useId, useState } from 'react'
import { durationLabel, toHours } from '../../lib/date.js'

/* Round the axis top to a clean number so ticks read 0 / 2 / 4 rather than
   0 / 1.7 / 3.4. */
function niceMax(value) {
  if (value <= 0) return 1
  const steps = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24]
  const hours = value / 60
  return (steps.find((s) => s >= hours) ?? Math.ceil(hours)) * 60
}

/**
 * Hours per day, as columns. Planned time is the track and completed time the
 * fill inside it — one measure in two states, so it stays on a single scale
 * rather than becoming a two-axis chart. Same hue, light step under dark step.
 */
export function BarChart({ rows, label, emptyText = 'Nothing planned in this range.' }) {
  const [hover, setHover] = useState(null)
  const [showTable, setShowTable] = useState(false)
  const tableId = useId()

  const peak = Math.max(...rows.map((r) => r.plannedMin), 0)
  const axisMax = niceMax(peak)
  const ticks = [0, axisMax / 2, axisMax]
  // Direct-label the busiest column only; the axis and the tooltip carry the
  // rest. A number over every column goes unread.
  const peakIndex = peak > 0 ? rows.findIndex((r) => r.plannedMin === peak) : -1

  if (peak === 0) {
    return (
      <figure className="chart">
        <figcaption className="chart__title">{label}</figcaption>
        <p className="empty empty--sm">{emptyText}</p>
      </figure>
    )
  }

  return (
    <figure className="chart">
      <figcaption className="chart__title">
        {label}
        <span className="chart__key">
          <span className="chart__key-item">
            <span className="chart__swatch chart__swatch--done" aria-hidden="true" /> done
          </span>
          <span className="chart__key-item">
            <span className="chart__swatch chart__swatch--planned" aria-hidden="true" /> planned
          </span>
        </span>
      </figcaption>

      <div className="chart__body">
        <div className="chart__axis" aria-hidden="true">
          {[...ticks].reverse().map((tick) => (
            <span key={tick} className="chart__tick">
              {toHours(tick)}h
            </span>
          ))}
        </div>

        <div className="chart__plot">
          {[...ticks].reverse().map((tick) => (
            <div
              key={tick}
              className="chart__gridline"
              style={{ bottom: `${(tick / axisMax) * 100}%` }}
              aria-hidden="true"
            />
          ))}

          <div className="chart__columns">
            {rows.map((row, index) => {
              const plannedPct = (row.plannedMin / axisMax) * 100
              const donePct =
                row.plannedMin === 0 ? 0 : (row.completedMin / row.plannedMin) * 100
              const complete = row.completedMin >= row.plannedMin && row.plannedMin > 0
              return (
                <div
                  key={row.key}
                  className={`chart__band${hover === row.key ? ' chart__band--hover' : ''}`}
                  onMouseEnter={() => setHover(row.key)}
                  onMouseLeave={() => setHover(null)}
                >
                  {index === peakIndex && (
                    <span
                      className="chart__value"
                      style={{ bottom: `calc(${plannedPct}% + 6px)` }}
                    >
                      {toHours(row.plannedMin)}h
                    </span>
                  )}
                  <button
                    type="button"
                    className="chart__bar"
                    style={{ height: `${plannedPct}%` }}
                    onFocus={() => setHover(row.key)}
                    onBlur={() => setHover(null)}
                    aria-label={`${row.label}: ${durationLabel(row.plannedMin)} planned, ${durationLabel(
                      row.completedMin,
                    )} done`}
                  >
                    <span
                      className={`chart__fill${complete ? ' chart__fill--complete' : ''}`}
                      style={{ height: `${donePct}%` }}
                      aria-hidden="true"
                    />
                  </button>
                  <span className="chart__label">{row.short ?? row.label}</span>

                  {hover === row.key && (
                    <div className="chart__tooltip" role="status">
                      <strong>{row.label}</strong>
                      <span>{durationLabel(row.plannedMin)} planned</span>
                      <span>{durationLabel(row.completedMin)} done</span>
                      <span>
                        {row.doneCount}/{row.count} tasks
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Every value stays reachable without hovering. */}
      <button
        type="button"
        className="ghost-button ghost-button--sm chart__table-toggle"
        aria-expanded={showTable}
        aria-controls={tableId}
        onClick={() => setShowTable((v) => !v)}
      >
        {showTable ? 'Hide table' : 'Table view'}
      </button>

      {showTable && (
        <table className="data-table" id={tableId}>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Planned</th>
              <th scope="col">Done</th>
              <th scope="col">Tasks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{row.label}</th>
                <td>{durationLabel(row.plannedMin)}</td>
                <td>{durationLabel(row.completedMin)}</td>
                <td>
                  {row.doneCount}/{row.count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  )
}
