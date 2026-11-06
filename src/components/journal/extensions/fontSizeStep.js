import { Extension } from '@tiptap/core'
import { parseFontSize, stepFontSize, toPt } from '../../../lib/journalFonts.js'

/* Grow / shrink: step through the same sizes the dropdown offers, from whatever
   the selection is at now. Word binds these to Ctrl+Shift+> and Ctrl+Shift+<. */

function step(direction) {
  return () =>
    ({ editor, commands }) => {
      const current = parseFontSize(editor.getAttributes('textStyle').fontSize)
      return commands.setFontSize(toPt(stepFontSize(current, direction)))
    }
}

export const FontSizeStep = Extension.create({
  name: 'fontSizeStep',

  addCommands() {
    return { increaseFontSize: step(1), decreaseFontSize: step(-1) }
  },

  /* Both spellings of each: with Shift held the key reports '>' on a US layout,
     but another layout may report the unshifted character. */
  addKeyboardShortcuts() {
    const grow = () => this.editor.commands.increaseFontSize()
    const shrink = () => this.editor.commands.decreaseFontSize()
    return {
      'Mod-Shift->': grow,
      'Mod-Shift-.': grow,
      'Mod-Shift-<': shrink,
      'Mod-Shift-,': shrink,
    }
  },
})
