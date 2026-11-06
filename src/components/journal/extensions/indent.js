import { Extension } from '@tiptap/core'

/* Paragraph indent in whole steps, like Word's Increase/Decrease Indent. List
   items already have their own nesting (Tab sinks, Shift+Tab lifts), so this
   only ever applies to plain paragraphs and headings. */

export const MAX_INDENT = 8
const STEP_REM = 2
const BLOCKS = ['paragraph', 'heading']

const clampIndent = (value) => Math.min(Math.max(Number.isInteger(value) ? value : 0, 0), MAX_INDENT)

function stepIndent(delta) {
  return () =>
    ({ state, tr, dispatch }) => {
      let changed = false
      state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
        if (!BLOCKS.includes(node.type.name)) return true
        const current = clampIndent(node.attrs.indent)
        const next = clampIndent(current + delta)
        if (next !== current) {
          changed = true
          if (dispatch) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next })
        }
        return false
      })
      return changed
    }
}

/** Tab is only an indent where nothing else owns it. Inside a list it nests,
    in a table it moves between cells, in a code block it is left alone. */
const ownedElsewhere = (editor) =>
  ['listItem', 'taskItem', 'codeBlock', 'tableCell', 'tableHeader'].some((name) => editor.isActive(name))

export const Indent = Extension.create({
  name: 'indent',

  addGlobalAttributes() {
    return [
      {
        types: BLOCKS,
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => clampIndent(Number.parseInt(element.getAttribute('data-indent') ?? '0', 10)),
            renderHTML: (attributes) =>
              attributes.indent > 0
                ? { 'data-indent': attributes.indent, style: `margin-left: ${attributes.indent * STEP_REM}rem` }
                : {},
          },
        },
      },
    ]
  },

  addCommands() {
    return { indent: stepIndent(1), outdent: stepIndent(-1) }
  },

  addKeyboardShortcuts() {
    /* Consumed even at the limit: the key does something predictable on every
       press rather than sometimes sending focus out of the page. Escape is the
       documented way out of the editor. */
    return {
      Tab: ({ editor }) => {
        if (ownedElsewhere(editor)) return false
        editor.commands.indent()
        return true
      },
      'Shift-Tab': ({ editor }) => {
        if (ownedElsewhere(editor)) return false
        editor.commands.outdent()
        return true
      },
    }
  },
})
