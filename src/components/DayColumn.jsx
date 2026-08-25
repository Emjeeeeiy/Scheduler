import { useRef, useState } from 'react'
import { useSchedule } from '../state/ScheduleContext.jsx'
import { layoutDay, minToPercent, ratioToMin } from '../lib/layout.js'
import { durationLabel, minToLabel, snapMin } from '../lib/date.js'
import { recurrenceLabel } from '../lib/recurrence.js'
import { RepeatIcon } from './icons.jsx'

/** Custom MIME type so a drop handler can tell one of our tasks from a file or
    a stray text selection dragged in from elsewhere. */
export const DRAG_TYPE = 'application/x-cadence-task'

const SNAP_MIN = 15

/**
 * One day as a time grid: hour rules, positioned blocks, click-to-create, and
 * drop-to-schedule. Both the Week view (seven of these) and the Day view (one
 * wide one) render it, so scheduling behaves identically in both.
 */
export function DayColumn({
  dateKey,
  tasks,
  windowStart,
  windowEnd,
  hourMarkList,
  onCreate,
  onEdit,
  nowMinute = null,
}) {
  const { scheduleTask, getTag } = useSchedule()
  const surfaceRef = useRef(null)
  const [hoverMin, setHoverMin] = useState(null)

  const timed = tasks.filter((t) => Number.isFinite(t.startMin))
  const blocks = layoutDay(timed, windowStart, windowEnd)

  /** Which minute a pointer at `clientY` is over, snapped to the grid. */
  function minuteAt(clientY) {
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect || rect.height === 0) return windowStart
    return ratioToMin((clientY - rect.top) / rect.height, windowStart, windowEnd, SNAP_MIN)
  }

  function onSurfaceClick(event) {
    // Clicks that started on a block are the block's business, not the day's.
    if (event.target !== event.currentTarget) return
    onCreate?.({ date: dateKey, startMin: minuteAt(event.clientY) })
  }

  function onDragStart(event, block) {
    const rect = event.currentTarget.getBoundingClientRect()
    /* Remember where inside the block the grab happened, so the block lands
       under the cursor rather than snapping its top edge to the pointer. */
    const grabRatio = rect.height === 0 ? 0 : (event.clientY - rect.top) / rect.height
    const grabOffsetMin = Math.round(grabRatio * block.task.durationMin)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(
      DRAG_TYPE,
      JSON.stringify({ id: block.task.id, grabOffsetMin }),
    )
  }

  function readDrag(event) {
    const raw = event.dataTransfer.getData(DRAG_TYPE)
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  function onDragOver(event) {
    if (!event.dataTransfer.types.includes(DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setHoverMin(minuteAt(event.clientY))
  }

  async function onDrop(event) {
    if (!event.dataTransfer.types.includes(DRAG_TYPE)) return
    event.preventDefault()
    setHoverMin(null)
    const payload = readDrag(event)
    if (!payload?.id) return
    const startMin = snapMin(minuteAt(event.clientY) - (payload.grabOffsetMin ?? 0), SNAP_MIN)
    try {
      await scheduleTask(payload.id, { date: dateKey, startMin })
    } catch (caught) {
      console.error('Could not move task.', caught)
    }
  }

  return (
    <div
      className="day-column"
      onDragOver={onDragOver}
      onDragLeave={() => setHoverMin(null)}
      onDrop={onDrop}
    >
      {hourMarkList.map((min) => (
        <div
          key={min}
          className="day-column__rule"
          style={{ top: `${minToPercent(min, windowStart, windowEnd)}%` }}
          aria-hidden="true"
        />
      ))}

      {/* The click/drop surface sits under the blocks so a click on empty space
          creates a task while a click on a block edits it. */}
      <div
        ref={surfaceRef}
        className="day-column__surface"
        onClick={onSurfaceClick}
        role="presentation"
      />

      {hoverMin !== null && (
        <div
          className="day-column__hover"
          style={{ top: `${minToPercent(hoverMin, windowStart, windowEnd)}%` }}
          aria-hidden="true"
        >
          <span>{minToLabel(hoverMin)}</span>
        </div>
      )}

      {nowMinute !== null && nowMinute >= windowStart && nowMinute <= windowEnd && (
        <div
          className="day-column__now"
          style={{ top: `${minToPercent(nowMinute, windowStart, windowEnd)}%` }}
          aria-hidden="true"
        />
      )}

      {blocks.map((block) => {
        const tag = getTag(block.task.tagId)
        return (
          <button
            key={block.task.id}
            type="button"
            draggable
            onDragStart={(event) => onDragStart(event, block)}
            onClick={() => onEdit?.(block.task)}
            className={`block${block.task.done ? ' block--done' : ''}${
              block.columns > 1 ? ' block--split' : ''
            }`}
            style={{
              top: `${block.top}%`,
              // 2px of surface between touching blocks, and between a block and
              // the column edge — the gap separates them, never a stroke.
              height: `calc(${block.height}% - 2px)`,
              left: `calc(${block.left}% + 1px)`,
              width: `calc(${block.width}% - 2px)`,
              '--tag': tag?.color ?? 'var(--series-1)',
            }}
            title={[
              block.task.title,
              minToLabel(block.task.startMin),
              durationLabel(block.task.durationMin),
              block.task.recurrence && recurrenceLabel(block.task.recurrence),
            ]
              .filter(Boolean)
              .join(' · ')}
          >
            <span className="block__title">{block.task.title}</span>
            <span className="block__time">
              {minToLabel(block.task.startMin)} · {durationLabel(block.task.durationMin)}
              {block.task.recurrence && (
                <>
                  {' · '}
                  <RepeatIcon className="block__repeat" />
                  <span className="visually-hidden">{recurrenceLabel(block.task.recurrence)}</span>
                </>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
