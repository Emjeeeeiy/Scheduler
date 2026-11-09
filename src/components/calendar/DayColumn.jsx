import { useEffect, useMemo, useRef, useState } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { layoutDay, minToPercent, ratioToMin } from '@cadence/shared/layout.js'
import { DRAG_TASK, hasDrag, readDrag } from '../../lib/dnd.js'
import { useCoarsePointer } from '../../lib/useCoarsePointer.js'
import { durationLabel, formatDayLabel, minToLabel, snapMin } from '@cadence/shared/date.js'
import { recurrenceLabel } from '@cadence/shared/recurrence.js'
import { CloseIcon, RepeatIcon } from '../icons.jsx'
import { TagGlyph } from '../editors/TagGlyph.jsx'

const SNAP_MIN = 15
const MIN_DURATION_MIN = 15

/* Touch editing. A finger is also what scrolls the page, so a block under a
   thumb must never be editable until it has been asked to be: hold it, and it
   becomes "armed". Only then do its edge grips and its body respond to a drag.
   Every number here is a trade between "deliberate" and "fiddly".
     - LONG_PRESS_MS: long enough that a tap or a scroll never arms one, short
       enough that it does not feel like waiting.
     - CANCEL_PX: a press that travels further than this was a scroll.
     - MOVE_START_PX: below this an armed block's press is still a tap.
     - IDLE_DISARM_MS: an armed block nobody is touching goes back to rest, so
       it cannot sit there loaded for the next accidental touch. */
const LONG_PRESS_MS = 450
const CANCEL_PX = 10
const MOVE_START_PX = 4
const IDLE_DISARM_MS = 6000
/* The click a browser sends after a touch is released, which would otherwise
   open the editor right after a block was armed or dragged. */
const CLICK_GUARD_MS = 300

/**
 * One day as a time grid: hour rules, positioned blocks, drag-to-create, block
 * resizing, and drop-to-schedule. Both the Week view (seven of these) and the
 * Day view (one wide one) render it, so scheduling behaves identically in both
 * — a gesture added here is a gesture both views gain.
 *
 * Three gestures share this surface, and they are kept apart deliberately:
 *   - Moving a block, with a mouse, is HTML5 drag-and-drop, because it
 *     transfers a task between columns and views (the inbox and the month
 *     accept the same drop).
 *   - Creating by dragging a range, and resizing a block, are Pointer Events.
 *     Neither transfers anything.
 * The resize handles are rendered as siblings of the block rather than
 * children of it: the block carries `draggable`, and a native dragstart fires
 * on press-and-move regardless of pointer capture, so a handle nested inside
 * it would race the drag every time.
 *
 * On a touch screen none of that is offered at rest. A browser starts a native
 * drag on a long press and a handle under a scrolling thumb starts a resize, so
 * blocks were being moved and shortened by people who were only reading or
 * scrolling. There the block is not `draggable`, its handles are not drawn, and
 * editing is a two-step: hold a block to arm it, then drag its body to move it
 * or a grip to resize it. Each gesture is one write, and offers Undo.
 *
 * `peekOnTouch` is for a column too narrow to print a title (the phone Week): a
 * tap on a block there shows a small card with its title, time and an Edit button
 * instead of opening the whole editor, so there is a way to tell what a bar is.
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
  peekOnTouch = false,
}) {
  const { scheduleTask, toggleDone, getTag } = useSchedule()
  const { pushError, pushUndo } = useToast()
  const coarse = useCoarsePointer()
  const surfaceRef = useRef(null)
  const [hoverMin, setHoverMin] = useState(null)
  const [draft, setDraft] = useState(null)
  const [resizing, setResizing] = useState(null)
  /* A touch drag of an armed block's body, shaped like `resizing` so the render
     below treats both as "the block follows the finger". */
  const [moving, setMoving] = useState(null)
  const [armedId, setArmedIdState] = useState(null)
  // The block whose title card is open (see `peekOnTouch`).
  const [peekId, setPeekId] = useState(null)
  /* A ref mirror of `armedId`: the handlers below also need the answer *within*
     the event that changes it, before React has re-rendered. */
  const armedRef = useRef(null)
  const pressRef = useRef(null)
  const armTimerRef = useRef(null)
  const idleTimerRef = useRef(null)
  const suppressClickRef = useRef(false)
  const ignoreSurfaceRef = useRef(false)

  const timed = useMemo(() => tasks.filter((t) => Number.isFinite(t.startMin)), [tasks])
  /* A single-day timed event sits in the grid alongside tasks; an all-day or
     multi-day one is drawn as a bar by the view above, never sliced into
     per-day pieces here. Both kinds go through layoutDay together so an event
     and a task that overlap split the column instead of stacking. */
  const timedEvents = useMemo(
    () =>
      events.filter(
        (e) => Number.isFinite(e.startMin) && e.startDate === e.endDate && e.startDate === dateKey,
      ),
    [events, dateKey],
  )
  /* Memoized because `hoverMin`/`draft`/`resizing` change on every pointer
     tick while dragging, and this component re-renders on each — without
     this, dragging over a busy column re-ran the whole overlap-packing
     algorithm dozens of times a second for no reason: none of those state
     changes affect what layoutDay computes. */
  const blocks = useMemo(
    () => layoutDay([...timed, ...timedEvents], windowStart, windowEnd),
    [timed, timedEvents, windowStart, windowEnd],
  )

  /** Which minute a pointer at `clientY` is over, snapped to the grid. */
  function minuteAt(clientY) {
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect || rect.height === 0) return windowStart
    return ratioToMin((clientY - rect.top) / rect.height, windowStart, windowEnd, SNAP_MIN)
  }

  /** A way back from a gesture that was a slip. Resolves the restore's own
      failure into the same toast every other write here uses. */
  function offerUndo(message, restore) {
    pushUndo(message, async () => {
      try {
        await restore()
      } catch (caught) {
        console.error('Could not undo.', caught)
        pushError('Could not undo that. Try again.')
      }
    })
  }

  /* ------------------------------------------------------ arming (touch) -- */

  function setArmed(id) {
    armedRef.current = id
    // Nothing armed, nothing to put away later.
    if (id === null) clearTimeout(idleTimerRef.current)
    setArmedIdState(id)
  }

  function clearArmTimer() {
    clearTimeout(armTimerRef.current)
    armTimerRef.current = null
  }

  function restartIdle() {
    clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => setArmed(null), IDLE_DISARM_MS)
  }

  function releaseClickSoon() {
    setTimeout(() => {
      suppressClickRef.current = false
    }, CLICK_GUARD_MS)
  }

  function arm(id) {
    armTimerRef.current = null
    // The release of this very touch is about to send a click.
    suppressClickRef.current = true
    setArmed(id)
    restartIdle()
    if (typeof navigator !== 'undefined') navigator.vibrate?.(12)
  }

  /* Only one block is armed at a time, and any touch that is not on it (or its
     grips) puts it back — a tap on another block, on empty grid, on the header.
     A capture-phase listener on the document so a touch anywhere is caught, even
     in another column. It also marks the surface to ignore that same press, or
     the tap that disarmed a block would create a task under it. */
  useEffect(() => {
    if (armedId === null) return undefined
    function disarm() {
      armedRef.current = null
      clearTimeout(idleTimerRef.current)
      setArmedIdState(null)
    }
    function onPointerDown(event) {
      if (event.target instanceof Element && event.target.closest('.block--armed, .block__handle--armed')) {
        return
      }
      disarm()
      ignoreSurfaceRef.current = true
      setTimeout(() => {
        ignoreSurfaceRef.current = false
      }, 0)
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') disarm()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [armedId])

  useEffect(
    () => () => {
      clearTimeout(armTimerRef.current)
      clearTimeout(idleTimerRef.current)
    },
    [],
  )

  function onBlockPointerDown(event, block) {
    if (event.pointerType !== 'touch') return
    const item = block.task
    // An event's length is edited in its own form, so there is nothing to arm.
    if (item.startDate !== undefined) return
    if (armedRef.current === item.id) {
      restartIdle()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      pressRef.current = {
        id: item.id,
        mode: 'move',
        startY: event.clientY,
        origStart: item.startMin,
        duration: item.durationMin,
        latest: item.startMin,
        moved: false,
      }
      return
    }
    clearArmTimer()
    pressRef.current = { id: item.id, mode: 'press', x: event.clientX, y: event.clientY }
    armTimerRef.current = setTimeout(() => arm(item.id), LONG_PRESS_MS)
  }

  function onBlockPointerMove(event, block) {
    const press = pressRef.current
    if (event.pointerType !== 'touch' || !press || press.id !== block.task.id) return
    if (press.mode === 'press') {
      // Travelled before the timer fired: this was a scroll, not a hold.
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > CANCEL_PX) {
        clearArmTimer()
        pressRef.current = null
      }
      return
    }
    if (press.mode !== 'move') return
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect || rect.height === 0) return
    const deltaY = event.clientY - press.startY
    if (!press.moved && Math.abs(deltaY) < MOVE_START_PX) return
    press.moved = true
    const raw = press.origStart + deltaY * ((windowEnd - windowStart) / rect.height)
    const startMin = Math.max(windowStart, Math.min(snapMin(raw, SNAP_MIN), windowEnd - press.duration))
    press.latest = startMin
    restartIdle()
    setMoving((current) =>
      current && current.id === press.id && current.startMin === startMin
        ? current
        : { id: press.id, startMin, endMin: startMin + press.duration },
    )
  }

  async function onBlockPointerUp(event, block) {
    if (event.pointerType !== 'touch') return
    const press = pressRef.current
    clearArmTimer()
    pressRef.current = null
    if (suppressClickRef.current) releaseClickSoon()
    if (!press || press.mode !== 'move' || press.id !== block.task.id) return
    setMoving(null)
    // No travel: a tap on an armed block, and the click that follows opens it.
    if (!press.moved) return
    suppressClickRef.current = true
    releaseClickSoon()
    if (press.latest === press.origStart) return
    const item = block.task
    try {
      await scheduleTask(item.id, { date: dateKey, startMin: press.latest })
      if (!item.recurrence) {
        offerUndo(`Moved “${item.title}” to ${minToLabel(press.latest)}.`, () =>
          scheduleTask(item.id, { date: dateKey, startMin: press.origStart }),
        )
      }
    } catch (caught) {
      console.error('Could not move task.', caught)
      pushError('Could not move the task. Try again.')
    }
  }

  function onBlockPointerCancel(event) {
    if (event.pointerType !== 'touch') return
    clearArmTimer()
    if (pressRef.current?.mode === 'move') setMoving(null)
    pressRef.current = null
    if (suppressClickRef.current) releaseClickSoon()
  }

  function onBlockClick(item, isEvent) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    // A tap on a block whose title the column is too narrow to show says what it
    // is first. A block that is armed already has the finger's full attention, so
    // it goes straight to its editor.
    if (peekOnTouch && coarse && armedRef.current !== item.id) {
      setPeekId(item.id)
      return
    }
    if (isEvent) {
      onEditEvent?.(item)
      return
    }
    setArmed(null)
    onEdit?.(item)
  }

  /* The title card goes away on a tap anywhere else, or Escape. The press that
     dismisses it is not also a request for a task on the empty grid under it. */
  useEffect(() => {
    if (peekId === null) return undefined
    function onPointerDown(event) {
      if (event.target instanceof Element && event.target.closest('.block-peek')) return
      setPeekId(null)
      ignoreSurfaceRef.current = true
      setTimeout(() => {
        ignoreSurfaceRef.current = false
      }, 0)
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setPeekId(null)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [peekId])

  /* ------------------------------------------------------ create by drag -- */

  function onSurfacePointerDown(event) {
    if (event.button !== 0) return
    if (event.target !== event.currentTarget) return
    // The press that put an armed block away is not also a request for a task.
    if (ignoreSurfaceRef.current) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const at = minuteAt(event.clientY)
    setDraft({ from: at, to: at })
  }

  function onSurfacePointerMove(event) {
    if (!draft) return
    const at = minuteAt(event.clientY)
    // Returning the same object when nothing moved is a real bail-out, not
    // just tidiness — raw pointermove fires far more often than the 15-minute
    // grid changes, and a *new* object with an unchanged `to` would still
    // force a re-render on every one of those events.
    setDraft((current) => (current && current.to !== at ? { ...current, to: at } : current))
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
    // A finger resizes only a block it has armed; an idle handle is not there.
    if (event.pointerType === 'touch' && armedRef.current !== block.task.id) return
    // Keep the press off the block underneath, which would start a native drag.
    event.stopPropagation()
    event.preventDefault()
    if (armedRef.current !== null) restartIdle()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    const startMin = block.task.startMin
    const endMin = block.task.startMin + block.task.durationMin
    setResizing({
      id: block.task.id,
      edge,
      startMin,
      endMin,
      origStart: startMin,
      origEnd: endMin,
      title: block.task.title,
      recurring: Boolean(block.task.recurrence),
    })
  }

  function onResizePointerMove(event) {
    if (!resizing) return
    const at = snapMin(minuteAt(event.clientY), SNAP_MIN)
    if (armedRef.current !== null) restartIdle()
    setResizing((current) => {
      if (!current) return null
      if (current.edge === 'bottom') {
        const endMin = Math.max(at, current.startMin + MIN_DURATION_MIN)
        return endMin === current.endMin ? current : { ...current, endMin }
      }
      const startMin = Math.min(at, current.endMin - MIN_DURATION_MIN)
      return startMin === current.startMin ? current : { ...current, startMin }
    })
  }

  async function onResizePointerUp() {
    if (!resizing) return
    const { id, startMin, endMin, origStart, origEnd, title, recurring } = resizing
    setResizing(null)
    // Grabbed and let go where it was: nothing to write, and nothing to undo.
    if (startMin === origStart && endMin === origEnd) return
    try {
      /* scheduleTask, not updateTask: it resolves an occurrence id and detaches
         that one day of a repeating task, so resizing this Tuesday's standup
         does not reshape every Tuesday. */
      await scheduleTask(id, {
        date: dateKey,
        startMin,
        durationMin: Math.max(MIN_DURATION_MIN, endMin - startMin),
      })
      if (!recurring) {
        offerUndo(`Resized “${title}” to ${durationLabel(endMin - startMin)}.`, () =>
          scheduleTask(id, { date: dateKey, startMin: origStart, durationMin: origEnd - origStart }),
        )
      }
    } catch (caught) {
      console.error('Could not resize task.', caught)
      pushError('Could not resize the task. Try again.')
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
    /* `from` is where it came from, carried so the drop — wherever it lands —
       can offer to put it back. Every other reader of this payload only looks at
       `id` and `grabOffsetMin`, and ignores the rest. */
    event.dataTransfer.setData(
      DRAG_TASK,
      JSON.stringify({
        id: block.task.id,
        grabOffsetMin,
        title: block.task.title,
        recurring: Boolean(block.task.recurrence),
        from: { date: dateKey, startMin: block.task.startMin },
      }),
    )
  }

  function onDragOver(event) {
    if (!hasDrag(event, DRAG_TASK)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const at = minuteAt(event.clientY)
    setHoverMin((current) => (current === at ? current : at))
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
      const from = payload.from
      if (from && !payload.recurring && (from.date !== dateKey || from.startMin !== startMin)) {
        offerUndo(`Moved “${payload.title}” to ${minToLabel(startMin)}.`, () =>
          scheduleTask(payload.id, { date: from.date, startMin: from.startMin }),
        )
      }
    } catch (caught) {
      console.error('Could not move task.', caught)
      pushError('Could not move the task. Try again.')
    }
  }

  const draftTop = draft ? Math.min(draft.from, draft.to) : 0
  const draftSpan = draft ? Math.abs(draft.to - draft.from) : 0

  const peeked = peekId === null ? null : blocks.find((block) => block.task.id === peekId)?.task ?? null
  const peekTag = peeked ? getTag(peeked.tagId) : null
  const peekIsEvent = peeked ? peeked.startDate !== undefined : false

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
        const live =
          resizing?.id === item.id ? resizing : moving?.id === item.id ? moving : null
        const armed = armedId === item.id
        // While dragging an edge — or, armed, the whole block — it follows the
        // pointer directly, so the gesture reads as continuous instead of
        // snapping only once on release.
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
              draggable={!isEvent && !live && !coarse}
              onDragStart={(event) => !isEvent && onDragStart(event, block)}
              onClick={() => onBlockClick(item, isEvent)}
              onPointerDown={(event) => onBlockPointerDown(event, block)}
              onPointerMove={(event) => onBlockPointerMove(event, block)}
              onPointerUp={(event) => onBlockPointerUp(event, block)}
              onPointerCancel={onBlockPointerCancel}
              // A long press on Android opens the browser's menu, which would
              // sit on top of the block being armed.
              onContextMenu={(event) => {
                if (coarse || armed) event.preventDefault()
              }}
              className={[
                'block',
                isEvent ? 'block--event' : '',
                item.done ? 'block--done' : '',
                block.columns > 1 ? 'block--split' : '',
                live ? 'block--resizing' : '',
                armed ? 'block--armed' : '',
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
              <span className="block__title">
                {tag?.icon && <TagGlyph tag={tag} variant="chip" className="block__tag-icon" />}
                {item.title}
              </span>
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
                  className={`block__handle block__handle--${edge}${
                    armed ? ' block__handle--armed' : ''
                  }`}
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

      {peeked && (
        <div className="block-peek" role="group" aria-label={`${peeked.title}, details`}>
          <div className="block-peek__head">
            <p className="block-peek__title">{peeked.title}</p>
            <button
              type="button"
              className="icon-button icon-button--sm"
              aria-label="Close"
              onClick={() => setPeekId(null)}
            >
              <CloseIcon />
            </button>
          </div>
          <p className="block-peek__meta">
            {[
              formatDayLabel(dateKey),
              `${minToLabel(peeked.startMin)} · ${durationLabel(peeked.durationMin)}`,
              peekTag?.name,
              peekIsEvent ? 'Event' : null,
              peeked.recurrence ? recurrenceLabel(peeked.recurrence) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <div className="block-peek__actions">
            <button
              type="button"
              className="primary-button primary-button--sm"
              onClick={() => {
                setPeekId(null)
                if (peekIsEvent) onEditEvent?.(peeked)
                else onEdit?.(peeked)
              }}
            >
              Edit
            </button>
            {!peekIsEvent && (
              <button
                type="button"
                className="ghost-button ghost-button--sm"
                onClick={() => {
                  setPeekId(null)
                  toggleDone?.(peeked.id)
                }}
              >
                {peeked.done ? 'Mark not done' : 'Mark done'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
