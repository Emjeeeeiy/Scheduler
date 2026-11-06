/* The typefaces and sizes the Journal editor offers.
 *
 * The app's own chrome stays in Inter (and Space Mono for numerals) — see
 * DESIGN.md. What someone writes in a note is their content, so the editor
 * offers a handful of faces the way a word processor does. Every stack ends in
 * a generic family, so a face that has not loaded (offline, blocked) falls back
 * to something of the same character instead of the browser default.
 *
 * Inter, Space Mono and Press Start 2P are already requested by index.html. The
 * four below the divider are fetched once, on the first Journal visit, rather
 * than for every visitor to the app.
 */

export const JOURNAL_FONTS = [
  { id: 'default', label: 'Default', value: null },
  { id: 'arial', label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { id: 'verdana', label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { id: 'trebuchet', label: 'Trebuchet MS', value: "'Trebuchet MS', Helvetica, sans-serif" },
  { id: 'georgia', label: 'Georgia', value: 'Georgia, serif' },
  { id: 'times', label: 'Times New Roman', value: "'Times New Roman', Times, serif" },
  { id: 'courier', label: 'Courier New', value: "'Courier New', Courier, monospace" },
  { id: 'mono', label: 'Space Mono', value: "'Space Mono', ui-monospace, monospace" },
  { id: 'pixel', label: 'Press Start 2P', value: "'Press Start 2P', monospace" },
  { id: 'merriweather', label: 'Merriweather', value: "Merriweather, Georgia, serif", remote: true },
  { id: 'caveat', label: 'Caveat', value: "Caveat, 'Segoe Script', cursive", remote: true },
  { id: 'patrick', label: 'Patrick Hand', value: "'Patrick Hand', 'Segoe Print', cursive", remote: true },
  { id: 'comic', label: 'Comic Neue', value: "'Comic Neue', 'Comic Sans MS', cursive", remote: true },
]

const squash = (value) => String(value ?? '').toLowerCase().replace(/["'\s]/g, '')

/** The font a stored `font-family` value corresponds to, so the toolbar can say
    what the caret is in. Compared without quotes or spacing because pasted
    content quotes names its own way. Unknown families return null. */
export function fontForValue(value) {
  if (!value) return JOURNAL_FONTS[0]
  const wanted = squash(value)
  const exact = JOURNAL_FONTS.find((font) => font.value && squash(font.value) === wanted)
  if (exact) return exact
  const first = wanted.split(',')[0]
  return JOURNAL_FONTS.find((font) => font.value && squash(font.value).split(',')[0] === first) ?? null
}

/** The first family name of a stored value, for showing an unrecognised face. */
export function firstFamily(value) {
  return String(value ?? '')
    .split(',')[0]
    .replace(/["']/g, '')
    .trim()
}

export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72]
export const DEFAULT_FONT_SIZE = 12
export const MIN_FONT_SIZE = 6
export const MAX_FONT_SIZE = 200

/** '14pt' -> 14. Anything that is not a point size (a pasted '18px') is
    converted, so the toolbar always reads in the unit the editor writes. */
export function parseFontSize(value) {
  if (typeof value !== 'string') return null
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(pt|px)$/i)
  if (!match) return null
  const size = Number(match[1])
  return match[2].toLowerCase() === 'px' ? Math.round(size * 0.75 * 10) / 10 : size
}

export const clampFontSize = (size) => Math.min(Math.max(size, MIN_FONT_SIZE), MAX_FONT_SIZE)

/** The next size up or down the list from `current`, the way Word's grow/shrink
    buttons step through the same sizes the dropdown offers. */
export function stepFontSize(current, direction) {
  const size = Number.isFinite(current) ? current : DEFAULT_FONT_SIZE
  if (direction > 0) return FONT_SIZES.find((candidate) => candidate > size) ?? clampFontSize(size + 4)
  for (let i = FONT_SIZES.length - 1; i >= 0; i--) {
    if (FONT_SIZES[i] < size) return FONT_SIZES[i]
  }
  return clampFontSize(size - 1)
}

export const toPt = (size) => `${size}pt`

const GOOGLE_HREF =
  'https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&family=Caveat:wght@400..700' +
  '&family=Patrick+Hand&family=Comic+Neue:wght@400;700&display=swap'

/** Adds the remote faces' stylesheet once. Safe to call on every Journal mount;
    a blocked or offline request just leaves the fallbacks in place. */
export function loadJournalFonts() {
  if (typeof document === 'undefined' || document.getElementById('journal-fonts')) return
  const link = document.createElement('link')
  link.id = 'journal-fonts'
  link.rel = 'stylesheet'
  link.href = GOOGLE_HREF
  document.head.appendChild(link)
}
