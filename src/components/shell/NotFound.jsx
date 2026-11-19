import { useEffect } from 'react'
import { ClockIcon } from '../icons.jsx'
import { DotField } from './DotField.jsx'

/* Long enough for any real address, short enough that a pasted junk URL cannot
   take over the page. Clipped by code point so an emoji is never cut in half. */
const MAX_PATH_CHARS = 60

function clipPath(path) {
  const chars = [...path]
  return chars.length > MAX_PATH_CHARS ? `${chars.slice(0, MAX_PATH_CHARS).join('')}…` : path
}

/** What a visitor sees at an address the app does not have (see `isAppPath`).
    It is the sign-in screen's own frame — the same topbar and rule, no boxes —
    with the dot field behind a centred message and the app's one primary action.
    It needs no session and no Firebase, which is why App renders it before
    either: a broken link must not first ask you to sign in. */
export function NotFound({ path }) {
  /* index.html's static <title> would win over a <title> rendered here, so the
     tab is retitled by hand and put back on the way out. */
  useEffect(() => {
    const previous = document.title
    document.title = 'Page not found · Cadence'
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <div className="auth-shell not-found">
      <header className="auth-topbar">
        <div className="auth-topbar__brand">
          <ClockIcon className="auth-hero__mark" />
          <span className="auth-hero__name">Cadence</span>
        </div>
      </header>

      <main className="not-found__body">
        <DotField />
        <div className="not-found__content">
          <p className="not-found__code">404</p>
          <h1 className="not-found__title">Nothing is scheduled here.</h1>
          <p className="not-found__lead">
            There is no page at <code className="not-found__path">{clipPath(path)}</code>. It may
            have moved, or the link has a typo.
          </p>
          {/* A plain link, not a button: there is no router, so going home is a
              real navigation, and middle-click and "copy link" work as they should. */}
          <a className="primary-button primary-button--lg not-found__home" href="/">
            Back to Cadence
          </a>
        </div>
      </main>
    </div>
  )
}
