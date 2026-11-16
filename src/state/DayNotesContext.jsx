import { createContext, useContext, useMemo } from 'react'
import { notesByDay } from '@cadence/shared/journal.js'
import { useJournalNotes } from './useJournal.js'

/* Which days have a Journal note — what the calendars mark, and what every
 * "Open journal" button asks before it says "Open" or "Write".
 *
 * The link between a day and a note is the note's `dayKey`, the same
 * 'YYYY-MM-DD' string a task's `date` is. Never an id: a backup import gives
 * every note, task and event a new id, and a link by date survives that.
 *
 * One listener for the whole shell, on the Journal's small metadata documents
 * (title, excerpt, paper — never a body). It is the very query the Journal page
 * listens to, and Firestore answers identical queries from one watch, so opening
 * the Journal costs no second read. Nothing here imports the editor: the
 * Journal's chunk stays out of the main bundle.
 */

const EMPTY = Object.freeze({ loading: true, byDay: new Map() })

// The default is "still loading, nothing known", so a component rendered
// without the provider (a test, the smoke build) draws its plain, unmarked self.
const DayNotesContext = createContext(EMPTY)

export function DayNotesProvider({ children }) {
  const { notes, loading } = useJournalNotes()
  const value = useMemo(() => ({ loading, byDay: notesByDay(notes) }), [loading, notes])
  return <DayNotesContext.Provider value={value}>{children}</DayNotesContext.Provider>
}

/** `{ loading, byDay }` — byDay maps a day key to the note that day opens. */
export function useDayNotes() {
  return useContext(DayNotesContext)
}

/** The note a day opens, or null; `loading` until the first snapshot lands, so
    a caller can avoid claiming "no note" before it actually knows. */
export function useDayNote(dayKey) {
  const { loading, byDay } = useContext(DayNotesContext)
  return { loading, note: byDay.get(dayKey) ?? null }
}
