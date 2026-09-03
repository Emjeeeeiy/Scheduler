/* "Find me a slot": given how long a task needs, where could it actually go?
 *
 * Reuses the exact primitives the Day view already shows on screen —
 * visibleWindow decides what a day's own reasonable hours look like,
 * freeSlots finds the gaps in it — so a suggestion here is never a place the
 * Day view itself wouldn't also call free. Kept pure: the caller supplies
 * `dayItems(key)` (whatever ScheduleContext considers busy that day) rather
 * than this module reaching into ScheduleContext itself.
 */

import { addDays } from './date.js'
import { visibleWindow } from './layout.js'
import { freeSlots } from './slots.js'

const DEFAULT_LOOKAHEAD_DAYS = 14
const DEFAULT_LIMIT = 3

/** Whether a working-hours setting is actually usable, not just present —
    same guard TodayView's own free-slot finder applies. */
function hasWorkingHours(workingHours) {
  return (
    Number.isFinite(workingHours?.startMin) &&
    Number.isFinite(workingHours?.endMin) &&
    workingHours.endMin > workingHours.startMin
  )
}

/**
 * @param fromKey       first day to consider
 * @param durationMin   how long the task needs
 * @param dayItems      (key) => the day's scheduled tasks/events
 * @param lookaheadDays how many days forward to search before giving up
 * @param workingHours  optional { startMin, endMin } narrowing every day's
 *                      own visible window, the same way Settings' working
 *                      hours narrows the Day view's free-slot finder
 * @param limit         how many suggestions to return
 * @return [{ date, startMin }] — earliest first, at most `limit`
 */
export function suggestSlots({
  fromKey,
  durationMin,
  dayItems,
  lookaheadDays = DEFAULT_LOOKAHEAD_DAYS,
  workingHours = null,
  limit = DEFAULT_LIMIT,
}) {
  if (!Number.isFinite(durationMin) || durationMin <= 0) return []

  const suggestions = []
  for (let i = 0; i < lookaheadDays && suggestions.length < limit; i++) {
    const key = addDays(fromKey, i)
    const items = dayItems(key)
    const [dayStart, dayEnd] = visibleWindow(items)
    const windowStart = hasWorkingHours(workingHours) ? Math.max(dayStart, workingHours.startMin) : dayStart
    const windowEnd = hasWorkingHours(workingHours) ? Math.min(dayEnd, workingHours.endMin) : dayEnd

    for (const gap of freeSlots(items, windowStart, windowEnd, durationMin)) {
      if (suggestions.length >= limit) break
      suggestions.push({ date: key, startMin: gap.startMin })
    }
  }
  return suggestions
}
