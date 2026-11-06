/* Drawing boxes, mounted for real: the node, its tool strip, and what a stroke
 * does to the document. jsdom has no layout, so the canvas is given a fixed
 * 1000×320 box; the strokes themselves are fed in as real pointer events through
 * the component's own handlers. The browser-level behaviour (focus, scrolling,
 * a real mouse) is covered by driving the page in a headless browser.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultPaper, normalizeNote, normalizeNoteBody } from '@cadence/shared/journal.js'
import { decodePoints } from '../src/lib/ink.js'
import { NoteSurface } from '../src/components/journal/NoteSurface.jsx'
import { ThemeProvider } from '../src/state/ThemeContext.jsx'
import { installPointerEvents, installProseMirrorDom } from './helpers/prosemirrorDom.js'

beforeAll(() => {
  installProseMirrorDom()
  installPointerEvents()
})
beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

const BOX = { left: 0, top: 0, width: 1000, height: 320, right: 1000, bottom: 320, x: 0, y: 0 }
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

function mount(doc = { type: 'doc', content: [para('before')] }, actions) {
  const acts = actions ?? { saveNote: vi.fn(() => Promise.resolve()), updateNoteMeta: vi.fn(() => Promise.resolve()) }
  const view = render(
    <ThemeProvider>
      <NoteSurface
        note={normalizeNote('n1', { title: 'T', createdAt: 1, updatedAt: 1 })}
        bodyState={{
          loading: false,
          exists: true,
          body: normalizeNoteBody({ json: JSON.stringify(doc), schemaVersion: 1 }),
          hasPendingWrites: false,
          fromCache: false,
          error: null,
        }}
        actions={acts}
        defaultPaper={defaultPaper()}
        onBack={vi.fn()}
        onPin={vi.fn()}
        onTrash={vi.fn()}
        onUseForNew={vi.fn()}
      />
    </ThemeProvider>,
  )
  return { ...view, actions: acts }
}

async function editorOf(container) {
  await waitFor(() => expect(container.querySelector('.ProseMirror')).toBeTruthy())
  return container.querySelector('.ProseMirror').editor
}

const drawings = (editor) => editor.getJSON().content.filter((n) => n.type === 'drawing')
const strokesOf = (editor) => drawings(editor)[0]?.attrs.strokes ?? []

/** Inserts a drawing (or opens a stored one) and waits for its canvas. */
async function withDrawing(options = {}) {
  const ctx = mount(options.doc, options.actions)
  const editor = await editorOf(ctx.container)
  if (!options.doc) {
    await act(async () => {
      editor.commands.insertDrawing()
    })
  }
  const svg = await waitFor(() => {
    const el = ctx.container.querySelector('.drawing__svg')
    expect(el).toBeTruthy()
    return el
  })
  svg.getBoundingClientRect = () => BOX
  return { ...ctx, editor, svg }
}

/** One stroke through the real handlers: down, moves, up. Async, because
    TipTap defers a node view's re-render to a microtask; a real pen leaves a
    whole task between strokes, and so does this. */
let nextPointer = 1
async function stroke(svg, points, pointer = {}) {
  const init = { pointerId: nextPointer++, pointerType: 'mouse', button: 0, ...pointer }
  const at = ([x, y]) => ({ clientX: x, clientY: y, ...init })
  await act(async () => {
    fireEvent.pointerDown(svg, at(points[0]))
  })
  for (const point of points.slice(1)) {
    await act(async () => {
      fireEvent.pointerMove(svg, at(point))
    })
  }
  await act(async () => {
    fireEvent.pointerUp(svg, at(points[points.length - 1]))
  })
}

const click = (element) =>
  act(async () => {
    element.click()
  })
const button = (name) => screen.getByRole('button', { name })

const line = (y, from = 100, to = 600, step = 25) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => [from + i * step, y])

describe('inserting a drawing', () => {
  it('adds a selected, empty drawing that is ready to draw on', async () => {
    const { container, editor } = await withDrawing()
    expect(drawings(editor)).toHaveLength(1)
    expect(strokesOf(editor)).toEqual([])
    expect(editor.state.selection.constructor.name).toBe('NodeSelection')
    expect(container.querySelector('.drawing__canvas').dataset.draw).toBe('true')
    expect(screen.getByRole('toolbar', { name: 'Drawing tools' })).toBeTruthy()
  })

  it('replaces an empty line instead of stranding it above the drawing', async () => {
    const ctx = mount({ type: 'doc', content: [para('first'), { type: 'paragraph' }] })
    const editor = await editorOf(ctx.container)
    await act(async () => {
      editor.commands.setTextSelection(editor.state.doc.content.size - 1)
      editor.commands.insertDrawing()
    })
    expect(editor.getJSON().content.map((n) => n.type).slice(0, 2)).toEqual(['paragraph', 'drawing'])
  })

  it('offers it from the Insert menu', async () => {
    const ctx = mount()
    const editor = await editorOf(ctx.container)
    await waitFor(() => button('Insert'))
    await click(button('Insert'))
    await waitFor(() => screen.getByRole('menuitem', { name: 'Drawing' }))
    await click(screen.getByRole('menuitem', { name: 'Drawing' }))
    expect(drawings(editor)).toHaveLength(1)
  })
})

describe('drawing a stroke', () => {
  it('commits one stroke to the document on pointer-up, in the stored format', async () => {
    const { editor, svg } = await withDrawing()
    await stroke(svg, line(100))
    const [saved] = strokesOf(editor)
    expect(strokesOf(editor)).toHaveLength(1)
    expect(saved).toMatchObject({ t: 'p', c: null, s: 5 })
    const { points } = decodePoints(saved.d)
    expect(points.length).toBeGreaterThanOrEqual(2)
    expect(points[0].x).toBeCloseTo(100, 0)
    expect(points[points.length - 1].x).toBeCloseTo(600, 0)
    expect(points[0].y).toBeCloseTo(100, 0)
  })

  it('draws a tap as a dot', async () => {
    const { editor, svg } = await withDrawing()
    await stroke(svg, [[300, 150]])
    expect(strokesOf(editor)).toHaveLength(1)
    expect(decodePoints(strokesOf(editor)[0].d).points).toHaveLength(1)
  })

  it('keeps the stroke inside the box however far the pointer strays', async () => {
    const { editor, svg } = await withDrawing()
    await stroke(svg, [[500, 100], [5000, -4000], [500, 900]])
    for (const p of decodePoints(strokesOf(editor)[0].d).points) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(1000)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(320)
    }
  })

  it('keeps every stroke when they arrive back to back, before the view re-renders', async () => {
    // Regression: a stroke used to be merged into the list the last RENDER saw,
    // so two strokes within one task replaced each other instead of adding up.
    const { editor, svg } = await withDrawing()
    const down = (y) => fireEvent.pointerDown(svg, { clientX: 100, clientY: y, pointerId: 9, pointerType: 'mouse', button: 0 })
    const up = (y) => fireEvent.pointerUp(svg, { clientX: 500, clientY: y, pointerId: 9, pointerType: 'mouse', button: 0 })
    act(() => {
      down(60)
      up(60)
      down(160)
      up(160)
      down(260)
      up(260)
    })
    expect(strokesOf(editor)).toHaveLength(3)
  })

  it('makes each stroke its own undo step', async () => {
    const { editor, svg } = await withDrawing()
    await stroke(svg, line(60))
    await stroke(svg, line(120))
    await stroke(svg, line(180))
    expect(strokesOf(editor)).toHaveLength(3)
    await act(async () => {
      editor.commands.undo()
    })
    expect(strokesOf(editor)).toHaveLength(2)
    await act(async () => {
      editor.commands.undo()
    })
    expect(strokesOf(editor)).toHaveLength(1)
    await act(async () => {
      editor.commands.redo()
    })
    expect(strokesOf(editor)).toHaveLength(2)
  })

  it('does not draw outside drawing mode, nor with the secondary button', async () => {
    const { editor, svg, container } = await withDrawing()
    await stroke(svg, line(100), { button: 2 })
    expect(strokesOf(editor)).toHaveLength(0)
    await click(button('Done'))
    expect(container.querySelector('.drawing__canvas').dataset.draw).toBe('false')
    await stroke(svg, line(100))
    expect(strokesOf(editor)).toHaveLength(0)
  })

  it('ignores a resting palm once a pen has been used', async () => {
    const { editor, svg } = await withDrawing()
    await stroke(svg, line(80), { pointerType: 'pen', pressure: 0.6 })
    expect(strokesOf(editor)).toHaveLength(1)
    await stroke(svg, line(160), { pointerType: 'touch' })
    expect(strokesOf(editor)).toHaveLength(1)
    await stroke(svg, line(240), { pointerType: 'pen', pressure: 0.4 })
    expect(strokesOf(editor)).toHaveLength(2)
  })

  it('keeps pen pressure, and not mouse "pressure"', async () => {
    const { editor, svg } = await withDrawing()
    await stroke(svg, line(80), { pointerType: 'pen', pressure: 0.7 })
    await stroke(svg, line(160), { pointerType: 'mouse', pressure: 0.5 })
    expect(decodePoints(strokesOf(editor)[0].d).pressure).toBe(true)
    expect(decodePoints(strokesOf(editor)[1].d).pressure).toBe(false)
  })
})

describe('tools', () => {
  it('draws with the chosen colour, size and marker', async () => {
    const { editor, svg } = await withDrawing()
    await click(button('Highlighter'))
    await click(button('Amber'))
    await click(button('Thick line'))
    await stroke(svg, line(100))
    expect(strokesOf(editor)[0]).toMatchObject({ t: 'm', c: '#f59f00', s: 10 })
    await click(button('Pen'))
    await click(button(/Automatic/))
    await stroke(svg, line(200))
    expect(strokesOf(editor)[1]).toMatchObject({ t: 'p', c: null })
  })

  it('keeps every choice when several are made in the same tick', async () => {
    // Regression: each choice was applied to the settings the render saw, so
    // tool, colour and size chosen together kept only the last.
    const { editor, svg } = await withDrawing()
    await act(async () => {
      button('Highlighter').click()
      button('Amber').click()
      button('Thick line').click()
    })
    await stroke(svg, line(100))
    expect(strokesOf(editor)[0]).toMatchObject({ t: 'm', c: '#f59f00', s: 10 })
  })

  it('remembers the pen between drawings', async () => {
    const first = await withDrawing()
    await click(button('Blue'))
    first.unmount()
    const second = await withDrawing()
    await stroke(second.svg, line(100))
    expect(strokesOf(second.editor)[0].c).toBe('#1971c2')
  })

  it('erases the whole stroke it touches and no other', async () => {
    const { editor, svg } = await withDrawing()
    await stroke(svg, line(60))
    await stroke(svg, line(160))
    await stroke(svg, line(260))
    await click(button('Eraser (whole strokes)'))
    await stroke(svg, [[300, 150], [300, 170]])
    expect(strokesOf(editor)).toHaveLength(2)
    const ys = strokesOf(editor).map((s) => Math.round(decodePoints(s.d).points[0].y))
    expect(ys).toEqual([60, 260])
  })

  it('erases everything one sweep crosses in a single undo step', async () => {
    const { editor, svg } = await withDrawing()
    await stroke(svg, line(60))
    await stroke(svg, line(160))
    await stroke(svg, line(260))
    await click(button('Eraser (whole strokes)'))
    await click(button('Thick eraser'))
    await stroke(svg, [[300, 40], [300, 280]])
    expect(strokesOf(editor)).toHaveLength(0)
    await act(async () => {
      editor.commands.undo()
    })
    expect(strokesOf(editor)).toHaveLength(3)
  })

  it('does not skip a stroke between two pointer samples (a fast swipe)', async () => {
    const { editor, svg } = await withDrawing()
    await stroke(svg, line(160)) // a thin line at y=160
    await click(button('Eraser (whole strokes)'))
    // Two samples only, 200 units apart, with the stroke lying between them.
    await stroke(svg, [[350, 20], [350, 300]])
    expect(strokesOf(editor)).toHaveLength(0)
  })

  it('undoes the last stroke on request, and clears them all only once confirmed', async () => {
    const { editor, svg } = await withDrawing()
    await stroke(svg, line(60))
    await stroke(svg, line(160))
    await click(button('Undo last stroke'))
    expect(strokesOf(editor)).toHaveLength(1)
    await click(button('Clear'))
    expect(strokesOf(editor)).toHaveLength(1) // asked first
    await click(button('Clear all'))
    expect(strokesOf(editor)).toHaveLength(0)
    expect(drawings(editor)).toHaveLength(1)
  })

  it('asks before removing a drawing that has strokes, but not an empty one', async () => {
    const { editor, svg } = await withDrawing()
    await stroke(svg, line(60))
    await click(button('Remove drawing'))
    expect(drawings(editor)).toHaveLength(1)
    await click(button('Cancel'))
    await click(button('Undo last stroke'))
    await click(button('Remove drawing'))
    expect(drawings(editor)).toHaveLength(0)
  })
})

describe('keyboard', () => {
  it('Backspace on the canvas takes back a stroke and never deletes the drawing', async () => {
    const { editor, svg } = await withDrawing()
    await stroke(svg, line(60))
    await stroke(svg, line(160))
    const canvas = document.querySelector('.drawing__canvas')
    await act(async () => {
      fireEvent.keyDown(canvas, { key: 'Backspace' })
    })
    expect(strokesOf(editor)).toHaveLength(1)
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        fireEvent.keyDown(canvas, { key: 'Backspace' })
      })
    }
    expect(strokesOf(editor)).toHaveLength(0)
    expect(drawings(editor)).toHaveLength(1)
  })

  it('Backspace and Delete in the editor cannot remove a drawing that is being drawn on', async () => {
    const { editor } = await withDrawing()
    await act(async () => {
      editor.commands.keyboardShortcut('Backspace')
      editor.commands.keyboardShortcut('Delete')
    })
    expect(drawings(editor)).toHaveLength(1)
  })

  it('…but deletes it like any selected node when not in drawing mode', async () => {
    const { editor } = await withDrawing()
    await click(button('Done'))
    await act(async () => {
      editor.commands.keyboardShortcut('Backspace')
    })
    expect(drawings(editor)).toHaveLength(0)
  })

  it('Escape finishes drawing; Ctrl+Z on the canvas undoes through the editor', async () => {
    const { editor, svg, container } = await withDrawing()
    await stroke(svg, line(60))
    const canvas = container.querySelector('.drawing__canvas')
    await act(async () => {
      fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true })
    })
    expect(strokesOf(editor)).toHaveLength(0)
    await act(async () => {
      fireEvent.keyDown(canvas, { key: 'y', ctrlKey: true })
    })
    expect(strokesOf(editor)).toHaveLength(1)
    await act(async () => {
      fireEvent.keyDown(canvas, { key: 'Escape' })
    })
    expect(canvas.dataset.draw).toBe('false')
  })

  it('resizes with the arrow keys, within limits', async () => {
    const { editor, container } = await withDrawing()
    const handle = container.querySelector('.drawing__resize')
    await act(async () => {
      fireEvent.keyDown(handle, { key: 'ArrowDown' })
    })
    expect(drawings(editor)[0].attrs.height).toBe(360)
    for (let i = 0; i < 100; i++) {
      await act(async () => {
        fireEvent.keyDown(handle, { key: 'ArrowDown' })
      })
    }
    expect(drawings(editor)[0].attrs.height).toBe(4000)
    for (let i = 0; i < 100; i++) {
      await act(async () => {
        fireEvent.keyDown(handle, { key: 'ArrowUp' })
      })
    }
    expect(drawings(editor)[0].attrs.height).toBe(120)
  })
})

describe('saving and reopening', () => {
  it('saves the strokes with the note and flags it as having a drawing', async () => {
    const { editor, svg, actions } = await withDrawing()
    // Before the stroke: the autosave timer is created when the stroke commits.
    // Only timeouts are faked, so React's own scheduling is left alone.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await stroke(svg, line(100))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(actions.saveNote).toHaveBeenCalled()
    const payload = actions.saveNote.mock.calls.at(-1)[1]
    expect(payload.hasDrawing).toBe(true)
    expect(JSON.parse(payload.json).content.some((n) => n.type === 'drawing' && n.attrs.strokes.length === 1)).toBe(true)
    expect(strokesOf(editor)).toHaveLength(1)
  })

  it('reopens with its strokes, and a finished drawing does not start drawing by itself', async () => {
    const first = await withDrawing()
    await stroke(first.svg, line(100))
    await stroke(first.svg, line(200))
    const stored = first.editor.getJSON()
    first.unmount()

    const second = await withDrawing({ doc: stored })
    expect(strokesOf(second.editor)).toHaveLength(2)
    expect(second.container.querySelectorAll('.drawing__svg path')).toHaveLength(2)
    expect(second.container.querySelector('.drawing__canvas').dataset.draw).toBe('false')
    expect(screen.queryByRole('toolbar', { name: 'Drawing tools' })).toBeNull()
  })

  it('survives a copy and paste through HTML', async () => {
    const { editor, svg } = await withDrawing()
    await stroke(svg, line(100))
    const html = editor.getHTML()
    expect(html).toContain('data-type="drawing"')
    const copy = mount({ type: 'doc', content: [para('x')] })
    const copyEditor = await editorOf(copy.container)
    await act(async () => {
      copyEditor.commands.insertContent(html)
    })
    expect(strokesOf(copyEditor)).toHaveLength(1)
  })
})

describe('stored data is untrusted', () => {
  const hostile = {
    type: 'doc',
    content: [
      {
        type: 'drawing',
        attrs: {
          height: 'tall',
          label: 'x',
          strokes: [
            { t: '"><script>', c: '"><img src=x onerror=alert(1)>', s: '5" onload="alert(1)', d: 'AAECAwQ' },
            { d: '<svg onload=alert(1)>' },
            null,
            'not a stroke',
          ],
        },
      },
    ],
  }

  it('renders only what it can validate, with no script or handler in the output', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container } = await withDrawing({ doc: hostile })
    expect(container.querySelector('script')).toBeNull()
    expect(container.innerHTML).not.toMatch(/onerror|onload/i)
    for (const path of container.querySelectorAll('.drawing__svg path')) {
      expect(path.getAttribute('fill')).toMatch(/^(currentColor|#[0-9a-f]{6})$/)
    }
  })

  it('falls back to the default height for a nonsense one', async () => {
    const { container } = await withDrawing({ doc: hostile })
    expect(container.querySelector('.drawing__svg').getAttribute('viewBox')).toBe('0 0 1000 320')
  })
})
