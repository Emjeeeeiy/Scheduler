import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { matchesQuery, noteDisplayTitle } from '@cadence/shared/journal.js'
import { BACK_RANK, useBackLayer } from '../../lib/useBackLayer.js'
import { formatEdited } from '../../lib/journalFormat.js'
import { useRowGestures } from '../../lib/useRowGestures.js'
import { CheckIcon, ChevronLeftIcon, PlusIcon, SearchIcon, TrashIcon } from '../icons.jsx'
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
   filter), and a pin button on every row (a note is pinned from its own header).

   Under a finger a row does two more things, and only for a finger (see
   lib/useRowGestures.js): swiping it left shows a trash button at its right, and
   swiping it right shows a pin button at its left; holding it starts choosing
   several, where the header becomes Cancel, a count, Pin and Delete. A button is
   never hidden *behind* a swipe's end — the swipe only shows it, so a slip of the
   thumb cannot delete anything. */

/* How long an action stays under a row that is sliding back, so it does not vanish
   before the row has covered it. A little over the slide's 180ms. */
const SETTLE_MS = 200

function NoteRow({
  note,
  selected,
  picking,
  picked,
  open,
  onSelect,
  onToggle,
  onOpenChange,
  onStartSwipe,
  onHold,
  onPin,
  onTrash,
}) {
  const title = noteDisplayTitle(note)
  const { offset, dragging, handlers } = useRowGestures({
    enabled: !picking,
    open,
    onOpenChange,
    onStart: onStartSwipe,
    onHold,
  })
  // Which action the slid-aside row is showing: its trash lies under the right
  // edge when it has moved left, its pin under the left edge when it has moved right.
  const side = offset < 0 ? 'trash' : offset > 0 ? 'pin' : null

  // The action is unmounted the moment the row is home, which would leave a blank
  // strip for the length of the slide. Hold the last one for the slide's duration.
  const [settling, setSettling] = useState(null)
  const lastSide = useRef(null)
  useEffect(() => {
    if (side) {
      lastSide.current = side
      return undefined
    }
    const was = lastSide.current
    if (!was) return undefined
    lastSide.current = null
    setSettling(was)
    const timer = setTimeout(() => setSettling(null), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [side])
  const shown = side ?? settling

  function onClick() {
    if (picking) onToggle(note.id)
    // A tap on a row that is open shuts it. Opening the note from under an action
    // the person has just revealed would be a second, unasked thing.
    else if (open) onOpenChange(null)
    else onSelect(note.id)
  }

  const pinLabel = `${note.pinned ? 'Unpin' : 'Pin'} “${title}”`

  return (
    <li
      className={[
        'note-row',
        selected ? 'note-row--selected' : '',
        picking ? 'note-row--picking' : '',
        picked ? 'note-row--picked' : '',
        shown ? 'note-row--slid' : '',
        dragging ? 'note-row--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {shown ? (
        <div className={`note-row__reveal note-row__reveal--${shown}`}>
          <button
            type="button"
            className="note-row__reveal-button"
            aria-label={shown === 'trash' ? `Delete “${title}”` : pinLabel}
            onClick={() => {
              onOpenChange(null)
              if (shown === 'trash') onTrash(note)
              else onPin(note)
            }}
          >
            {shown === 'trash' ? <TrashIcon className="note-row__reveal-icon" /> : <PushPinIcon className="note-row__reveal-icon" />}
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className="note-row__open"
        role={picking ? 'checkbox' : undefined}
        aria-checked={picking ? picked : undefined}
        aria-current={!picking && selected ? 'true' : undefined}
        style={offset ? { '--swipe': `${offset}px` } : undefined}
        onClick={onClick}
        {...handlers}
      >
        {picking ? (
          <span className="note-row__check" aria-hidden="true">
            {picked ? <CheckIcon className="note-row__check-mark" /> : null}
          </span>
        ) : null}
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
  onPin,
  onTrash,
  onPinMany,
  onTrashMany,
  onRestore,
  onPurge,
  onEmptyTrash,
}) {
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [trashOpen, setTrashOpen] = useState(false)
  const [confirming, setConfirming] = useState(null)
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  // The one row showing an action, as { id, side }. Owned here, not by the rows,
  // so opening one shuts the last and a tap anywhere else can shut it.
  const [openRow, setOpenRow] = useState(null)
  // The ids being chosen from, or null while nothing is being chosen.
  const [chosen, setChosen] = useState(null)

  /* Looking at the trash only means something while there is a trash. When the
     last note leaves it (restored, or deleted for good) there is nothing to look
     at, so the list is the notes again — and `trashOpen` is put back by the same
     handlers that emptied it, so the next note thrown away does not pop the trash
     open by itself. */
  const inTrash = trashOpen && trashed.length > 0
  const lastInTrash = trashed.length <= 1

  // Choosing is over when nothing chosen is left — the last one unticked, or the
  // notes themselves gone (purged on another device) — and it is not offered in the
  // trash, whose rows have their own buttons.
  const chosenNotes = useMemo(
    () => (chosen && !inTrash ? notes.filter((note) => chosen.includes(note.id)) : []),
    [chosen, inTrash, notes],
  )
  const picking = chosenNotes.length > 0
  const everyChosenPinned = picking && chosenNotes.every((note) => note.pinned)

  function startPicking(id) {
    setOpenRow(null)
    setChosen([id])
  }

  function togglePick(id) {
    setChosen((current) => {
      const next = (current ?? []).includes(id) ? current.filter((other) => other !== id) : [...(current ?? []), id]
      return next.length > 0 ? next : null
    })
  }

  function stopPicking() {
    setChosen(null)
  }

  // Back leaves choosing first, the way it closes anything else that is "up"
  // (lib/backStack.js); so does Escape, for a keyboard.
  useBackLayer(picking ? 'choosing' : null, stopPicking, BACK_RANK.gesture)
  useEffect(() => {
    if (!picking) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setChosen(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picking])

  // A row left open shuts on a tap anywhere but on it, and when the list scrolls.
  useEffect(() => {
    if (!openRow) return undefined
    const shut = () => setOpenRow(null)
    const onPointerDown = (event) => {
      if (!event.target.closest?.('.note-row--slid')) shut()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', shut, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', shut, true)
    }
  }, [openRow])

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
    setOpenRow(null)
    setChosen(null)
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
      <NoteRow
        key={note.id}
        note={note}
        selected={note.id === selectedId}
        picking={picking}
        picked={picking && chosen.includes(note.id)}
        open={openRow?.id === note.id ? openRow.side : null}
        onSelect={onSelect}
        onToggle={togglePick}
        onOpenChange={(side) => setOpenRow(side ? { id: note.id, side } : null)}
        onStartSwipe={() => setOpenRow(null)}
        onHold={() => startPicking(note.id)}
        onPin={onPin}
        onTrash={onTrash}
      />
    )

  return (
    <section className="note-list" aria-label={inTrash ? 'Trash' : 'Notes'}>
      {/* The title with its buttons, and the search: on a phone one block, pinned
          under the top bar while the notes scroll beneath it — a long list used to
          carry both off the top of the screen. `display: contents` elsewhere, so
          the two are exactly the loose siblings they were. */}
      <div className="note-list__top">
      {picking ? (
        <div className="note-list__head note-list__head--picking">
          <button type="button" className="ghost-button ghost-button--sm" onClick={stopPicking}>
            Cancel
          </button>
          <span className="note-list__picked" role="status">
            {chosenNotes.length} selected
          </span>
          <div className="note-list__actions">
            <button
              type="button"
              className="ghost-button ghost-button--sm note-list__act"
              onClick={() => {
                onPinMany(chosenNotes)
                stopPicking()
              }}
            >
              <PushPinIcon className="button-icon" /> {everyChosenPinned ? 'Unpin' : 'Pin'}
            </button>
            <button
              type="button"
              className="danger-button danger-button--sm note-list__act"
              onClick={() => {
                onTrashMany(chosenNotes)
                stopPicking()
              }}
            >
              <TrashIcon className="button-icon" /> Delete
            </button>
          </div>
        </div>
      ) : inTrash ? (
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
