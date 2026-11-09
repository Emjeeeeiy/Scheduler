import { useEffect, useRef } from 'react'
import { formatFullDayLabel, todayKey } from '@cadence/shared/date.js'
import { findNoteForDay, noteDisplayTitle, normalizePaper } from '@cadence/shared/journal.js'
import { loadJournalFonts } from '../../lib/journalFonts.js'
import { usePersistentState } from '../../lib/usePersistentState.js'
import { useSettings } from '../../state/SettingsContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { useJournalActions, useJournalNotes } from '../../state/useJournal.js'
import { NoteEditor, NoteSkeleton } from '../journal/NoteEditor.jsx'
import { NoteList } from '../journal/NoteList.jsx'
import '../../styles/journal.css'

/* The Journal page: a list of notes beside the one that is open — two panes from
 * 1200px, and one screen at a time (the list, or the open note with a way back)
 * below that.
 *
 * This file only decides which note is showing and what the list's buttons do.
 * Reading and writing are in state/useJournal.js; the editor and everything
 * about a single note are in components/journal/. The open note is remembered
 * across a reload, like the schedule's date cursor.
 *
 * It is loaded on demand (App.jsx lazy-loads it), so the editor — most of the
 * app's weight by far — costs nothing until someone opens the page.
 */

const SELECTED_KEY = 'cadence-app:journal-note'
const LIST_HIDDEN_KEY = 'cadence-app:journal-list-hidden'

// How long a chosen note may be missing from the list before it is given up on:
// a just-created note appears on the next snapshot, so a few seconds means it
// was purged elsewhere (or never written) rather than still on its way.
const MISSING_GRACE_MS = 3000

export function JournalView({ intent = null, onIntentHandled }) {
  const { notes, trashed, loading, error } = useJournalNotes()
  const actions = useJournalActions()
  const { settings, updateSetting } = useSettings()
  const { pushError, pushSuccess, pushUndo } = useToast()
  const [selectedId, setSelectedId] = usePersistentState(SELECTED_KEY, null, (stored) =>
    typeof stored === 'string' ? stored : null,
  )

  // Hiding the list gives the page the whole width. Remembered, like the open note.
  // The list is there until the writer says otherwise: it used to step aside by
  // itself on a laptop-sized screen, which left no visible way to move between
  // notes. (Below 1200px the list and the note are separate screens anyway, and
  // the toggle is not shown.)
  const [listHidden, setListHidden] = usePersistentState(LIST_HIDDEN_KEY, false, (stored) =>
    typeof stored === 'boolean' ? stored : false,
  )

  useEffect(() => {
    loadJournalFonts()
  }, [])

  const selected = notes.find((note) => note.id === selectedId) ?? null
  const missing = !loading && selectedId !== null && selected === null
  const defaultPaper = normalizePaper(settings.journalPaper ?? undefined)

  useEffect(() => {
    if (!missing) return undefined
    const timer = setTimeout(() => setSelectedId(null), MISSING_GRACE_MS)
    return () => clearTimeout(timer)
  }, [missing, setSelectedId])

  const failed = (message) => (caught) => {
    console.error(message, caught)
    pushError(message)
  }

  /* ------------------------------------------------------------- actions -- */

  function createAndOpen(draft) {
    if (!actions) return
    const { id, committed } = actions.createNote(draft)
    committed.catch(failed('Could not create the note.'))
    setSelectedId(id)
  }

  function openToday() {
    const key = todayKey()
    const existing = findNoteForDay(notes, key)
    if (existing) setSelectedId(existing.id)
    else createAndOpen({ title: formatFullDayLabel(key), dayKey: key })
  }

  function pin(note) {
    actions?.updateNoteMeta(note.id, { pinned: !note.pinned }).catch(failed('Could not pin the note.'))
  }

  function trash(note) {
    if (!actions) return
    actions.trashNote(note.id).catch(failed('Could not move the note to the trash.'))
    if (selectedId === note.id) setSelectedId(null)
    pushUndo(`Moved “${noteDisplayTitle(note)}” to the trash.`, () => {
      actions.restoreNote(note.id).catch(failed('Could not restore the note.'))
      setSelectedId(note.id)
    })
  }

  function restore(note) {
    actions?.restoreNote(note.id).catch(failed('Could not restore the note.'))
  }

  function purge(note) {
    actions?.purgeNote(note.id).catch(failed('Could not delete the note.'))
  }

  function emptyTrash() {
    actions?.emptyTrash(trashed.map((note) => note.id)).catch(failed('Could not empty the trash.'))
  }

  function useForNewNotes(paper) {
    updateSetting('journalPaper', paper)
    pushSuccess('New notes will start on this paper.')
  }

  /* The command palette asks for a new note by leaving an intent here, because
     this view may not exist yet when it does (it is lazy-loaded). Handled once
     the list has loaded, then cleared so a later visit does not repeat it. */
  const runIntent = useRef(null)
  useEffect(() => {
    runIntent.current = () => {
      if (intent === 'new') createAndOpen({})
      onIntentHandled?.()
    }
  })
  useEffect(() => {
    if (intent && !loading && actions) runIntent.current()
  }, [intent, loading, actions])

  /* --------------------------------------------------------------- render -- */

  let main
  if (selected) {
    main = (
      <NoteEditor
        key={selected.id}
        note={selected}
        actions={actions}
        defaultPaper={defaultPaper}
        onBack={() => setSelectedId(null)}
        onPin={() => pin(selected)}
        onTrash={() => trash(selected)}
        onUseForNew={useForNewNotes}
        listHidden={listHidden}
        onToggleList={() => setListHidden(!listHidden)}
      />
    )
  } else if (selectedId !== null && (loading || missing)) {
    main = <NoteSkeleton />
  } else {
    // The list beside it has New note and Today; saying so again here, under a
    // second "Journal", was the same page offering the same two buttons twice.
    main = (
      <div className="journal__empty">
        <p className="journal__empty-text">Select a note, or start a new one.</p>
      </div>
    )
  }

  return (
    <div
      className="journal frame"
      data-note-open={selected || (selectedId !== null && !loading) ? 'true' : 'false'}
      data-list-hidden={listHidden ? 'true' : 'false'}
    >
      <div className="journal__layout">
        <NoteList
          notes={notes}
          trashed={trashed}
          selectedId={selectedId}
          loading={loading}
          error={error}
          onSelect={setSelectedId}
          onNew={() => createAndOpen({})}
          onToday={openToday}
          onRestore={restore}
          onPurge={purge}
          onEmptyTrash={emptyTrash}
        />
        <div className="journal__main">{main}</div>
      </div>
    </div>
  )
}
