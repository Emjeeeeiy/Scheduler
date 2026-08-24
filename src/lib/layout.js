/* Overlap packing for the time grid.
 *
 * Two meetings at 9:00 must not draw on top of each other. The standard fix is
 * to find each *cluster* of mutually-overlapping blocks and split the column's
 * width between them.
 *
 * The subtlety worth knowing: a cluster is not "blocks that pairwise overlap".
 * 9–10, 9:30–11, 10:30–12 forms one chain even though the first and last never
 * touch — splitting only pairs would draw the middle block over one of its
 * neighbours. So a cluster runs until a block starts at or after the furthest
 * end seen so far, and the whole chain shares the width.
 *
 * Column assignment inside a cluster is first-fit: reuse the leftmost column
 * whose last block has already ended, which keeps blocks left and the layout
 * stable as items are added.
 *
 * Everything is returned in percentages so the grid itself is pure CSS and the
 * result does not depend on the rendered pixel size of the column.
 */

import { MINUTES_PER_DAY } from './date.js'

/** Blocks thinner than this are unreadable and unclickable, so short tasks are
    drawn at a floor height while keeping their true start position. */
const MIN_HEIGHT_MIN = 20

/**
 * @param  tasks  scheduled tasks for one day (date set, startMin set)
 * @param  dayStartMin / dayEndMin  the visible window, so a grid can show 6am–10pm
 * @return array of { task, top, height, left, width } in percent of the column
 */
export function layoutDay(tasks, dayStartMin = 0, dayEndMin = MINUTES_PER_DAY) {
  const span = Math.max(1, dayEndMin - dayStartMin)

  const blocks = tasks
    .filter((t) => Number.isFinite(t.startMin))
    .map((t) => {
      const start = t.startMin
      const end = start + Math.max(MIN_HEIGHT_MIN, t.durationMin || MIN_HEIGHT_MIN)
      return { task: t, start, end }
    })
    // Ties broken by longer-first, then id, so the order never flickers between
    // renders when two tasks share a start time.
    .sort(
      (a, b) =>
        a.start - b.start || b.end - a.end || String(a.task.id).localeCompare(String(b.task.id)),
    )

  const positioned = []
  let cluster = []
  let clusterEnd = -Infinity

  const flush = () => {
    if (cluster.length === 0) return
    // First-fit column packing within the cluster.
    const columnEnds = []
    for (const block of cluster) {
      let column = columnEnds.findIndex((end) => end <= block.start)
      if (column === -1) {
        column = columnEnds.length
        columnEnds.push(block.end)
      } else {
        columnEnds[column] = block.end
      }
      block.column = column
    }
    const columns = columnEnds.length
    for (const block of cluster) {
      positioned.push({
        task: block.task,
        top: ((block.start - dayStartMin) / span) * 100,
        height: ((block.end - block.start) / span) * 100,
        left: (block.column / columns) * 100,
        width: (1 / columns) * 100,
        columns,
      })
    }
    cluster = []
    clusterEnd = -Infinity
  }

  for (const block of blocks) {
    if (block.start >= clusterEnd) flush()
    cluster.push(block)
    clusterEnd = Math.max(clusterEnd, block.end)
  }
  flush()

  return positioned
}

/** Where a pointer at `ratio` (0..1 down the column) lands, snapped to `step`. */
export function ratioToMin(ratio, dayStartMin, dayEndMin, step = 15) {
  const span = dayEndMin - dayStartMin
  const raw = dayStartMin + ratio * span
  const snapped = Math.round(raw / step) * step
  return Math.max(dayStartMin, Math.min(dayEndMin - step, snapped))
}

/** Percent offset of a minute within the visible window — the now-line and the
    hour rules both position with this. */
export function minToPercent(min, dayStartMin, dayEndMin) {
  return ((min - dayStartMin) / (dayEndMin - dayStartMin)) * 100
}

/* The grid shows working hours by default rather than all 24, because a column
   scaled to midnight–midnight makes a one-hour meeting too thin to read. */
export const DEFAULT_WINDOW_START = 7 * 60
export const DEFAULT_WINDOW_END = 22 * 60

/**
 * The hour window to render, widened to whole hours around anything scheduled
 * outside it. A 5am flight or a task at 11pm must not be silently cropped out
 * of the only view that would show it.
 */
export function visibleWindow(tasks, startMin = DEFAULT_WINDOW_START, endMin = DEFAULT_WINDOW_END) {
  let start = startMin
  let end = endMin

  for (const task of tasks) {
    if (!Number.isFinite(task.startMin)) continue
    start = Math.min(start, Math.floor(task.startMin / 60) * 60)
    end = Math.max(end, Math.ceil((task.startMin + (task.durationMin || 0)) / 60) * 60)
  }

  return [Math.max(0, start), Math.min(MINUTES_PER_DAY, Math.max(end, start + 60))]
}

/** Whole-hour marks inside a window, for the gutter labels and the rules. */
export function hourMarks(startMin, endMin) {
  const first = Math.ceil(startMin / 60) * 60
  const marks = []
  for (let min = first; min <= endMin; min += 60) marks.push(min)
  return marks
}
