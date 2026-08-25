/* Lane packing for multi-day event bars.
 *
 * A row of the calendar is a fixed run of day columns — seven in the month
 * grid and the week's all-day strip, one in the day view's event rail. An
 * event that covers several of those days draws as a single bar spanning them,
 * and bars that overlap in time must stack into lanes so none is drawn over
 * another.
 *
 * The subtlety, and it is the exact inverse of layout.js's cluster note:
 * layoutDay resets its column bookkeeping between clusters, because a cluster
 * is a self-contained pile of overlapping blocks and the next one may reuse
 * the full width. A row here must NOT reset. A lane is a vertical offset
 * shared by the whole row, so if a Mon–Tue bar sits in lane 0 and a Wed–Fri
 * bar reuses lane 0 after it ends, that is correct and desirable — but the
 * lane index must be assigned against one running record for the entire row,
 * never restarted partway across it, or bars land at offsets that disagree
 * from one column to the next and the row reads as a staircase.
 *
 * An event is clipped to the row it is being packed into. One that started
 * before the row, or continues past it, reports that with a flag so the bar
 * can show where it carries on to, rather than pretending to begin or end at
 * the week boundary.
 */

import { daysBetween } from './date.js'

/**
 * @param rowKeys  the day keys of one row, in order (7 for a week, 1 for a day)
 * @param events   whole events overlapping the row — never per-day slices
 * @param contentBudget  how many rows of content a cell can show in total,
 *                       lanes and task chips together
 * @return { lanesUsed, segments, overflowByDay, chipBudget }
 */
export function packSpans(rowKeys, events, { contentBudget = 4 } = {}) {
  const empty = {
    lanesUsed: 0,
    segments: [],
    overflowByDay: rowKeys.map(() => 0),
    chipBudget: Math.max(1, contentBudget),
  }
  if (rowKeys.length === 0 || events.length === 0) return empty

  const rowStart = rowKeys[0]
  const rowEnd = rowKeys[rowKeys.length - 1]

  const segments = []
  for (const event of events) {
    // Day keys are strings so that clipping is a string comparison.
    if (event.startDate > rowEnd || event.endDate < rowStart) continue
    const segStart = event.startDate > rowStart ? event.startDate : rowStart
    const segEnd = event.endDate < rowEnd ? event.endDate : rowEnd
    segments.push({
      event,
      startIndex: daysBetween(rowStart, segStart),
      endIndex: daysBetween(rowStart, segEnd),
      continuesBefore: event.startDate < rowStart,
      continuesAfter: event.endDate > rowEnd,
    })
  }
  if (segments.length === 0) return empty

  /* Longest-first is what stops a week-long bar being pushed down to lane 3 by
     three one-day bars that merely happen to start earlier in the sort. The
     startDate tiebreak lets a bar that began in a previous week outrank one
     starting today at the same column, so a run of days stays visually
     continuous across the boundary between rows. */
  segments.sort(
    (a, b) =>
      a.startIndex - b.startIndex ||
      b.endIndex - b.startIndex - (a.endIndex - a.startIndex) ||
      a.event.startDate.localeCompare(b.event.startDate) ||
      a.event.id.localeCompare(b.event.id),
  )

  // First-fit, against one running record for the whole row — see the note above.
  const laneEnds = []
  for (const segment of segments) {
    let lane = laneEnds.findIndex((end) => end < segment.startIndex)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(segment.endIndex)
    } else {
      laneEnds[lane] = segment.endIndex
    }
    segment.lane = lane
  }

  /* Lanes are row-level: every cell in the row gives up the same number of
     rows to them, so bars stay aligned. Always leave at least one row for a
     day's own tasks — a cell showing only bars would hide the work entirely. */
  const lanesUsed = Math.max(0, Math.min(laneEnds.length, contentBudget - 1))
  const chipBudget = Math.max(1, contentBudget - lanesUsed)

  /* Overflow is counted per day, not per row: a hidden bar covering Mon–Wed is
     one more thing not shown on each of those three days. The cell adds this
     to its own hidden-task count so it can show one honest "+N more". */
  const overflowByDay = rowKeys.map(() => 0)
  for (const segment of segments) {
    if (segment.lane < lanesUsed) continue
    for (let i = segment.startIndex; i <= segment.endIndex; i += 1) overflowByDay[i] += 1
  }

  return { lanesUsed, segments, overflowByDay, chipBudget }
}

/** How many days an event covers, inclusive of both ends. */
export function eventSpanDays(event) {
  return daysBetween(event.startDate, event.endDate) + 1
}

export function isMultiDay(event) {
  return event.endDate > event.startDate
}

export function isAllDay(event) {
  return event.startMin === null
}

/** Which day of the run a given date is — "day 2 of 4". */
export function dayOfSpan(event, key) {
  return daysBetween(event.startDate, key) + 1
}
