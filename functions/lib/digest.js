/* The daily digest's content — computed here as plain data, rendered to
 * HTML/text in a second, separate step (renderDigestEmail below) so the
 * "what does today look like" question and "what does an email of that look
 * like" question can be tested independently. Reuses dayStats/overdueTasks/
 * upcomingTasks from stats.js rather than re-deriving totals a second way —
 * the same reasoning ReviewView and Dashboard already follow.
 */

import { dayStats, overdueTasks, upcomingTasks } from '../shared/lib/stats.js'
import { durationLabel, formatFullDayLabel, minToLabel } from '../shared/lib/date.js'

/**
 * @param todayItems  this user's tasksForNotifications-style list, already
 *                     filtered to today (see dayModel.js)
 * @param allTasks    every raw, normalized task — overdueTasks needs the
 *                     full list, not just today's, to find anything left
 *                     behind on an earlier day
 * @param upcomingPool allTasks plus a short horizon of expanded future
 *                     occurrences (dayModel.js's expandHorizon) — what
 *                     "coming up next" draws from
 * @param todayKey
 * @param fromMin      minute of day the digest is being built at, so
 *                     "upcoming" never lists something already finished
 */
export function buildDigestSummary({ todayItems, allTasks, upcomingPool, todayKey, fromMin = 0 }) {
  return {
    todayKey,
    stats: dayStats(todayItems),
    overdue: overdueTasks(allTasks, todayKey),
    next: upcomingTasks(upcomingPool, todayKey, fromMin, 5),
  }
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** A day with nothing planned and nothing overdue is worth saying out loud,
    not sending as a blank-looking email — otherwise the one day a digest
    would most reassure someone ("nothing's on fire") reads like it broke. */
function isQuietDay(summary) {
  return summary.stats.count === 0 && summary.overdue.length === 0 && summary.next.length === 0
}

/** Renders buildDigestSummary's output to an email. Returns `{ subject,
    text, html }` — plain text as the real fallback (some clients, and every
    screen reader worth trusting, prefer it), not an afterthought copy of
    the HTML with tags stripped. */
export function renderDigestEmail(summary) {
  const dayLabel = formatFullDayLabel(summary.todayKey)
  const subject = isQuietDay(summary)
    ? `${dayLabel} — nothing on the books`
    : `${dayLabel} — ${summary.stats.count} task${summary.stats.count === 1 ? '' : 's'}${
        summary.overdue.length > 0 ? `, ${summary.overdue.length} overdue` : ''
      }`

  const lines = []
  lines.push(dayLabel)
  lines.push('')

  if (isQuietDay(summary)) {
    lines.push('Nothing scheduled, nothing overdue.')
  } else {
    if (summary.stats.count > 0) {
      lines.push(
        `Today: ${summary.stats.openCount} open, ${summary.stats.doneCount} done, ${durationLabel(summary.stats.plannedMin)} planned.`,
      )
    }
    if (summary.overdue.length > 0) {
      lines.push('')
      lines.push(`Overdue (${summary.overdue.length}):`)
      for (const task of summary.overdue) lines.push(`  - ${task.title}`)
    }
    if (summary.next.length > 0) {
      lines.push('')
      lines.push('Coming up:')
      for (const task of summary.next) {
        const when = Number.isFinite(task.startMin) ? minToLabel(task.startMin) : 'All day'
        lines.push(`  - ${task.title} (${task.date}, ${when})`)
      }
    }
  }
  const text = lines.join('\n')

  const section = (title, items, renderItem) =>
    items.length === 0
      ? ''
      : `<h2 style="font:600 15px system-ui;margin:20px 0 8px">${escapeHtml(title)}</h2>` +
        `<ul style="margin:0;padding-left:20px;font:14px system-ui">${items.map(renderItem).join('')}</ul>`

  const html =
    `<div style="font:14px system-ui;color:#0b0b0b;max-width:480px">` +
    `<h1 style="font:600 18px system-ui;margin:0 0 4px">${escapeHtml(dayLabel)}</h1>` +
    (isQuietDay(summary)
      ? `<p>Nothing scheduled, nothing overdue.</p>`
      : `${
          summary.stats.count > 0
            ? `<p style="color:#555">${summary.stats.openCount} open · ${summary.stats.doneCount} done · ${escapeHtml(durationLabel(summary.stats.plannedMin))} planned</p>`
            : ''
        }` +
        section('Overdue', summary.overdue, (task) => `<li>${escapeHtml(task.title)}</li>`) +
        section(
          'Coming up',
          summary.next,
          (task) =>
            `<li>${escapeHtml(task.title)} — ${escapeHtml(task.date)}${
              Number.isFinite(task.startMin) ? `, ${escapeHtml(minToLabel(task.startMin))}` : ''
            }</li>`,
        )) +
    `</div>`

  return { subject, text, html }
}
