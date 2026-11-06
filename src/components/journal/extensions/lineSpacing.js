import { Extension } from '@tiptap/core'

/* Line spacing belongs to the paragraph, not to the text — the way Word and
   Docs treat it — so an empty line and a line of mixed sizes both obey it. It
   is stored as a unitless multiplier on paragraphs and headings. */

export const LINE_SPACINGS = [
  { value: 1, label: 'Single' },
  { value: 1.15, label: '1.15' },
  { value: 1.5, label: '1.5' },
  { value: 2, label: 'Double' },
  { value: 2.5, label: '2.5' },
]

const BLOCKS = ['paragraph', 'heading']

/** A pasted `line-height: 150%` or `24px` is not a multiplier; only a plain,
    sane number is kept, anything else falls back to the paper's own spacing. */
function parseLineHeight(element) {
  const raw = element.style?.lineHeight
  if (!raw || !/^\d+(\.\d+)?$/.test(raw)) return null
  const value = Number(raw)
  return value >= 0.8 && value <= 4 ? value : null
}

export const LineSpacing = Extension.create({
  name: 'lineSpacing',

  addGlobalAttributes() {
    return [
      {
        types: BLOCKS,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: parseLineHeight,
            renderHTML: (attributes) =>
              attributes.lineHeight ? { style: `line-height: ${attributes.lineHeight}` } : {},
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setLineSpacing:
        (value) =>
        ({ commands }) =>
          BLOCKS.map((type) => commands.updateAttributes(type, { lineHeight: value })).some(Boolean),
      unsetLineSpacing:
        () =>
        ({ commands }) =>
          BLOCKS.map((type) => commands.resetAttributes(type, 'lineHeight')).some(Boolean),
    }
  },
})
