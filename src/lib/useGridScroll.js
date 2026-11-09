import { useLayoutEffect } from 'react'
import { DEFAULT_WINDOW_START } from '@cadence/shared/layout.js'

/* A grid that shows the whole day is 24 hours tall, and a grid that opens at
   midnight would start the day's reader in front of seven hours of nothing. So
   the grid is its own scroll area, and it opens at the hour that matters. */

/** The minute a day's grid should open near: right now for today, otherwise the
    first thing scheduled (a day's reader is looking for what is in it), otherwise
    the start of a normal day. `items` are anything with a clock time. */
export function gridOpenMinute({ isToday, nowMin, items }) {
  if (isToday) return nowMin
  const starts = items.filter((item) => Number.isFinite(item.startMin)).map((item) => item.startMin)
  return starts.length > 0 ? Math.min(...starts) : DEFAULT_WINDOW_START
}

/** How far down a grid the minute `minute` is, leaving an hour above it for
    context. Pure, so the arithmetic is testable without a browser. */
export function gridScrollTop({ minute, windowStart, hourHeight, leadMin = 60 }) {
  return Math.max(0, Math.round(((minute - leadMin - windowStart) / 60) * hourHeight))
}

/**
 * Scrolls `ref`'s element so `minute` sits an hour from its top — once for each
 * `resetKey`, not on every render. The key is "which page am I looking at" (a day,
 * a week, grid or agenda); a clock tick or an edit must never yank the grid out
 * from under a reader who has scrolled it, so the minute is read when the page
 * changes and is otherwise ignored.
 */
export function useGridScroll(ref, { minute, windowStart, hourHeight, resetKey }) {
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    element.scrollTop = gridScrollTop({ minute, windowStart, hourHeight })
    // Deliberately keyed on the page alone — see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])
}
