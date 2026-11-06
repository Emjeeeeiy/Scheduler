import { useRef } from 'react'
import { useModalA11y } from '../../lib/useModalA11y.js'
import { CloseIcon } from '../icons.jsx'
import { SHORTCUTS, SHORTCUT_GROUPS, formatKeys } from './shortcuts.js'

/* Every shortcut, written from the same table the toolbar tooltips read — so
   what this sheet says is what the buttons say. A dialog like the rest of the
   app's (focus trap, Escape, focus restored to whatever opened it). */
export function ShortcutsHelp({ onClose }) {
  const panelRef = useRef(null)
  useModalA11y(panelRef, { onClose })

  return (
    <div
      className="modal"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      // The app's single-key shortcuts (n for a new task…) listen on window and
      // know nothing about this dialog. Escape and Tab are left to the modal
      // hook, which listens there too; everything else stops here.
      onKeyDown={(event) => {
        if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation()
      }}
    >
      <div ref={panelRef} className="modal__panel shortcuts" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div className="modal__head">
          <h2 className="modal__title">Keyboard shortcuts</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="shortcuts__body">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} className="shortcuts__group">
              <h3 className="shortcuts__title">{group.title}</h3>
              <dl className="shortcuts__list">
                {group.items.map(([label, id]) => (
                  <div key={id} className="shortcuts__row">
                    <dt>{label}</dt>
                    <dd>
                      <kbd>{formatKeys(SHORTCUTS[id])}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
