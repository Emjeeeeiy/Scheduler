import { Extension } from '@tiptap/core'

/* "Clear formatting" the way a word processor means it: every mark off the
   selection, and the block back to a plain left-aligned paragraph at the paper's
   own spacing — headings, lists, alignment, indent and line spacing included. */

export const ClearFormatting = Extension.create({
  name: 'clearFormatting',

  addCommands() {
    return {
      clearFormatting:
        () =>
        ({ chain }) =>
          chain()
            .unsetAllMarks()
            .clearNodes()
            .unsetTextAlign()
            .resetAttributes('paragraph', ['lineHeight', 'indent'])
            .run(),
    }
  },

  addKeyboardShortcuts() {
    return { 'Mod-\\': () => this.editor.commands.clearFormatting() }
  },
})
