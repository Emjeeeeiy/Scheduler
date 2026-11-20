import { useEffect, useRef, useState } from 'react'
import { isValidKey, todayKey } from '@cadence/shared/date.js'
import { dayNoteDraft, findNoteForDay, noteDisplayTitle, normalizePaper } from '@cadence/shared/journal.js'
import { loadJournalFonts } from '../../lib/journalFonts.js'
import { usePersistentState } from '../../lib/usePersistentState.js'
import { useSettings } from '../../state/SettingsContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { useJournalActions, useJournalNotes } from '../../state/useJournal.js'
import { NoteDayPanel } from '../journal/NoteDayPanel.jsx'
import { NoteEditor, NoteSkeleton } from '../journal/NoteEditor.jsx'
import { NoteScheduleToolsProvider } from '../journal/NoteScheduleTools.jsx'
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
 * A note can belong to a day (its `dayKey`). That is the Journal's link to the
 * schedule, both ways: the calendar's "Open journal" buttons arrive here as an
 * intent naming a day (openDay finds or starts its note), and a day note shows
 * that day's tasks and events, with the way back to it (NoteDayPanel) — which
 * is why the item editors and the date cursor are passed in from App.jsx.
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

export function JournalView({ intent = null, onIntentHandled, onFocusDay, onEdit, onEditEvent }) {
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

  /* A day asked for before the list has loaded waits here. Answering it from an
     empty list would find no note for the day and start a second one — so
     pressing Today in the moment before the first snapshot used to do exactly
     that. Run once the list is in (below). */
  const [pendingDay, setPendingDay] = useState(null)

  /** The day's note — the one already written for it, or a new one titled with
      the date. A note belongs to a day by its `dayKey`, never by its title, so
      a renamed day note is still found. */
  function openDay(key) {
    if (loading || !actions) {
      setPendingDay(key)
      return
    }
    const existing = findNoteForDay(notes, key)
    if (existing) setSelectedId(existing.id)
    else createAndOpen(dayNoteDraft(key))
  }

  const openToday = () => openDay(todayKey())

  const runPendingDay = useRef(null)
  useEffect(() => {
    runPendingDay.current = () => {
      setPendingDay(null)
      openDay(pendingDay)
    }
  })
  useEffect(() => {
    if (pendingDay && !loading && actions) runPendingDay.current()
  }, [pendingDay, loading, actions])

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

  /* What the list's multi-select does. One note is just the single case, so it
     goes through pin and trash above and behaves exactly like them. Several are
     one atomic write (useJournalActions) with one toast: a toast per note, or an
     Undo that brought back only the last, would make "Delete 4" a lot to clean up. */
  function pinMany(list) {
    if (!actions || list.length === 0) return
    if (list.length === 1) {
      pin(list[0])
      return
    }
    // All pinned already means the person is undoing that; anything else pins the lot.
    const pinned = !list.every((note) => note.pinned)
    actions.pinNotes(list.map((note) => note.id), pinned).catch(failed('Could not pin the notes.'))
    pushSuccess(`${pinned ? 'Pinned' : 'Unpinned'} ${list.length} notes.`)
  }

  function trashMany(list) {
    if (!actions || list.length === 0) return
    if (list.length === 1) {
      trash(list[0])
      return
    }
    const ids = list.map((note) => note.id)
    actions.trashNotes(ids).catch(failed('Could not move the notes to the trash.'))
    if (ids.includes(selectedId)) setSelectedId(null)
    pushUndo(`Moved ${ids.length} notes to the trash.`, () => {
      actions.restoreNotes(ids).catch(failed('Could not restore the notes.'))
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

  /* The rest of the app asks for something here by leaving an intent, because
     this view may not exist yet when it does (it is lazy-loaded): 'new' (the
     palette's New note) or { kind: 'day', dayKey } (a day's "Open journal",
     the palette's day-note command, the `j` shortcut). Handled once the list
     has loaded, then cleared so a later visit does not repeat it. */
  const runIntent = useRef(null)
  useEffect(() => {
    runIntent.current = () => {
      if (intent === 'new') createAndOpen({})
      else if (intent?.kind === 'day' && isValidKey(intent.dayKey)) openDay(intent.dayKey)
      onIntentHandled?.()
    }
  })
  useEffect(() => {
    if (intent && !loading && actions) runIntent.current()
  }, [intent, loading, actions])

  /* --------------------------------------------------------------- render -- */

  let main
  if (selected) {
    /* The schedule's side of this note — Plan it, Send to schedule, and what the
       day band can do (NoteScheduleTools). Keyed with the note so a plan, or an
       answer still on its way, never carries over to the next one. */
    main = (
      <NoteScheduleToolsProvider key={selected.id} dayKey={selected.dayKey}>
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
          dayPanel={
            selected.dayKey ? (
              <NoteDayPanel
                dayKey={selected.dayKey}
                onFocusDay={onFocusDay}
                onEdit={onEdit}
                onEditEvent={onEditEvent}
              />
            ) : null
          }
        />
      </NoteScheduleToolsProvider>
    )
  } else if (selectedId !== null && (loading || missing)) {
    main = <NoteSkeleton />
  } else {
    // The list beside it has New note and Today; saying so again here, under a
    // second "Journal", was the same page offering the same two buttons twice.
    // The one thing added is a line about what the page is for — planning the
    // day — above the instruction. Unattributed on purpose: it is the app's own
    // sentence, and a name under it would claim a source it does not have.
    main = (
      <div className="journal__empty">
        <blockquote className="journal__quote">
          <p>“Plan your day in your journal, and the day will follow.”</p>
        </blockquote>
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
          onPin={pin}
          onTrash={trash}
          onPinMany={pinMany}
          onTrashMany={trashMany}
          onRestore={restore}
          onPurge={purge}
          onEmptyTrash={emptyTrash}
        />
        <div className="journal__main">{main}</div>
      </div>
    </div>
  )
}
