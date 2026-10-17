import { ViewSkeleton } from './ViewSkeleton.jsx'

/** What the auth gate renders while the session check runs — the app shell's
    own silhouette (rail + content) so a refresh reads as the app arriving
    rather than a dead page with one line of text.
 *
 * The content half is not generic. It hands `view` to ViewSkeleton, so the
    area where the page will appear is already that page's own layout: the
    week arrives as seven columns, the month as a five-by-seven grid. The rail
 * is drawn here rather than borrowed from the shell, because the shell's nav
 * depends on the session (the footer is an account menu that doesn't exist
 * yet), and a rail that guessed would be wrong either way.
 *
 * Every shape is aria-hidden; the wrapper announces the status instead. Removed
 * the moment Gate resolves, so there is nothing to keep in sync. */
export function SessionSkeleton({ view }) {
  return (
    <div className="session-skeleton">
      <div className="session-skeleton__rail" aria-hidden="true">
        <div className="session-skeleton__brand">
          <span className="skel skel--mark" />
          <span className="skel skel--brand-name" />
        </div>
        <span className="skel session-skeleton__action" />
        <div className="session-skeleton__nav">
          <span className="skel" />
          <span className="skel" />
          <span className="skel" />
        </div>
        <div className="session-skeleton__spacer" />
        <div className="session-skeleton__foot">
          <span className="skel skel--mark" />
          <span className="skel skel--brand-name" />
        </div>
      </div>
      <div className="session-skeleton__main">
        <ViewSkeleton view={view} label="Checking your session" />
      </div>
    </div>
  )
}