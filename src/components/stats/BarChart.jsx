import { useEffect, useId, useState } from 'react'
import { durationLabel, toHours } from '@cadence/shared/date.js'
import { BACK_RANK, useBackLayer } from '../../lib/useBackLayer.js'
import { useRevealOnView } from '../../lib/useRevealOnView.js'
import { CloseIcon } from '../icons.jsx'

/* Round the axis top to a clean number so ticks read 0 / 2 / 4 rather than
   0 / 1.7 / 3.4. */
function niceMax(value) {
  if (value <= 0) return 1
  const steps = [1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24]
  const hours = value / 60
  return (steps.find((s) => s >= hours) ?? Math.ceil(hours)) * 60
}

/* The columns come in one after another, 40ms apart — but never spread over more
   than 400ms in all, so a 30-day range ripples across at a quicker step instead of
   taking over a second, and instead of starting its last eighteen columns together. */
const STAGGER_MS = 40
const STAGGER_SPAN_MS = 400

/* Switching range (7 ↔ 30 days): the columns that were showing leave as a ghost
   layer for this long while the new ones grow in, starting `SWITCH_LEAD_MS` after
   them so the one set has begun to clear before the other begins. The ghost is
   removed a beat after its animation ends (see chart-motion.css). */
const LEAVE_MS = 240
const SWITCH_LEAD_MS = 120

/* What makes one range "a different set of columns" from another: how many there
   are and where they start and end. An edit to a task changes heights, not this. */
function rangeSignature(rows) {
  return `${rows.length}:${rows[0]?.key ?? ''}:${rows[rows.length - 1]?.key ?? ''}`
}

/* A tooltip centred on a column near either end of the plot hangs off the card; it
   lines up with that edge instead. */
function tooltipEdge(index, count) {
  if (index < 2) return ' chart__tooltip--start'
  if (index >= count - 2) return ' chart__tooltip--end'
  return ''
}

/**
 * Hours per day, as columns. Planned time is the track and completed time the
 * fill inside it — one measure in two states, so it stays on a single scale
 * rather than becoming a two-axis chart. Same hue, light step under dark step.
 */
export function BarChart({ rows, label, emptyText = 'Nothing planned in this range.' }) {
  const [hover, setHover] = useState(null)
  const [showTable, setShowTable] = useState(false)
  const [revealRef, seen] = useRevealOnView()
  const tableId = useId()

  const peak = Math.max(...rows.map((r) => r.plannedMin), 0)
  const axisMax = niceMax(peak)
  const ticks = [0, axisMax / 2, axisMax]
  // Direct-label the busiest column only; the axis and the tooltip carry the
  // rest. A number over every column goes unread.
  const peakIndex = peak > 0 ? rows.findIndex((r) => r.plannedMin === peak) : -1
  const step = Math.min(STAGGER_MS, STAGGER_SPAN_MS / Math.max(rows.length - 1, 1))

  /* A switch of range, noticed while rendering: when the set of columns changes,
     the one that was showing is handed to a ghost layer (below) and the new one is
     mounted afresh (its key carries the signature), so it grows in rather than
     the old bars jumping sideways to wherever the new layout puts them. Updating
     state in render like this is React's own pattern for state that follows a
     prop, and means no frame is ever painted with both sets at full height. */
  const signature = rangeSignature(rows)
  const [shown, setShown] = useState({ signature, rows, axisMax, peak })
  const [leaving, setLeaving] = useState(null)
  const [lead, setLead] = useState(0)
  if (shown.signature !== signature) {
    setShown({ signature, rows, axisMax, peak })
    // A chart nobody has seen yet has nothing to leave; one with no bars neither.
    if (seen && shown.peak > 0) {
      setLeaving(shown)
      setLead(SWITCH_LEAD_MS)
    }
  }
  useEffect(() => {
    if (!leaving) return undefined
    const timer = setTimeout(() => setLeaving(null), LEAVE_MS + 60)
    return () => clearTimeout(timer)
  }, [leaving])

  if (peak === 0) {
    return (
      <figure className="chart">
        <figcaption className="chart__title">{label}</figcaption>
        <p className="empty empty--sm">{emptyText}</p>
      </figure>
    )
  }

  return (
    <figure ref={revealRef} className={`chart ${seen ? 'chart--in' : 'chart--idle'}`}>
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
              className={`chart__gridline${tick === 0 ? ' chart__gridline--base' : ''}`}
              style={{ bottom: `${(tick / axisMax) * 100}%` }}
              aria-hidden="true"
            />
          ))}

          {/* Keyed by `seen` and by the range: until the chart has scrolled into view the
              columns stand at the baseline, and the moment it has — and again whenever
              the range changes — they are mounted afresh. A new element is what makes
              the stylesheet's grow-from-zero play (an element whose height merely
              changed would transition instead, and lose its stagger), so this is the
              one place a key is doing animation's work. */}
          <div
            className="chart__columns"
            key={`${seen ? 'in' : 'idle'}-${signature}`}
            style={{ '--lead': `${lead}ms` }}
          >
            {rows.map((row, index) => {
              const plannedPct = (row.plannedMin / axisMax) * 100
              const donePct =
                row.plannedMin === 0 ? 0 : (row.completedMin / row.plannedMin) * 100
              const complete = row.completedMin >= row.plannedMin && row.plannedMin > 0
              return (
                <div
                  key={row.key}
                  className={`chart__band${hover === row.key ? ' chart__band--hover' : ''}`}
                  style={{ '--delay': `${Math.round(index * step)}ms` }}
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
                    style={{ '--h': `${plannedPct}%` }}
                    onFocus={() => setHover(row.key)}
                    onBlur={() => setHover(null)}
                    aria-label={`${row.label}: ${durationLabel(row.plannedMin)} planned, ${durationLabel(
                      row.completedMin,
                    )} done`}
                  >
                    <span
                      className={`chart__fill${complete ? ' chart__fill--complete' : ''}`}
                      style={{ '--h': `${donePct}%` }}
                      aria-hidden="true"
                    />
                  </button>
                  <span className="chart__label">{row.short ?? row.label}</span>

                  {hover === row.key && (
                    <div
                      className={`chart__tooltip${tooltipEdge(index, rows.length)}`}
                      role="status"
                    >
                      {/* Values lead, labels follow: the reader already has the day
                          and wants the number. Each row is keyed with the legend's own
                          swatch, so the tooltip and the key above the chart agree. */}
                      <strong>{row.label}</strong>
                      <span className="chart__tip-row">
                        <span className="chart__swatch chart__swatch--planned" aria-hidden="true" />
                        <span className="chart__tip-value">{durationLabel(row.plannedMin)}</span>
                        planned
                      </span>
                      <span className="chart__tip-row">
                        <span className="chart__swatch chart__swatch--done" aria-hidden="true" />
                        <span className="chart__tip-value">{durationLabel(row.completedMin)}</span>
                        done
                      </span>
                      <span className="chart__tip-meta">
                        {row.doneCount}/{row.count} tasks
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* The range that was showing, for the moment it takes to leave: bars only,
              no buttons and no tooltip, so nothing in it can be focused or read out
              (it is `aria-hidden`, and the live columns are the real chart). The
              stylesheet draws it only where motion is allowed; see chart-motion.css. */}
          {leaving && (
            <div className="chart__columns chart__columns--leaving" aria-hidden="true">
              {leaving.rows.map((row) => {
                const plannedPct = (row.plannedMin / leaving.axisMax) * 100
                const donePct =
                  row.plannedMin === 0 ? 0 : (row.completedMin / row.plannedMin) * 100
                return (
                  <div key={row.key} className="chart__band">
                    <span className="chart__bar" style={{ '--h': `${plannedPct}%` }}>
                      <span className="chart__fill" style={{ '--h': `${donePct}%` }} />
                    </span>
                    <span className="chart__label">{row.short ?? row.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Every value stays reachable without hovering. Opens in a modal
          rather than expanding in place — the chart's own column is only
          wide enough to cramp a four-column table, and every other reader of
          exact numbers in this app (the item index, the tag list) already
          gets a full-width surface rather than a squeezed inline one. */}
      <button
        type="button"
        className="ghost-button ghost-button--sm chart__table-toggle"
        aria-haspopup="dialog"
        aria-controls={tableId}
        onClick={() => setShowTable(true)}
      >
        Table view
      </button>

      {showTable && (
        <ChartTableModal id={tableId} label={label} rows={rows} onClose={() => setShowTable(false)} />
      )}
    </figure>
  )
}

function ChartTableModal({ id, label, rows, onClose }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // The phone's Back button closes it too (see backStack.js).
  useBackLayer(
    true,
    () => {
      onClose()
      return true
    },
    BACK_RANK.modal,
  )

  return (
    <div className="modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal__panel" role="dialog" aria-modal="true" aria-label={label}>
        <div className="modal__head">
          <h2 className="modal__title">{label}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <table className="data-table" id={id}>
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
      </div>
    </div>
  )
}
