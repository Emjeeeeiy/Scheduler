import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { DEFAULT_HEIGHT, clampHeight, normalizeStrokes } from '../../../lib/ink.js'
import { DrawingBlock } from '../DrawingBlock.jsx'

/* A drawing box: a block in the note's flow that you draw on, like Insert →
 * Drawing in a document editor. It moves with the text around it, scales with
 * the page, and its strokes share the editor's undo history with typing.
 *
 * It is an atom — the editor treats it as one indivisible thing and never puts a
 * caret inside it. All of its content is three attributes: the strokes (see
 * lib/ink.js for their format), the height, and a description for screen readers.
 */

/** Strokes in a pasted or stored drawing are untrusted: every one is rebuilt
    from its four known fields before it reaches the schema. */
const readStrokes = (element) => {
  try {
    return normalizeStrokes(JSON.parse(element.getAttribute('data-strokes') ?? '[]'))
  } catch {
    return []
  }
}

export const Drawing = Node.create({
  name: 'drawing',
  // Ahead of the core keymap, whose Backspace would delete a selected node.
  priority: 1000,
  group: 'block',
  atom: true,
  selectable: true,
  /* Not draggable, on purpose. A draggable node starts a native HTML5 drag on any
     press-and-move over it, which wins the race against drawing with a mouse —
     the same reason the calendar's resize handles are never children of a
     draggable block. Move a drawing with cut and paste. */
  draggable: false,

  addAttributes() {
    return {
      strokes: {
        default: [],
        parseHTML: readStrokes,
        renderHTML: (attributes) => ({ 'data-strokes': JSON.stringify(attributes.strokes) }),
      },
      height: {
        default: DEFAULT_HEIGHT,
        parseHTML: (element) => clampHeight(Number(element.getAttribute('data-height'))),
        renderHTML: (attributes) => ({ 'data-height': attributes.height }),
      },
      label: {
        default: '',
        parseHTML: (element) => (element.getAttribute('data-label') ?? '').slice(0, 300),
        renderHTML: (attributes) => (attributes.label ? { 'data-label': attributes.label } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="drawing"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes({ 'data-type': 'drawing' }, HTMLAttributes)]
  },

  addNodeView() {
    // The class lets the stylesheet drop ProseMirror's generic selected-node
    // outline from this container; the canvas draws its own (see journal.css).
    return ReactNodeViewRenderer(DrawingBlock, { className: 'drawing-view' })
  },

  addKeyboardShortcuts() {
    /* While a drawing is being drawn on, Backspace and Delete never remove the
       box, wherever keyboard focus happens to be: it is selected, and a stray key
       would otherwise delete the whole thing. (With the canvas focused its own
       handler takes Backspace as "undo the last stroke" first.) Outside drawing
       mode, a selected drawing is deleted like any other selected node. */
    const guard = () => {
      const { selection } = this.editor.state
      if (!(selection instanceof NodeSelection) || selection.node.type.name !== this.name) return false
      const dom = this.editor.view.nodeDOM(selection.from)
      return Boolean(dom?.querySelector?.('[data-draw="true"]'))
    }
    return { Backspace: guard, Delete: guard }
  },

  addCommands() {
    return {
      /** Adds an empty drawing after the current block — or in place of an empty
          line, so a blank paragraph is not left stranded above it — and selects
          it, which is what puts it straight into drawing mode. */
      insertDrawing:
        () =>
        ({ state, tr, dispatch }) => {
          const node = state.schema.nodes.drawing.create()
          if (!dispatch) return true
          const { $from } = state.selection
          const line = $from.parent
          let pos
          if (line.type.name === 'paragraph' && line.content.size === 0) {
            pos = $from.before()
            tr.replaceWith(pos, $from.after(), node)
          } else {
            pos = $from.after()
            tr.insert(pos, node)
          }
          tr.setSelection(NodeSelection.create(tr.doc, pos)).scrollIntoView()
          return true
        },
    }
  },
})
