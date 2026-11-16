import { JournalIcon } from '../icons.jsx'

/** What a day's accessible name gains when it has a Journal note. The glyph is
    shape only, and shape is never the whole signal (PRODUCT.md), so every host
    that draws the mark says these words too — in its aria-label, its title, or
    visually-hidden text, whichever it already names the day with. */
export const DAY_NOTE_WORDS = 'journal note'

/**
 * The quiet sign that a day has a Journal note: the Journal's own icon, small,
 * in the secondary text colour — never an accent (DESIGN.md's Zero Accent
 * Rule). It sits INSIDE the day's existing button (a week column's header, a
 * month day's number, a mini-calendar day) rather than being a second control:
 * those already open the Day view, which is where the day's journal button is.
 */
export function DayNoteMark({ className = '' }) {
  return <JournalIcon className={`day-note-mark${className ? ` ${className}` : ''}`} width="10" height="10" />
}
