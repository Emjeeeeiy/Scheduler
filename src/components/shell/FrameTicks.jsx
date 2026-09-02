/** The four corner-tick marks that read as a `.frame`'s edge instead of a
    drawn border — originally the Auth Shell's own motif, now shared by every
    unboxed frame in the app. Render as the first child of a `position:
    relative` container. */
export function FrameTicks() {
  return (
    <>
      <span className="frame-tick frame-tick--tl" aria-hidden="true" />
      <span className="frame-tick frame-tick--tr" aria-hidden="true" />
      <span className="frame-tick frame-tick--bl" aria-hidden="true" />
      <span className="frame-tick frame-tick--br" aria-hidden="true" />
    </>
  )
}
