import { useRef } from 'react'
import { useModalA11y } from '../../lib/useModalA11y.js'
import {
  LAST_UPDATED,
  PRIVACY_SECTIONS,
  TERMS_SECTIONS,
  TERMS_VERSION,
} from '../../lib/legalContent.js'
import { CloseIcon } from '../icons.jsx'

/* The two legal documents, in one dialog. Both are read-only, so the only
   things a keyboard or screen-reader user can act on are the close button and
   the link to the other document — both in or near the head/foot, not buried
   in the scroll. useModalA11y gives this the same focus trap, Escape, phone
   Back, bottom sheet and focus restore as every other dialog in the app. */
export function LegalModal({ kind, onClose, onNavigate }) {
  const panelRef = useRef(null)
  const isTerms = kind === 'terms'
  const title = isTerms ? 'Terms of Service' : 'Privacy Policy'
  const sections = isTerms ? TERMS_SECTIONS : PRIVACY_SECTIONS
  const other = isTerms ? 'privacy' : 'terms'
  const otherTitle = isTerms ? 'Privacy Policy' : 'Terms of Service'

  useModalA11y(panelRef, { onClose })

  return (
    <div className="modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} className="modal__panel legal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__head">
          <h2 className="modal__title">{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="legal__body">
          <p className="legal__meta">Last updated {LAST_UPDATED} · Version {TERMS_VERSION}</p>
          {sections.map((section) => (
            <section key={section.id} className="legal__section">
              <h3 className="legal__heading">{section.heading}</h3>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="legal__paragraph">{paragraph}</p>
              ))}
            </section>
          ))}
        </div>

        <div className="modal__foot">
          <button type="button" className="link-button" onClick={() => onNavigate(other)}>
            Read the {otherTitle}
          </button>
          <span className="modal__spacer" />
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
