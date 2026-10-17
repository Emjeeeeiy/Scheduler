/* Dismisses index.html's boot splash (the clock mark's single turn, then the
   rising word mark) once React has painted its first frame. It holds first,
   until the splash's own deadline has passed, so the hand turn and the last
   letter are never cut off mid-flight — then fades out over CSS and removes
   the node. Under prefers-reduced-motion nothing animates, so it is removed
   immediately with no hold and no fade. Safe to call when the splash is
   already gone (returns false). */

export const BOOT_SPLASH_ID = 'boot-splash'
export const BOOT_SPLASH_HIDE_CLASS = 'boot-splash--hide'
const HIDE_MS = 300
/* Mirrors #boot-splash's --boot-settle in index.html. The stylesheet is the
   source of truth; this only covers the case where it can't be read. */
const SETTLE_FALLBACK_MS = 1800

function reduceMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** How much of the splash animation is still owed, counted from navigation
    rather than from this call: the turn started when the head markup was
    parsed, so on a slow load the animation is already over by the time React
    mounts and there is nothing left to hold for. */
function holdMs(el, view) {
  let settle = SETTLE_FALLBACK_MS
  if (view && typeof view.getComputedStyle === 'function') {
    const declared = Number.parseFloat(
      view.getComputedStyle(el).getPropertyValue('--boot-settle'),
    )
    if (Number.isFinite(declared) && declared >= 0) settle = declared
  }
  const elapsed =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : 0
  return Math.max(0, settle - elapsed)
}

export function dismissBootSplash(
  doc = typeof document !== 'undefined' ? document : undefined,
) {
  const el = doc?.getElementById?.(BOOT_SPLASH_ID)
  if (!el) return false
  if (reduceMotion()) {
    el.remove()
    return true
  }
  const view = doc?.defaultView
  setTimeout(() => {
    const live = doc?.getElementById?.(BOOT_SPLASH_ID)
    if (!live) return
    live.classList.add(BOOT_SPLASH_HIDE_CLASS)
    setTimeout(() => live.remove(), HIDE_MS)
  }, holdMs(el, view))
  return true
}
