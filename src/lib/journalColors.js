/* Swatches for the Journal's colour pickers.
 *
 * These are choices offered to the writer for their own content — text, marker
 * highlights, ink, paper — so they sit outside the app's neutral chrome palette
 * on purpose (the same carve-out the user's tag colours have). Names are real
 * words rather than hex codes because each swatch is a button, and a screen
 * reader should hear "Red", not "#e03131".
 *
 * Highlights carry an alpha channel. A marker is translucent: the text under it
 * keeps its own colour and stays readable on light AND dark paper, where an
 * opaque pastel would swallow white text.
 */

import { normalizeHex } from '@cadence/shared/journal.js'
import { contrastRatio } from './journalPaper.js'

const row = (entries) => entries.map(([name, value]) => ({ name, value }))

export const TEXT_COLORS = [
  ...row([
    ['Black', '#000000'],
    ['Charcoal', '#343a40'],
    ['Gray', '#6c757d'],
    ['Silver', '#adb5bd'],
    ['Light gray', '#dee2e6'],
    ['White', '#ffffff'],
  ]),
  ...row([
    ['Red', '#e03131'],
    ['Orange', '#f76707'],
    ['Amber', '#f59f00'],
    ['Green', '#2f9e44'],
    ['Teal', '#0c8599'],
    ['Blue', '#1971c2'],
    ['Indigo', '#4263eb'],
    ['Purple', '#9c36b5'],
    ['Pink', '#d6336c'],
    ['Brown', '#8c5a2b'],
  ]),
  ...row([
    ['Dark red', '#8b1a1a'],
    ['Rust', '#a84300'],
    ['Olive', '#6b6b00'],
    ['Forest', '#1b5e20'],
    ['Deep teal', '#064e5a'],
    ['Navy', '#0b3d7a'],
    ['Plum', '#5c1d7a'],
    ['Wine', '#7a1f3d'],
    ['Cocoa', '#4e342e'],
    ['Slate', '#2b3a4a'],
  ]),
  ...row([
    ['Rose', '#ff8787'],
    ['Peach', '#ffa94d'],
    ['Lemon', '#ffe066'],
    ['Lime', '#8ce99a'],
    ['Aqua', '#66d9e8'],
    ['Sky', '#74c0fc'],
    ['Periwinkle', '#91a7ff'],
    ['Lilac', '#da77f2'],
    ['Bubblegum', '#faa2c1'],
    ['Sand', '#d9b98c'],
  ]),
]

const MARKER_ALPHA = '99'

export const HIGHLIGHT_COLORS = row([
  ['Yellow', '#ffd43b'],
  ['Green', '#69db7c'],
  ['Blue', '#74c0fc'],
  ['Pink', '#faa2c1'],
  ['Orange', '#ffa94d'],
  ['Purple', '#da77f2'],
  ['Red', '#ff8787'],
  ['Gray', '#adb5bd'],
]).map((swatch) => ({ ...swatch, value: swatch.value + MARKER_ALPHA }))

/** A custom (opaque) colour becomes a marker by adding the same alpha. */
export const asMarker = (hex) => (normalizeHex(hex) ? normalizeHex(hex) + MARKER_ALPHA : hex)

/** Pen swatches: strong, readable on most papers. 'auto' (null value) follows
    the paper's own ink, so a drawing made in the default pen stays visible when
    the theme flips. */
export const PEN_COLORS = row([
  ['Red', '#e03131'],
  ['Orange', '#f76707'],
  ['Amber', '#f59f00'],
  ['Green', '#2f9e44'],
  ['Teal', '#0c8599'],
  ['Blue', '#1971c2'],
  ['Indigo', '#4263eb'],
  ['Purple', '#9c36b5'],
  ['Pink', '#d6336c'],
  ['Brown', '#8c5a2b'],
])

/** Light and deep paper colours for the picker's custom row. */
export const PAPER_COLORS = row([
  ['White', '#ffffff'],
  ['Snow', '#f8f9fa'],
  ['Ivory', '#fbf7ea'],
  ['Cream', '#f6efd9'],
  ['Butter', '#fff6a8'],
  ['Peach', '#ffe8d6'],
  ['Blush', '#fdeef0'],
  ['Lavender', '#f1ecfa'],
  ['Sky', '#eaf3fb'],
  ['Mint', '#e8f6ef'],
  ['Sage', '#dfe8d5'],
  ['Kraft', '#c8a77a'],
  ['Graphite', '#2b2d31'],
  ['Midnight', '#10141f'],
  ['Forest', '#263b2f'],
  ['Navy', '#1b4f8a'],
])

export const PATTERN_COLORS = row([
  ['Gray', '#9aa0a6'],
  ['Silver', '#cfd3d7'],
  ['Brown', '#b9aa7f'],
  ['Red', '#e08a8a'],
  ['Orange', '#e8b38a'],
  ['Green', '#7fbf8f'],
  ['Teal', '#7fc4cc'],
  ['Blue', '#7fa8d4'],
  ['Purple', '#b9a8e3'],
  ['White', '#ffffff'],
  ['Black', '#000000'],
])

/** Whether a colour would be hard to read on `paperHex` — the picker dims such
    a swatch and says why, rather than letting someone write black on black. */
export function isLowContrast(colorHex, paperHex) {
  const colour = normalizeHex(String(colorHex).slice(0, 7))
  const paper = normalizeHex(paperHex)
  if (!colour || !paper) return false
  return contrastRatio(colour, paper) < 2
}
