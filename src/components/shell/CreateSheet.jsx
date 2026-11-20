import { useRef } from 'react'
import { useModalA11y } from '../../lib/useModalA11y.js'
import { BulbIcon, CloseIcon, JournalIcon, PlusIcon, SpanIcon } from '../icons.jsx'

/** What the bottom bar's centre + offers: the four things you start from nothing,
    in one place a thumb reaches. New task used to be one tap further, inside the
    avatar's menu, and a new event, a new note and Ask AI were reachable only
    through the command palette or a page that happened to carry the button.

    A sheet like every other dialog on a phone (modals.css), so it gets the
    shared behaviour with nothing of its own: focus into it, Escape, Back and a
    swipe down all close it (useModalA11y). Choosing a row closes it first and then
    runs the action, which usually opens another dialog — the back stack settles a
    hand-over like that in one update, so history sees nothing. */
export function CreateSheet({ onClose, onNewTask, onNewEvent, onNewNote, onAskAi, emailVerified }) {
  const panelRef = useRef(null)
  useModalA11y(panelRef, { onClose })

  const rows = [
    { key: 'task', Icon: PlusIcon, label: 'New task', detail: 'Something to get done', run: onNewTask },
    { key: 'event', Icon: SpanIcon, label: 'New event', detail: 'Something that happens, over one day or several', run: onNewEvent },
    { key: 'note', Icon: JournalIcon, label: 'New note', detail: 'Write in the Journal', run: onNewNote },
    {
      key: 'ai',
      Icon: BulbIcon,
      label: 'Ask AI',
      // Still opens the chat when unconfirmed: that is where the explanation and
      // the "Resend email" button are.
      detail: emailVerified ? 'Describe it, AI schedules it' : 'Confirm your email to use',
      run: onAskAi,
    },
  ]

  return (
    <div className="modal modal--create" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} className="modal__panel create-sheet" role="dialog" aria-modal="true" aria-label="Create">
        <div className="modal__head">
          <h2 className="modal__title">Create</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <ul className="create-sheet__list">
          {rows.map(({ key, Icon, label, detail, run }) => (
            <li key={key}>
              <button
                type="button"
                className="create-sheet__row"
                onClick={() => {
                  onClose()
                  run()
                }}
              >
                <Icon className="create-sheet__icon" />
                <span className="create-sheet__text">
                  <span className="create-sheet__label">{label}</span>
                  <span className="create-sheet__detail">{detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
