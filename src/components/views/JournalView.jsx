import { useEffect, useRef } from 'react'
import { formatFullDayLabel, todayKey } from '@cadence/shared/date.js'
import { findNoteForDay, noteDisplayTitle, normalizePaper } from '@cadence/shared/journal.js'
import { loadJournalFonts } from '../../lib/journalFonts.js'
import { usePersistentState } from '../../lib/usePersistentState.js'
import { useSettings } from '../../state/SettingsContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { useJournalActions, useJournalNotes } from '../../state/useJournal.js'
import { FrameTicks } from '../shell/FrameTicks.jsx'
import { NoteEditor, NoteSkeleton } from '../journal/NoteEditor.jsx'
import { NoteList } from '../journal/NoteList.jsx'
import '../../styles/journal.css'

/* The Journal page: a list of notes beside the one that is open.
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

// Below this width the sidebar, the list and the page can't all be comfortable,
// so until the writer chooses, an open note gets the room and the list steps aside.
const AUTO_HIDE_LIST_BELOW = 1500

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
  // null = no choice made yet (follow the screen width); true/false = the writer's own.
  const [chosenHidden, setChosenHidden] = usePersistentState(LIST_HIDDEN_KEY, null, (stored) =>
    typeof stored === 'boolean' ? stored : null,
  )
  const listHidden = chosenHidden ?? (typeof window !== 'undefined' && window.innerWidth < AUTO_HIDE_LIST_BELOW)

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
        onToggleList={() => setChosenHidden(!listHidden)}
      />
    )
  } else if (selectedId !== null && (loading || missing)) {
    main = <NoteSkeleton />
  } else {
    main = (
      <div className="journal__empty">
        <h3 className="journal__empty-title">Your journal</h3>
        <p className="journal__empty-text">Pick a note from the list, or start a new one.</p>
        <div className="journal__empty-actions">
          <button type="button" className="primary-button" onClick={() => createAndOpen({})}>
            New note
          </button>
          <button type="button" className="ghost-button" onClick={openToday}>
            Today
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="journal frame"
      data-note-open={selected || (selectedId !== null && !loading) ? 'true' : 'false'}
      data-list-hidden={listHidden ? 'true' : 'false'}
    >
      <FrameTicks />
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
          onPin={pin}
          onRestore={restore}
          onPurge={purge}
          onEmptyTrash={emptyTrash}
        />
        <div className="journal__main">{main}</div>
      </div>
    </div>
  )
}
