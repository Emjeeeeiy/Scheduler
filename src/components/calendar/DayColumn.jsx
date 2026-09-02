import { useRef, useState } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { layoutDay, minToPercent, ratioToMin } from '../../lib/layout.js'
import { DRAG_TASK, hasDrag, readDrag } from '../../lib/dnd.js'
import { durationLabel, minToLabel, snapMin } from '../../lib/date.js'
import { recurrenceLabel } from '../../lib/recurrence.js'
import { RepeatIcon } from '../icons.jsx'

const SNAP_MIN = 15
const MIN_DURATION_MIN = 15

/**
 * One day as a time grid: hour rules, positioned blocks, drag-to-create, block
 * resizing, and drop-to-schedule. Both the Week view (seven of these) and the
 * Day view (one wide one) render it, so scheduling behaves identically in both
 * — a gesture added here is a gesture both views gain.
 *
 * Three gestures share this surface, and they are kept apart deliberately:
 *   - Moving a block is HTML5 drag-and-drop, because it transfers a task
 *     between columns and views (the inbox and the month accept the same drop).
 *   - Creating by dragging a range, and resizing a block, are Pointer Events.
 *     Neither transfers anything, and pointer events work under touch, which
 *     HTML5 dragstart does not fire for at all.
 * The resize handles are rendered as siblings of the block rather than
 * children of it: the block carries `draggable`, and a native dragstart fires
 * on press-and-move regardless of pointer capture, so a handle nested inside
 * it would race the drag every time.
 */
export function DayColumn({
  dateKey,
  tasks,
  events = [],
  windowStart,
  windowEnd,
  hourMarkList,
  onCreate,
  onEdit,
  onEditEvent,
  nowMinute = null,
}) {
  const { scheduleTask, getTag } = useSchedule()
  const surfaceRef = useRef(null)
  const [hoverMin, setHoverMin] = useState(null)
  const [draft, setDraft] = useState(null)
  const [resizing, setResizing] = useState(null)

  const timed = tasks.filter((t) => Number.isFinite(t.startMin))
  /* A single-day timed event sits in the grid alongside tasks; an all-day or
     multi-day one is drawn as a bar by the view above, never sliced into
     per-day pieces here. Both kinds go through layoutDay together so an event
     and a task that overlap split the column instead of stacking. */
  const timedEvents = events.filter(
    (e) => Number.isFinite(e.startMin) && e.startDate === e.endDate && e.startDate === dateKey,
  )
  const blocks = layoutDay([...timed, ...timedEvents], windowStart, windowEnd)

  /** Which minute a pointer at `clientY` is over, snapped to the grid. */
  function minuteAt(clientY) {
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect || rect.height === 0) return windowStart
    return ratioToMin((clientY - rect.top) / rect.height, windowStart, windowEnd, SNAP_MIN)
  }

  /* ------------------------------------------------------ create by drag -- */

  function onSurfacePointerDown(event) {
    if (event.button !== 0) return
    if (event.target !== event.currentTarget) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const at = minuteAt(event.clientY)
    setDraft({ from: at, to: at })
  }

  function onSurfacePointerMove(event) {
    if (!draft) return
    setDraft((current) => (current ? { ...current, to: minuteAt(event.clientY) } : null))
  }

  function onSurfacePointerUp(event) {
    if (!draft) return
    const to = minuteAt(event.clientY)
    const start = Math.min(draft.from, to)
    const span = Math.abs(to - draft.from)
    setDraft(null)
    /* A press with no travel is still a click, and still means "put a task
       here" at the default length — the behaviour this surface had before it
       could do ranges. Resolving it here rather than leaving an onClick in
       place is what stops the two firing for the same gesture. */
    if (span < SNAP_MIN) onCreate?.({ date: dateKey, startMin: minuteAt(event.clientY) })
    else onCreate?.({ date: dateKey, startMin: start, durationMin: span })
  }

  /* ----------------------------------------------------------- resizing -- */

  function onResizePointerDown(event, block, edge) {
    if (event.button !== 0) return
    // Keep the press off the block underneath, which would start a native drag.
    event.stopPropagation()
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setResizing({
      id: block.task.id,
      edge,
      startMin: block.task.startMin,
      endMin: block.task.startMin + block.task.durationMin,
    })
  }

  function onResizePointerMove(event) {
    if (!resizing) return
    const at = snapMin(minuteAt(event.clientY), SNAP_MIN)
    setResizing((current) => {
      if (!current) return null
      if (current.edge === 'bottom') {
        return { ...current, endMin: Math.max(at, current.startMin + MIN_DURATION_MIN) }
      }
      return { ...current, startMin: Math.min(at, current.endMin - MIN_DURATION_MIN) }
    })
  }

  async function onResizePointerUp() {
    if (!resizing) return
    const { id, startMin, endMin } = resizing
    setResizing(null)
    try {
      /* scheduleTask, not updateTask: it resolves an occurrence id and detaches
         that one day of a repeating task, so resizing this Tuesday's standup
         does not reshape every Tuesday. */
      await scheduleTask(id, {
        date: dateKey,
        startMin,
        durationMin: Math.max(MIN_DURATION_MIN, endMin - startMin),
      })
    } catch (caught) {
      console.error('Could not resize task.', caught)
    }
  }

  /* ------------------------------------------------------------- moving -- */

  function onDragStart(event, block) {
    const rect = event.currentTarget.getBoundingClientRect()
    /* Remember where inside the block the grab happened, so the block lands
       under the cursor rather than snapping its top edge to the pointer. */
    const grabRatio = rect.height === 0 ? 0 : (event.clientY - rect.top) / rect.height
    const grabOffsetMin = Math.round(grabRatio * block.task.durationMin)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(DRAG_TASK, JSON.stringify({ id: block.task.id, grabOffsetMin }))
  }

  function onDragOver(event) {
    if (!hasDrag(event, DRAG_TASK)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setHoverMin(minuteAt(event.clientY))
  }

  async function onDrop(event) {
    if (!hasDrag(event, DRAG_TASK)) return
    event.preventDefault()
    setHoverMin(null)
    const payload = readDrag(event, DRAG_TASK)
    if (!payload?.id) return
    const startMin = snapMin(minuteAt(event.clientY) - (payload.grabOffsetMin ?? 0), SNAP_MIN)
    try {
      await scheduleTask(payload.id, { date: dateKey, startMin })
    } catch (caught) {
      console.error('Could not move task.', caught)
    }
  }

  const draftTop = draft ? Math.min(draft.from, draft.to) : 0
  const draftSpan = draft ? Math.abs(draft.to - draft.from) : 0

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

      {/* The click/drop surface sits under the blocks so a press on empty space
          creates a task while a press on a block edits it. */}
      <div
        ref={surfaceRef}
        className="day-column__surface"
        onPointerDown={onSurfacePointerDown}
        onPointerMove={onSurfacePointerMove}
        onPointerUp={onSurfacePointerUp}
        // A cancelled pointer (a system gesture, a lost capture) must clear the
        // draft too, or the ghost rectangle sticks to the grid forever.
        onPointerCancel={() => setDraft(null)}
        role="presentation"
      />

      {draft && draftSpan >= SNAP_MIN && (
        <div
          className="day-column__draft"
          style={{
            top: `${minToPercent(draftTop, windowStart, windowEnd)}%`,
            height: `${(draftSpan / (windowEnd - windowStart)) * 100}%`,
          }}
          aria-hidden="true"
        >
          <span>{durationLabel(draftSpan)}</span>
        </div>
      )}

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
        const item = block.task
        const isEvent = item.startDate !== undefined
        const tag = getTag(item.tagId)
        const live = resizing?.id === item.id ? resizing : null
        // While dragging an edge the block follows the pointer directly, so the
        // gesture reads as continuous instead of snapping only once on release.
        const top = live
          ? minToPercent(live.startMin, windowStart, windowEnd)
          : block.top
        const height = live
          ? ((live.endMin - live.startMin) / (windowEnd - windowStart)) * 100
          : block.height
        const durationMinutes = live ? live.endMin - live.startMin : item.durationMin
        // Below 45 min there isn't room for a title line plus a time line at
        // the app's own type sizes — the title alone gets the block's full
        // height instead of both lines fighting over ~18px. The hover title
        // attribute below still carries the time, so nothing is lost.
        const isCompact = durationMinutes < 45

        return (
          <div key={item.id} className="block-slot">
            <button
              type="button"
              draggable={!isEvent && !live}
              onDragStart={(event) => !isEvent && onDragStart(event, block)}
              onClick={() => (isEvent ? onEditEvent?.(item) : onEdit?.(item))}
              className={[
                'block',
                isEvent ? 'block--event' : '',
                item.done ? 'block--done' : '',
                block.columns > 1 ? 'block--split' : '',
                live ? 'block--resizing' : '',
                isCompact ? 'block--compact' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{
                top: `${top}%`,
                // 2px of surface between touching blocks, and between a block and
                // the column edge — the gap separates them, never a stroke.
                height: `calc(${height}% - 2px)`,
                left: `calc(${block.left}% + 1px)`,
                width: `calc(${block.width}% - 2px)`,
                '--tag': tag?.color ?? 'var(--color-baseline)',
              }}
              title={[
                item.title,
                minToLabel(live ? live.startMin : item.startMin),
                durationLabel(live ? live.endMin - live.startMin : item.durationMin),
                isEvent ? 'Event' : null,
                item.recurrence && recurrenceLabel(item.recurrence),
              ]
                .filter(Boolean)
                .join(' · ')}
            >
              <span className="block__title">{item.title}</span>
              <span className="block__time">
                {minToLabel(live ? live.startMin : item.startMin)} ·{' '}
                {durationLabel(live ? live.endMin - live.startMin : item.durationMin)}
                {item.recurrence && (
                  <>
                    {' · '}
                    <RepeatIcon className="block__repeat" />
                    <span className="visually-hidden">{recurrenceLabel(item.recurrence)}</span>
                  </>
                )}
              </span>
            </button>

            {/* Siblings, not children — see the note at the top of this file.
                Events are not resized here: their length is a span between two
                wall-clock points, edited in their own form. */}
            {!isEvent &&
              ['top', 'bottom'].map((edge) => (
                <div
                  key={edge}
                  className={`block__handle block__handle--${edge}`}
                  style={{
                    top:
                      edge === 'top'
                        ? `calc(${top}% - 3px)`
                        : `calc(${top}% + ${height}% - 5px)`,
                    left: `calc(${block.left}% + 1px)`,
                    width: `calc(${block.width}% - 2px)`,
                  }}
                  onPointerDown={(event) => onResizePointerDown(event, block, edge)}
                  onPointerMove={onResizePointerMove}
                  onPointerUp={onResizePointerUp}
                  onPointerCancel={() => setResizing(null)}
                  role="presentation"
                />
              ))}
          </div>
        )
      })}
    </div>
  )
}
