/* Every Journal shortcut in one table, so the toolbar tooltips, the screen-reader
   hints and the help sheet read from the same place and can never disagree with
   each other. The bindings themselves live with the extensions that answer them
   (TipTap's own defaults, plus ours in extensions/); this is only how they are
   written down for a person.

   "Mod" is Ctrl on Windows/Linux and Cmd on a Mac, matching how the editor
   binds it. The set follows Google Docs wherever one exists, so what a writer
   already knows works. */

export const SHORTCUTS = {
  bold: 'Mod+B',
  italic: 'Mod+I',
  underline: 'Mod+U',
  strike: 'Mod+Shift+S',
  code: 'Mod+E',
  superscript: 'Mod+.',
  subscript: 'Mod+,',
  highlight: 'Mod+Shift+H',
  clear: 'Mod+\\',
  bigger: 'Mod+Shift+>',
  smaller: 'Mod+Shift+<',
  alignLeft: 'Mod+Shift+L',
  alignCenter: 'Mod+Shift+E',
  alignRight: 'Mod+Shift+R',
  alignJustify: 'Mod+Shift+J',
  bullets: 'Mod+Shift+8',
  numbers: 'Mod+Shift+7',
  checklist: 'Mod+Shift+9',
  normal: 'Mod+Alt+0',
  h1: 'Mod+Alt+1',
  h2: 'Mod+Alt+2',
  h3: 'Mod+Alt+3',
  quote: 'Mod+Shift+B',
  codeBlock: 'Mod+Alt+C',
  indent: 'Tab',
  outdent: 'Shift+Tab',
  undo: 'Mod+Z',
  redo: 'Mod+Y',
  link: 'Mod+K',
  selectAll: 'Mod+A',
  plainPaste: 'Mod+Shift+V',
  help: 'Mod+/',
  leave: 'Esc',
}

export const SHORTCUT_GROUPS = [
  {
    title: 'Text',
    items: [
      ['Bold', 'bold'],
      ['Italic', 'italic'],
      ['Underline', 'underline'],
      ['Strikethrough', 'strike'],
      ['Code', 'code'],
      ['Superscript', 'superscript'],
      ['Subscript', 'subscript'],
      ['Highlight', 'highlight'],
      ['Larger text', 'bigger'],
      ['Smaller text', 'smaller'],
      ['Clear formatting', 'clear'],
    ],
  },
  {
    title: 'Paragraph',
    items: [
      ['Align left', 'alignLeft'],
      ['Align center', 'alignCenter'],
      ['Align right', 'alignRight'],
      ['Justify', 'alignJustify'],
      ['Bulleted list', 'bullets'],
      ['Numbered list', 'numbers'],
      ['Checklist', 'checklist'],
      ['Normal text', 'normal'],
      ['Heading 1', 'h1'],
      ['Heading 2', 'h2'],
      ['Heading 3', 'h3'],
      ['Quote', 'quote'],
      ['Code block', 'codeBlock'],
      ['Indent', 'indent'],
      ['Outdent', 'outdent'],
    ],
  },
  {
    title: 'Editing',
    items: [
      ['Undo', 'undo'],
      ['Redo', 'redo'],
      ['Insert link', 'link'],
      ['Select all', 'selectAll'],
      ['Paste without formatting', 'plainPaste'],
    ],
  },
  {
    title: 'Around the editor',
    items: [
      ['Show these shortcuts', 'help'],
      ['Leave the editor (then Tab to the toolbar)', 'leave'],
    ],
  },
]

export function isMac() {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '')
}

const MAC_GLYPHS = { Mod: '⌘', Shift: '⇧', Alt: '⌥', Ctrl: '⌃' }

/** 'Mod+Shift+S' -> 'Ctrl+Shift+S' (or '⌘⇧S' on a Mac). */
export function formatKeys(keys, mac = isMac()) {
  const parts = keys.split(/\+(?!$)/)
  if (mac) return parts.map((part) => MAC_GLYPHS[part] ?? part).join('')
  return parts.map((part) => (part === 'Mod' ? 'Ctrl' : part)).join('+')
}

/** The same chord in the form `aria-keyshortcuts` expects. */
export function ariaKeys(keys, mac = isMac()) {
  return keys
    .split(/\+(?!$)/)
    .map((part) => (part === 'Mod' ? (mac ? 'Meta' : 'Control') : part === 'Esc' ? 'Escape' : part))
    .join('+')
}

/** "Bold (Ctrl+B)" — the tooltip every toolbar control carries. */
export function withShortcut(label, id) {
  const keys = SHORTCUTS[id]
  return keys ? `${label} (${formatKeys(keys)})` : label
}
