/** What the auth gate renders while the session check runs — the app shell's
    own silhouette (rail + content) in shimmer blocks, so a refresh reads as
    the app arriving rather than a dead page with one line of text. Every
    shape is aria-hidden; the wrapper announces the status instead. Removed
    the moment Gate resolves, so there is nothing to keep in sync. */
export function SessionSkeleton() {
  return (
    <div className="session-skeleton" role="status" aria-label="Checking your session">
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
          <span className="skel" />
        </div>
        <div className="session-skeleton__spacer" />
        <div className="session-skeleton__foot">
          <span className="skel skel--mark" />
          <span className="skel skel--brand-name" />
        </div>
      </div>
      <div className="session-skeleton__main" aria-hidden="true">
        <div className="session-skeleton__head">
          <span className="skel session-skeleton__title" />
          <span className="skel session-skeleton__tabs" />
        </div>
        <div className="session-skeleton__cards">
          <span className="skel" />
          <span className="skel" />
          <span className="skel" />
        </div>
      </div>
    </div>
  )
}
