import { Extension } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'

/* Shortcuts that open UI the editor itself does not own: the link popover and
   the shortcuts sheet. The callbacks are passed in because this extension is
   built once per editor while the UI that answers them is React state.

   Mod-K matters beyond the editor: the app's command palette also answers
   Ctrl/Cmd+K. ProseMirror calls preventDefault when a handler returns true, and
   the palette's window listener checks `defaultPrevented` — so inside the
   editor the key means "link", everywhere else it still means "search".

   Select All is here too, for a different reason. ProseMirror's own Ctrl+A makes
   an AllSelection, which marks and wrapping commands accept but list commands
   cannot lift: select everything, click Bullets, click Bullets again, and
   nothing happens. Selecting the text range instead — what a browser does —
   makes every command behave the same after Ctrl+A as after a drag. */

export const EditorShortcuts = Extension.create({
  name: 'editorShortcuts',

  // Above the core keymap, which would otherwise answer Mod-A first.
  priority: 1000,

  addOptions() {
    return { onLink: null, onHelp: null }
  },

  addCommands() {
    return {
      selectAllText:
        () =>
        ({ tr, dispatch }) => {
          const { doc } = tr
          let end = doc.content.size
          /* The editor keeps an empty paragraph after a final list, table or
             drawing so the caret can always get below it. That is furniture, not
             text anyone typed — left in the selection it would stick out of the
             list, and "turn the list off" could no longer lift it. */
          const last = doc.lastChild
          if (
            doc.childCount > 1 &&
            last.type.name === 'paragraph' &&
            last.content.size === 0 &&
            doc.child(doc.childCount - 2).type.name !== 'paragraph'
          ) {
            end -= last.nodeSize
          }
          if (dispatch) tr.setSelection(TextSelection.between(doc.resolve(0), doc.resolve(end)))
          return true
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-a': () => this.editor.commands.selectAllText(),
      'Mod-k': () => {
        if (!this.options.onLink) return false
        this.options.onLink()
        return true
      },
      'Mod-/': () => {
        if (!this.options.onHelp) return false
        this.options.onHelp()
        return true
      },
    }
  },
})
