import StarterKit from '@tiptap/starter-kit'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { Highlight } from '@tiptap/extension-highlight'
import { TextAlign } from '@tiptap/extension-text-align'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Subscript } from '@tiptap/extension-subscript'
import { Superscript } from '@tiptap/extension-superscript'
import { CharacterCount, Placeholder } from '@tiptap/extensions'
import { ClearFormatting } from './clearFormatting.js'
import { EditorShortcuts } from './editorShortcuts.js'
import { FontSizeStep } from './fontSizeStep.js'
import { Indent } from './indent.js'
import { LineSpacing } from './lineSpacing.js'

/** Only these may be linked to. A `javascript:` URL typed or pasted into a link
    is how a note would become an attack on whoever opens it, so the allow-list
    is explicit rather than a deny-list of known-bad schemes. */
export const LINK_PROTOCOLS = ['http', 'https', 'mailto', 'tel']

/** The whole schema of a note, in one place. `extra` is where the node types
    that need their own UI (drawings, tables, images) are added by the editor. */
export function buildExtensions({ onLink, onHelp, placeholder = 'Start writing…', extra = [] } = {}) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        protocols: LINK_PROTOCOLS,
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      },
    }),
    /* Colour, family and size ride on one `textStyle` mark. Highlight is its own
       mark (a marker, not a text background), and line height is a paragraph
       attribute — see lineSpacing.js — so those two kit members stay off. */
    TextStyleKit.configure({ backgroundColor: false, lineHeight: false }),
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Subscript,
    Superscript,
    Placeholder.configure({ placeholder }),
    CharacterCount,
    LineSpacing,
    Indent,
    FontSizeStep,
    ClearFormatting,
    EditorShortcuts.configure({ onLink, onHelp }),
    ...extra,
  ]
}
