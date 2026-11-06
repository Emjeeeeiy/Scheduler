import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { NodeViewWrapper } from '@tiptap/react'
import { closeHistory } from '@tiptap/pm/history'
import {
  INK_WIDTH,
  MARKER_OPACITY,
  PEN_SIZES,
  buildStroke,
  clampHeight,
  livePath,
  normalizeStrokes,
  strokeHit,
  strokePath,
} from '../../lib/ink.js'
import { PEN_COLORS } from '../../lib/journalColors.js'
import { usePersistentState } from '../../lib/usePersistentState.js'
import { TrashIcon } from '../icons.jsx'
import { EraserIcon, HighlighterIcon, PenIcon, UndoIcon } from './journalIcons.jsx'

/* The drawing box's node view: the canvas, and the tools that appear around it
 * while it is selected.
 *
 * Drawing uses Pointer Events — the system's rule for a gesture that only
 * manipulates something in place (see DESIGN.md, Grid Gestures) — with the
 * pointer captured so a stroke continues when the finger or pen leaves the box.
 * ProseMirror ignores pointer events and keystrokes that land on this view (the
 * stopEvent default for a node view), so the editor cannot hijack a stroke, but
 * still sees `mousedown`, which is how a click selects the drawing.
 *
 * Nothing here edits the document until a gesture ends. A stroke is one
 * transaction on pointer-up, closed off from the previous history group, so
 * Ctrl+Z takes back one stroke at a time and Ctrl+Z through a long drawing never
 * skips over several.
 */

const TOOLS = [
  { id: 'pen', label: 'Pen', icon: PenIcon },
  { id: 'marker', label: 'Highlighter', icon: HighlighterIcon },
  { id: 'eraser', label: 'Eraser (whole strokes)', icon: EraserIcon },
]

const MIN_STEP = 0.3 // pointer points closer than this (logical units) add nothing

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi)

/** Keeps a stroke going when the pointer leaves the box. Best-effort: capture
    throws if the pointer is already gone (a very quick tap), and a stroke that
    cannot be captured should still be drawn rather than abandoned. */
function capture(element, pointerId) {
  try {
    element.setPointerCapture(pointerId)
  } catch {
    /* the stroke simply ends where the pointer leaves the box */
  }
}

const reviveTool = (stored) => ({
  tool: TOOLS.some((t) => t.id === stored?.tool) ? stored.tool : 'pen',
  color: typeof stored?.color === 'string' && /^#[0-9a-f]{6}$/i.test(stored.color) ? stored.color.toLowerCase() : null,
  size: PEN_SIZES.some((s) => s.id === stored?.size) ? stored.size : 'm',
})

/** Redrawn only when the strokes themselves change, not on every frame of the
    stroke being drawn. */
const StrokePaths = memo(function StrokePaths({ strokes, hidden }) {
  return strokes.map((stroke, i) => {
    const d = strokePath(stroke)
    if (!d || hidden?.has(i)) return null
    return (
      <path
        key={i}
        d={d}
        fill={stroke.c ?? 'currentColor'}
        fillOpacity={stroke.t === 'm' ? MARKER_OPACITY : undefined}
      />
    )
  })
})

export function DrawingBlock({ node, editor, getPos, selected, updateAttributes, deleteNode }) {
  const strokes = normalizeStrokes(node.attrs.strokes)
  const height = clampHeight(node.attrs.height)
  const editable = editor.isEditable

  const [pen, setPen] = usePersistentState('cadence-journal:pen', reviveTool(null), reviveTool)
  /* A just-inserted drawing is already selected on its very first render, so the
     starting mode has to be worked out here too — reacting only to `selected`
     changing (below) would leave a new drawing waiting for a tool to be picked. */
  const [mode, setMode] = useState(() => (selected && editable && strokes.length === 0 ? 'draw' : 'view')) // 'view' | 'draw'
  const [wasSelected, setWasSelected] = useState(selected)
  const [live, setLive] = useState(null) // the path of the stroke being drawn
  const [erased, setErased] = useState(null) // indices rubbed out in the current gesture
  const [liveHeight, setLiveHeight] = useState(null)
  const [confirm, setConfirm] = useState(null) // 'clear' | 'remove' | null

  /* Selecting an empty drawing puts it straight into drawing mode (that is what
     "Insert → Drawing" is for); selecting a finished one does not, so a click
     on it never leaves a stray mark. Deselecting always ends drawing. Adjusted
     during render, from the change in `selected`, rather than in an effect. */
  if (wasSelected !== selected) {
    setWasSelected(selected)
    setMode(selected && strokes.length === 0 ? 'draw' : 'view')
    if (!selected) setConfirm(null)
  }

  const drawing = selected && mode === 'draw' && editable
  const shownHeight = liveHeight ?? height
  const size = PEN_SIZES.find((s) => s.id === pen.size) ?? PEN_SIZES[1]

  const svgRef = useRef(null)
  const canvasRef = useRef(null)
  const gesture = useRef(null)
  const frame = useRef(0)
  const penSeen = useRef(false)

  /** One transaction, in its own undo step. `change` is a patch, or — the form
      every stroke uses — a function of the node's attributes AT THE MOMENT OF THE
      TRANSACTION. Never built from the strokes this render happened to see: a
      re-render can lag a fast pen by a task or two, and a stroke merged into a
      stale list silently replaces the one before it. */
  const commit = useCallback(
    (change) => {
      const pos = getPos()
      if (typeof pos !== 'number') return
      editor
        .chain()
        .command(({ tr }) => {
          const current = tr.doc.nodeAt(pos)
          if (!current || current.type.name !== 'drawing') return false
          closeHistory(tr)
          const patch = typeof change === 'function' ? change(current.attrs) : change
          tr.setNodeMarkup(pos, undefined, { ...current.attrs, ...patch })
          return true
        })
        .run()
    },
    [editor, getPos],
  )

  useEffect(() => {
    if (drawing) canvasRef.current?.focus({ preventScroll: true })
  }, [drawing])

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  /* --------------------------------------------------------------- pointer -- */

  function localPoint(event) {
    const g = gesture.current
    return {
      x: clamp((event.clientX - g.rect.left) * g.scale, 0, INK_WIDTH),
      y: clamp((event.clientY - g.rect.top) * g.scale, 0, g.height),
      p: g.pen && event.pressure > 0 ? event.pressure : undefined,
    }
  }

  function paint() {
    frame.current = 0
    const g = gesture.current
    if (!g) return
    if (g.kind === 'stroke') {
      setLive(livePath(g.points, { t: pen.tool === 'marker' ? 'm' : 'p', s: size.size }, g.pen))
    } else if (g.kind === 'erase') {
      setErased(new Set(g.removed))
    }
  }

  const schedulePaint = () => {
    if (!frame.current) frame.current = requestAnimationFrame(paint)
  }

  function addPoint(event) {
    const g = gesture.current
    const point = localPoint(event)
    if (g.kind === 'erase') {
      /* Everything the eraser PASSED THROUGH, not just where it was sampled.
         Pointer events arrive at the device's rate; a quick swipe can jump
         further than a stroke is wide between two of them, and testing only the
         samples would skip straight over it. So the path between samples is
         walked in steps smaller than the eraser. */
      const from = g.lastErase ?? point
      const steps = Math.max(1, Math.ceil(Math.hypot(point.x - from.x, point.y - from.y) / (size.eraser * 0.5)))
      for (let step = 1; step <= steps; step++) {
        const x = from.x + ((point.x - from.x) * step) / steps
        const y = from.y + ((point.y - from.y) * step) / steps
        g.strokes.forEach((stroke, i) => {
          if (!g.removed.has(i) && strokeHit(stroke, x, y, size.eraser)) g.removed.add(i)
        })
      }
      g.lastErase = point
      return
    }
    const last = g.points[g.points.length - 1]
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < MIN_STEP) return
    g.points.push(point)
  }

  function onPointerDown(event) {
    if (!drawing) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    // With a pen in use, a resting palm arrives as touch: ignore it.
    if (event.pointerType === 'pen') penSeen.current = true
    else if (event.pointerType === 'touch' && penSeen.current) return
    if (gesture.current) return
    // Taking over the press also stops the browser's follow-up mousedown, which
    // is what would otherwise reach the editor and move the selection.
    event.preventDefault()
    // preventDefault also stops the press from focusing anything, so focus is
    // taken explicitly: keystrokes while drawing (Backspace, Ctrl+Z, Escape) must
    // reach the canvas, not the editor, where Backspace would delete the box.
    canvasRef.current?.focus({ preventScroll: true })
    const svg = svgRef.current
    capture(svg, event.pointerId)
    const rect = svg.getBoundingClientRect()
    gesture.current = {
      kind: pen.tool === 'eraser' ? 'erase' : 'stroke',
      pointerId: event.pointerId,
      pen: event.pointerType === 'pen',
      rect,
      scale: INK_WIDTH / rect.width,
      height: shownHeight,
      points: [],
      removed: new Set(),
      // What this gesture is erasing is decided against the strokes it started on.
      strokes,
    }
    addPoint(event)
    schedulePaint()
  }

  function onPointerMove(event) {
    const g = gesture.current
    if (!g || g.pointerId !== event.pointerId) return
    // Every sample the device took since the last event, not just the latest:
    // a fast stroke would otherwise come out as straight segments.
    const samples = event.nativeEvent.getCoalescedEvents?.()
    for (const sample of samples?.length ? samples : [event.nativeEvent]) addPoint(sample)
    schedulePaint()
  }

  function endGesture(event) {
    const g = gesture.current
    if (!g || g.pointerId !== event.pointerId) return
    gesture.current = null
    cancelAnimationFrame(frame.current)
    frame.current = 0
    setLive(null)
    setErased(null)
    if (event.type === 'pointercancel') return
    if (g.kind === 'stroke' && g.points.length > 0) {
      const stroke = buildStroke({
        tool: pen.tool,
        color: pen.color,
        size: size.size,
        points: g.points,
        pressure: g.pen && g.points.some((p) => p.p !== undefined),
      })
      commit((attrs) => ({ strokes: [...normalizeStrokes(attrs.strokes), stroke] }))
    } else if (g.kind === 'erase' && g.removed.size > 0) {
      const gone = new Set([...g.removed].map((i) => g.strokes[i].d))
      commit((attrs) => ({ strokes: normalizeStrokes(attrs.strokes).filter((s) => !gone.has(s.d)) }))
    }
  }

  /* ------------------------------------------------------------- keyboard -- */

  function leaveDrawing() {
    setMode('view')
    editor.view.focus()
  }

  function removeLastStroke() {
    commit((attrs) => ({ strokes: normalizeStrokes(attrs.strokes).slice(0, -1) }))
  }

  function onCanvasKeyDown(event) {
    const modifier = event.ctrlKey || event.metaKey
    if (event.key === 'Escape') {
      event.preventDefault()
      leaveDrawing()
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      // The whole drawing is not deleted by a stray key while drawing on it.
      event.preventDefault()
      removeLastStroke()
    } else if (modifier && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) editor.commands.redo()
      else editor.commands.undo()
    } else if (modifier && event.key.toLowerCase() === 'y') {
      event.preventDefault()
      editor.commands.redo()
    }
  }

  /* --------------------------------------------------------------- resizing -- */

  function onResizeDown(event) {
    if (!editable) return
    event.preventDefault()
    capture(event.currentTarget, event.pointerId)
    const rect = svgRef.current.getBoundingClientRect()
    gesture.current = {
      kind: 'resize',
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: height,
      scale: INK_WIDTH / rect.width,
    }
  }

  function onResizeMove(event) {
    const g = gesture.current
    if (!g || g.kind !== 'resize' || g.pointerId !== event.pointerId) return
    setLiveHeight(clampHeight(g.startHeight + (event.clientY - g.startY) * g.scale))
  }

  function onResizeUp(event) {
    const g = gesture.current
    if (!g || g.kind !== 'resize' || g.pointerId !== event.pointerId) return
    gesture.current = null
    const next = clampHeight(g.startHeight + (event.clientY - g.startY) * g.scale)
    setLiveHeight(null)
    if (event.type !== 'pointercancel' && next !== height) commit({ height: next })
  }

  function onResizeKey(event) {
    const step = event.key === 'ArrowDown' ? 40 : event.key === 'ArrowUp' ? -40 : 0
    if (!step || !editable) return
    event.preventDefault()
    commit({ height: clampHeight(height + step) })
  }

  /* ----------------------------------------------------------------- render -- */

  const inkColor = pen.color ?? 'currentColor'
  const livePaint = pen.tool === 'marker' ? { fillOpacity: MARKER_OPACITY } : {}

  return (
    <NodeViewWrapper className={`drawing${selected ? ' drawing--selected' : ''}`} data-drawing="true">
      {selected && editable ? (
        <div className="drawing__tools" role="toolbar" aria-label="Drawing tools">
          <div className="drawing__group" role="group" aria-label="Tool">
            {TOOLS.map((tool) => {
              const Glyph = tool.icon
              const on = drawing && pen.tool === tool.id
              return (
                <button
                  key={tool.id}
                  type="button"
                  className={`tb-btn${on ? ' tb-btn--on' : ''}`}
                  aria-label={tool.label}
                  title={tool.label}
                  aria-pressed={on}
                  onClick={() => {
                    setPen((current) => ({ ...current, tool: tool.id }))
                    setMode('draw')
                  }}
                >
                  <Glyph className="tb-icon" />
                </button>
              )
            })}
          </div>

          {pen.tool !== 'eraser' ? (
            <div className="drawing__group" role="group" aria-label="Ink color">
              <button
                type="button"
                className={`swatch swatch--auto${pen.color === null ? ' swatch--on' : ''}`}
                aria-label="Automatic (matches the paper’s ink)"
                title="Automatic — follows the paper"
                aria-pressed={pen.color === null}
                onClick={() => setPen((current) => ({ ...current, color: null }))}
              />
              {PEN_COLORS.map((swatch) => (
                <button
                  key={swatch.value}
                  type="button"
                  className={`swatch${pen.color === swatch.value ? ' swatch--on' : ''}`}
                  style={{ '--swatch': swatch.value }}
                  aria-label={swatch.name}
                  title={swatch.name}
                  aria-pressed={pen.color === swatch.value}
                  onClick={() => setPen((current) => ({ ...current, color: swatch.value }))}
                />
              ))}
              <input
                type="color"
                className="drawing__custom"
                aria-label="Custom ink color"
                title="Custom color"
                value={pen.color ?? '#000000'}
                onChange={(event) => {
                  const color = event.target.value.toLowerCase()
                  setPen((current) => ({ ...current, color }))
                }}
              />
            </div>
          ) : null}

          <div className="drawing__group" role="group" aria-label="Size">
            {PEN_SIZES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`tb-btn${pen.size === s.id ? ' tb-btn--on' : ''}`}
                aria-label={`${s.label} ${pen.tool === 'eraser' ? 'eraser' : 'line'}`}
                title={s.label}
                aria-pressed={pen.size === s.id}
                onClick={() => setPen((current) => ({ ...current, size: s.id }))}
              >
                <span className="drawing__dot" style={{ '--d': `${4 + i * 4}px` }} />
              </button>
            ))}
          </div>

          <div className="drawing__group">
            <button
              type="button"
              className="tb-btn"
              aria-label="Undo last stroke"
              title="Undo last stroke"
              disabled={strokes.length === 0}
              onClick={removeLastStroke}
            >
              <UndoIcon className="tb-icon" />
            </button>
            {confirm ? (
              <span className="drawing__confirm" role="group" aria-label="Confirm">
                <button
                  type="button"
                  className="danger-button danger-button--sm"
                  onClick={() => {
                    if (confirm === 'clear') commit({ strokes: [] })
                    else deleteNode()
                    setConfirm(null)
                  }}
                >
                  {confirm === 'clear' ? 'Clear all' : 'Remove drawing'}
                </button>
                <button type="button" className="ghost-button ghost-button--sm" onClick={() => setConfirm(null)}>
                  Cancel
                </button>
              </span>
            ) : (
              <>
                <button
                  type="button"
                  className="ghost-button ghost-button--sm"
                  disabled={strokes.length === 0}
                  onClick={() => setConfirm('clear')}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="tb-btn"
                  aria-label="Remove drawing"
                  title="Remove drawing"
                  onClick={() => (strokes.length ? setConfirm('remove') : deleteNode())}
                >
                  <TrashIcon className="tb-icon" />
                </button>
              </>
            )}
          </div>

          <div className="drawing__group drawing__group--end">
            {drawing ? (
              <button type="button" className="primary-button drawing__done" onClick={leaveDrawing}>
                Done
              </button>
            ) : (
              <span className="drawing__hint">Pick a tool to draw</span>
            )}
          </div>

          <label className="drawing__label">
            <span className="visually-hidden">Describe this drawing</span>
            <input
              className="input drawing__label-input"
              placeholder="Describe this drawing (for screen readers)"
              maxLength={300}
              defaultValue={node.attrs.label}
              onBlur={(event) => {
                if (event.target.value !== node.attrs.label) updateAttributes({ label: event.target.value })
              }}
            />
          </label>
        </div>
      ) : null}

      <div
        ref={canvasRef}
        className="drawing__canvas"
        data-draw={drawing ? 'true' : 'false'}
        data-tool={pen.tool}
        tabIndex={drawing ? 0 : -1}
        role="group"
        aria-label={drawing ? 'Drawing canvas — draw with a pointer; Escape to finish' : 'Drawing'}
        onKeyDown={onCanvasKeyDown}
      >
        <svg
          ref={svgRef}
          className="drawing__svg"
          viewBox={`0 0 ${INK_WIDTH} ${shownHeight}`}
          style={{ aspectRatio: `${INK_WIDTH} / ${shownHeight}` }}
          role="img"
          aria-label={node.attrs.label || (strokes.length ? 'Drawing' : 'Empty drawing')}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
        >
          <StrokePaths strokes={strokes} hidden={erased} />
          {live ? <path d={live} fill={inkColor} {...livePaint} /> : null}
        </svg>
        {selected && editable ? (
          <div
            className="drawing__resize"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Drawing height — drag, or use the up and down arrow keys"
            aria-valuemin={120}
            aria-valuemax={4000}
            aria-valuenow={shownHeight}
            tabIndex={0}
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
            onPointerCancel={onResizeUp}
            onKeyDown={onResizeKey}
          />
        ) : null}
      </div>
    </NodeViewWrapper>
  )
}
