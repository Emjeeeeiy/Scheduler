import { formatDayLabel } from '@cadence/shared/date.js'
import { noteDisplayTitle } from '@cadence/shared/journal.js'
import { useDayNote } from '../../state/DayNotesContext.jsx'
import { JournalIcon } from '../icons.jsx'

// Long enough to recognise the note by, short enough to stay a tooltip.
const PREVIEW_MAX = 140

function preview(note) {
  const excerpt = note.excerpt.length > PREVIEW_MAX ? `${note.excerpt.slice(0, PREVIEW_MAX).trimEnd()}…` : note.excerpt
  return [noteDisplayTitle(note), excerpt].filter(Boolean).join(' — ')
}

/**
 * The way from a day in the schedule to that day's Journal note — the same
 * button on the Day view, a month day's peek, the palette's agendas and the
 * Dashboard, so "this day has a note" reads one way everywhere.
 *
 * Says "journal", never just "note": a task and an event already have a Notes
 * field of their own, and "Open note" beside a list of tasks would read as
 * theirs. Until the list of notes has loaded it says only "Journal" rather than
 * claiming there is nothing to open. Opening does the deciding either way —
 * the Journal finds the day's note or starts one (see JournalView's openDay).
 *
 * `compact` is the icon alone, for a 260px popover (DayPeek) that has no room
 * for the words beside its title and "Open day"; the name and tooltip still
 * say all of it. `small={false}` is the full-size ghost button, for a place
 * where it sits beside a full-size primary one (the Dashboard's hero).
 */
export function DayNoteButton({ dayKey, onOpen, compact = false, small = true }) {
  const { loading, note } = useDayNote(dayKey)
  if (!onOpen) return null

  const label = loading ? 'Journal' : note ? 'Open journal' : 'Write in journal'
  // The visible words first, then the day: someone using voice control says
  // what they see ("click Open journal"), so the name has to start with it.
  const name = `${label}, ${formatDayLabel(dayKey)}`

  if (compact) {
    return (
      <button
        type="button"
        className="icon-button icon-button--sm"
        onClick={() => onOpen(dayKey)}
        aria-label={name}
        title={note ? preview(note) : name}
      >
        <JournalIcon width="14" height="14" />
      </button>
    )
  }

  return (
    <button
      type="button"
      className={`ghost-button${small ? ' ghost-button--sm' : ''} button--icon-label`}
      onClick={() => onOpen(dayKey)}
      aria-label={name}
      title={note ? preview(note) : name}
    >
      <JournalIcon className="button-icon" />
      {label}
    </button>
  )
}
