import { useId, useMemo, useState } from 'react'
import { matchesQuery, noteDisplayTitle } from '@cadence/shared/journal.js'
import { formatEdited, noteCountLabel } from '../../lib/journalFormat.js'
import { PlusIcon, SearchIcon } from '../icons.jsx'
import { DrawingIcon, PushPinIcon } from './journalIcons.jsx'

/* The list of notes: search, a few filters, pinned first. Pure presentation —
   every action is a callback, so the list holds only what is local to browsing
   it (the query, the filter, which trash row is asking "really delete?"). */

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pinned', label: 'Pinned' },
  { id: 'trash', label: 'Trash' },
]

function NoteRow({ note, selected, onSelect, onPin }) {
  const title = noteDisplayTitle(note)
  return (
    <li className={`note-row${selected ? ' note-row--selected' : ''}`}>
      <button type="button" className="note-row__open" aria-current={selected ? 'true' : undefined} onClick={() => onSelect(note.id)}>
        <span className="note-row__title">{title}</span>
        <span className="note-row__excerpt">{note.excerpt || 'No text yet'}</span>
        <span className="note-row__meta">
          {formatEdited(note.updatedAt) || 'Just now'}
          {note.hasDrawing ? (
            <>
              {' · '}
              <DrawingIcon className="note-row__glyph" />
              <span className="visually-hidden">Contains a drawing</span>
            </>
          ) : null}
        </span>
      </button>
      <button
        type="button"
        className={`icon-button note-row__pin${note.pinned ? ' icon-button--on' : ''}`}
        aria-pressed={note.pinned}
        aria-label={note.pinned ? `Unpin ${title}` : `Pin ${title}`}
        onClick={() => onPin(note)}
      >
        <PushPinIcon />
      </button>
    </li>
  )
}

function TrashRow({ note, confirming, onAskPurge, onCancel, onRestore, onPurge }) {
  const title = noteDisplayTitle(note)
  return (
    <li className="note-row note-row--trash">
      <div className="note-row__open note-row__open--static">
        <span className="note-row__title">{title}</span>
        <span className="note-row__meta">Deleted {formatEdited(note.deletedAt) || 'just now'}</span>
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
  onPin,
  onRestore,
  onPurge,
  onEmptyTrash,
}) {
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [confirming, setConfirming] = useState(null)
  const [confirmEmpty, setConfirmEmpty] = useState(false)

  const pinnedCount = useMemo(() => notes.filter((n) => n.pinned).length, [notes])
  const visible = useMemo(() => {
    const source = filter === 'trash' ? trashed : filter === 'pinned' ? notes.filter((n) => n.pinned) : notes
    return source.filter((note) => matchesQuery(note, query))
  }, [notes, trashed, filter, query])

  const counts = { all: notes.length, pinned: pinnedCount, trash: trashed.length }
  const searching = query.trim() !== ''

  return (
    <section className="note-list" aria-label="Notes">
      <div className="section-head">
        <div>
          <h2 className="section-head__title">Journal</h2>
          <p className="section-head__sub">{loading ? 'Loading…' : noteCountLabel(notes.length)}</p>
        </div>
      </div>

      <div className="note-list__actions">
        <button type="button" className="primary-button" onClick={onNew}>
          <PlusIcon className="button-icon" /> New note
        </button>
        <button type="button" className="ghost-button" onClick={onToday} title="Open today’s note, or start one">
          Today
        </button>
      </div>

      <div className="note-list__search">
        <label className="visually-hidden" htmlFor={searchId}>
          Search notes
        </label>
        <SearchIcon className="note-list__search-icon" />
        <input
          id={searchId}
          type="search"
          className="input"
          placeholder="Search notes"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="filter-row" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`filter-chip${filter === f.id ? ' filter-chip--on' : ''}`}
            aria-pressed={filter === f.id}
            onClick={() => {
              setFilter(f.id)
              setConfirming(null)
              setConfirmEmpty(false)
            }}
          >
            {f.label}
            {counts[f.id] > 0 ? <span className="count-pill">{counts[f.id]}</span> : null}
          </button>
        ))}
      </div>

      {error ? (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      ) : null}

      {filter === 'trash' && trashed.length > 0 ? (
        <div className="note-list__trash-head">
          <p className="field__hint">Deleted notes stay here until you delete them forever.</p>
          {confirmEmpty ? (
            <span className="note-row__actions">
              <button
                type="button"
                className="danger-button danger-button--sm"
                onClick={() => {
                  setConfirmEmpty(false)
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
      ) : null}

      {!loading && visible.length === 0 ? (
        <p className="empty empty--sm">
          {searching
            ? 'No notes match that search.'
            : filter === 'trash'
              ? 'The trash is empty.'
              : filter === 'pinned'
                ? 'No pinned notes. Pin one to keep it at the top.'
                : 'No notes yet. Start one with New note.'}
        </p>
      ) : (
        <ul className="note-list__items">
          {visible.map((note) =>
            filter === 'trash' ? (
              <TrashRow
                key={note.id}
                note={note}
                confirming={confirming === note.id}
                onAskPurge={setConfirming}
                onCancel={() => setConfirming(null)}
                onRestore={onRestore}
                onPurge={(n) => {
                  setConfirming(null)
                  onPurge(n)
                }}
              />
            ) : (
              <NoteRow key={note.id} note={note} selected={note.id === selectedId} onSelect={onSelect} onPin={onPin} />
            ),
          )}
        </ul>
      )}
    </section>
  )
}
