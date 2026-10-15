/* Where the gaps in a day actually are.
 *
 * The day view can show what is scheduled; the harder question a time-blocker
 * asks is the inverse — "where can this actually go?". Answering it means
 * merging everything already committed into busy runs and reporting what is
 * left, which is not the same as listing the gaps between consecutive items:
 * two overlapping meetings are one busy run, and a task nested wholly inside
 * a longer one must not appear to open a gap on either side of it.
 */

const DEFAULT_MIN_LENGTH = 30

/** Busy intervals from anything with a start and a length — tasks or timed
    single-day events, which are interchangeable here. */
export function busyIntervals(items) {
  return items
    .filter((item) => Number.isFinite(item.startMin) && Number.isFinite(item.durationMin))
    .map((item) => ({
      start: item.startMin,
      end: item.startMin + Math.max(0, item.durationMin),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end)
}

/**
 * @param items        scheduled things with startMin + durationMin
 * @param windowStart  first minute worth offering (the grid's own window)
 * @param windowEnd    last minute worth offering
 * @param minLength    ignore anything shorter than this
 * @return [{ startMin, endMin, lengthMin }]
 */
export function freeSlots(items, windowStart, windowEnd, minLength = DEFAULT_MIN_LENGTH) {
  if (!(windowEnd > windowStart)) return []

  const merged = []
  for (const interval of busyIntervals(items)) {
    // Clip to the window: a 5am block does not make 5am–7am "busy" on a grid
    // that starts at 7, and an overrun past the end cannot shorten the day.
    const start = Math.max(windowStart, interval.start)
    const end = Math.min(windowEnd, interval.end)
    if (end <= start) continue

    const last = merged[merged.length - 1]
    // Touching runs merge too: a block ending at 10:00 and one starting at
    // 10:00 leave no gap, and reporting a zero-length one would be noise.
    if (last && start <= last.end) last.end = Math.max(last.end, end)
    else merged.push({ start, end })
  }

  const slots = []
  let cursor = windowStart
  for (const run of merged) {
    if (run.start - cursor >= minLength) {
      slots.push({ startMin: cursor, endMin: run.start, lengthMin: run.start - cursor })
    }
    cursor = Math.max(cursor, run.end)
  }
  if (windowEnd - cursor >= minLength) {
    slots.push({ startMin: cursor, endMin: windowEnd, lengthMin: windowEnd - cursor })
  }

  return slots
}
