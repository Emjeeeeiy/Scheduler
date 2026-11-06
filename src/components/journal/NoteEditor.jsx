import { useNoteBody } from '../../state/useJournal.js'
import { WarningIcon } from '../icons.jsx'
import { NoteSurface } from './NoteSurface.jsx'

/* Decides whether the editor may open on this note at all.
 *
 * The one case worth the extra branch is the offline trap. A body that is
 * missing from a cache-only read does not mean the note is empty — it may simply
 * never have been downloaded on this device (written elsewhere, opened here for
 * the first time with no connection). Opening an editor on that "empty" page
 * would let someone type over text that is safely stored but not yet visible,
 * and the next save would replace it. The list's metadata knows better: it says
 * how many bytes the body holds, so a note that should have content but shows
 * none is held back until the real body arrives.
 */

// A new note's body is the empty document, 46 bytes of JSON. Anything clearly
// larger has had text written to it.
const EMPTY_NOTE_BYTES = 64

function Message({ tone = 'note', title, children }) {
  return (
    <div className="note-surface note-surface--message">
      <div className={`banner banner--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
        <WarningIcon className="banner__icon" />
        <span className="banner__text">
          <strong>{title}</strong> {children}
        </span>
      </div>
    </div>
  )
}

/** The page while a note is being opened — also what the view shows for the
    moment between choosing a note and its metadata arriving. */
export function NoteSkeleton() {
  return (
    <div className="note-surface note-surface--loading" role="status" aria-label="Opening note">
      <span className="skel skel--section-title skel--section-title--wide" />
      <span className="skel skel--input" />
      <span className="skel note-skeleton__sheet" />
    </div>
  )
}

export function NoteEditor({ note, actions, defaultPaper, onBack, onPin, onTrash, onUseForNew, listHidden, onToggleList }) {
  const bodyState = useNoteBody(note.id)

  if (bodyState.loading) return <NoteSkeleton />

  if (bodyState.error) {
    return (
      <Message tone="error" title="Couldn’t open this note.">
        {bodyState.error}
      </Message>
    )
  }

  if (!bodyState.exists && bodyState.fromCache && note.bytes > EMPTY_NOTE_BYTES) {
    return (
      <Message title="This note isn’t on this device yet.">
        Connect to the internet and it will open — it’s kept closed until then so nothing can be typed over it.
      </Message>
    )
  }

  return (
    <NoteSurface
      key={note.id}
      note={note}
      bodyState={bodyState}
      actions={actions}
      defaultPaper={defaultPaper}
      onBack={onBack}
      onPin={onPin}
      onTrash={onTrash}
      onUseForNew={onUseForNew}
      listHidden={listHidden}
      onToggleList={onToggleList}
    />
  )
}
