import { useId, useMemo, useState } from 'react'
import { matchesQuery, noteDisplayTitle } from '@cadence/shared/journal.js'
import { formatEdited } from '../../lib/journalFormat.js'
import { ChevronLeftIcon, PlusIcon, SearchIcon } from '../icons.jsx'
import { DrawingIcon, PushPinIcon } from './journalIcons.jsx'

/* The list of notes. Pure presentation — every action is a callback, so the list
   holds only what is local to browsing it (the query, whether the trash is open,
   which trash row is asking "really delete?").

   Top to bottom: a header (the name, and the two ways to start a note), a search
   field, the notes — a "Pinned" group first when anything is pinned — and at the
   foot a quiet way into the trash.

   What it no longer has, because the page said each twice: a count under the title
   (the list is the count), a row of All / Pinned / Trash chips (pinned notes already
   sort to the top, so they are a group, and the trash is a place rather than a
   filter), and a pin button on every row (a note is pinned from its own header). */

function NoteRow({ note, selected, onSelect }) {
  const title = noteDisplayTitle(note)
  return (
    <li className={`note-row${selected ? ' note-row--selected' : ''}`}>
      <button type="button" className="note-row__open" aria-current={selected ? 'true' : undefined} onClick={() => onSelect(note.id)}>
        <span className="note-row__top">
          <span className="note-row__title">
            {note.pinned ? (
              <>
                <PushPinIcon className="note-row__pin-mark" />
                <span className="visually-hidden">Pinned. </span>
              </>
            ) : null}
            <span className="note-row__name">{title}</span>
          </span>
          <span className="note-row__time">
            {formatEdited(note.updatedAt) || 'Just now'}
            {note.hasDrawing ? (
              <>
                <DrawingIcon className="note-row__glyph" />
                <span className="visually-hidden">Contains a drawing</span>
              </>
            ) : null}
          </span>
        </span>
        <span className="note-row__excerpt">{note.excerpt || 'No text yet'}</span>
      </button>
    </li>
  )
}

function TrashRow({ note, confirming, onAskPurge, onCancel, onRestore, onPurge }) {
  const title = noteDisplayTitle(note)
  return (
    <li className="note-row note-row--trash">
      <div className="note-row__open note-row__open--static">
        <span className="note-row__top">
          <span className="note-row__title">
            <span className="note-row__name">{title}</span>
          </span>
        </span>
        <span className="note-row__excerpt">Deleted {formatEdited(note.deletedAt) || 'just now'}</span>
      </div>
      <div className="note-row__actions">
        {confirming ? (
          <>
            <button type="button" className="danger-button danger-button--sm" onClick={() => onPurge(note)}>
              Delete forever
            </button>
            <button type="button" className="ghost-button ghost-button--sm" onClick={onCancel}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" className="ghost-button ghost-button--sm" onClick={() => onRestore(note)}>
              Restore
            </button>
            <button type="button" className="danger-button danger-button--sm" onClick={() => onAskPurge(note.id)}>
              Delete…
            </button>
          </>
        )}
      </div>
    </li>
  )
}

export function NoteList({
  notes,
  trashed,
  selectedId,
  loading,
  error,
  onSelect,
  onNew,
  onToday,
  onRestore,
  onPurge,
  onEmptyTrash,
}) {
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [trashOpen, setTrashOpen] = useState(false)
  const [confirming, setConfirming] = useState(null)
  const [confirmEmpty, setConfirmEmpty] = useState(false)

  /* Looking at the trash only means something while there is a trash. When the
     last note leaves it (restored, or deleted for good) there is nothing to look
     at, so the list is the notes again — and `trashOpen` is put back by the same
     handlers that emptied it, so the next note thrown away does not pop the trash
     open by itself. */
  const inTrash = trashOpen && trashed.length > 0
  const lastInTrash = trashed.length <= 1

  const searching = query.trim() !== ''
  const matching = useMemo(
    () => (inTrash ? trashed : notes).filter((note) => matchesQuery(note, query)),
    [inTrash, notes, trashed, query],
  )

  /* Groups only when they say something: some notes pinned, some not, and nobody
     searching. `notes` is already sorted pinned-first, so filtering keeps order. */
  const groups = useMemo(() => {
    if (inTrash || searching) return null
    const pinned = matching.filter((note) => note.pinned)
    if (pinned.length === 0) return null
    return [
      { id: 'pinned', label: 'Pinned', items: pinned },
      // Not "Notes": that is the list's own name, one line above.
      { id: 'recent', label: 'Recent', items: matching.filter((note) => !note.pinned) },
    ].filter((group) => group.items.length > 0)
  }, [inTrash, searching, matching])

  function enterTrash() {
    setTrashOpen(true)
    setQuery('')
    setConfirming(null)
    setConfirmEmpty(false)
  }

  function leaveTrash() {
    setTrashOpen(false)
    setQuery('')
    setConfirming(null)
    setConfirmEmpty(false)
  }

  const renderRow = (note) =>
    inTrash ? (
      <TrashRow
        key={note.id}
        note={note}
        confirming={confirming === note.id}
        onAskPurge={setConfirming}
        onCancel={() => setConfirming(null)}
        onRestore={(n) => {
          if (lastInTrash) setTrashOpen(false)
          onRestore(n)
        }}
        onPurge={(n) => {
          setConfirming(null)
          if (lastInTrash) setTrashOpen(false)
          onPurge(n)
        }}
      />
    ) : (
      <NoteRow key={note.id} note={note} selected={note.id === selectedId} onSelect={onSelect} />
    )

  return (
    <section className="note-list" aria-label={inTrash ? 'Trash' : 'Notes'}>
      {inTrash ? (
        <div className="note-list__head">
          <button type="button" className="ghost-button ghost-button--sm note-list__back" onClick={leaveTrash}>
            <ChevronLeftIcon className="button-icon" /> Notes
          </button>
          {confirmEmpty ? (
            <span className="note-row__actions">
              <button
                type="button"
                className="danger-button danger-button--sm"
                onClick={() => {
                  setConfirmEmpty(false)
                  setTrashOpen(false)
                  onEmptyTrash()
                }}
              >
                Delete all forever
              </button>
              <button type="button" className="ghost-button ghost-button--sm" onClick={() => setConfirmEmpty(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" className="danger-button danger-button--sm" onClick={() => setConfirmEmpty(true)}>
              Empty trash…
            </button>
          )}
        </div>
      ) : (
        <div className="note-list__head">
          <h2 className="section-head__title">Notes</h2>
          <div className="note-list__actions">
            <button type="button" className="ghost-button ghost-button--sm" onClick={onToday} title="Open today’s note, or start one">
              Today
            </button>
            <button type="button" className="primary-button primary-button--sm" onClick={onNew}>
              <PlusIcon className="button-icon" /> New note
            </button>
          </div>
        </div>
      )}

      <div className="note-list__search">
        <label className="visually-hidden" htmlFor={searchId}>
          {inTrash ? 'Search the trash' : 'Search notes'}
        </label>
        <SearchIcon className="note-list__search-icon" />
        <input
          id={searchId}
          type="search"
          className="input"
          placeholder={inTrash ? 'Search the trash' : 'Search notes'}
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {error ? (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      ) : null}

      {inTrash ? <p className="field__hint note-list__hint">Deleted notes stay here until you delete them forever.</p> : null}

      <div className="note-list__body">
        {!loading && matching.length === 0 ? (
          <p className="empty empty--sm">
            {searching
              ? 'No notes match that search.'
              : inTrash
                ? 'The trash is empty.'
                : 'No notes yet. Start one with New note.'}
          </p>
        ) : groups ? (
          groups.map((group) => (
            <div key={group.id} className="note-list__group">
              <h3 className="note-list__label">{group.label}</h3>
              <ul className="note-list__items">{group.items.map(renderRow)}</ul>
            </div>
          ))
        ) : (
          <ul className="note-list__items">{matching.map(renderRow)}</ul>
        )}
      </div>

      {!inTrash && trashed.length > 0 ? (
        <div className="note-list__foot">
          <button type="button" className="note-list__trash-link" onClick={enterTrash}>
            Trash · {trashed.length}
          </button>
        </div>
      ) : null}
    </section>
  )
}
