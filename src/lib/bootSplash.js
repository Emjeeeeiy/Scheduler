/* Dismisses index.html's boot splash (brand mark + animated Cadence title)
   once React has painted its first frame. Fades out over CSS, then removes
   the node — under prefers-reduced-motion it is removed immediately with no
   fade. Safe to call when the splash is already gone (returns false). */

export const BOOT_SPLASH_ID = 'boot-splash'
export const BOOT_SPLASH_HIDE_CLASS = 'boot-splash--hide'
const HIDE_MS = 300

function reduceMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
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
  el.classList.add(BOOT_SPLASH_HIDE_CLASS)
  setTimeout(() => el.remove(), HIDE_MS)
  return true
}
