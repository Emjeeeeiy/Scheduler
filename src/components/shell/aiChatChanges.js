/* What an Ask AI reply did, as rows a person can read at a glance.
 *
 * The chat used to answer an action with one line — "Done — created 2." — which
 * said nothing about WHAT: no day, no time, no tag, and no word about a time it
 * could not use. This turns the route's sanitized items into one row per change
 * (title, when, how long, which tag; for a change, what it was → what it is now;
 * for a removal, what is going), plus the plain notes that matter: a clash with
 * something already booked, a time that has already passed today, a value the
 * model gave that could not be read.
 *
 * Pure, and JSX-free so it is tested under node:test; AiChatModal draws the rows.
 * It runs BEFORE the items are applied, because an update needs the task as it is
 * now to show "was". Nothing here is sent anywhere except `context`, the same
 * facts in plain text, which goes back to the model as what the assistant did so
 * "make that 8pm instead" has something to point at.
 */

import { durationLabel, minToLabel, minToTimeValue, relativeDayLabel } from '@cadence/shared/date.js'
import { DEFAULT_DURATION_MIN } from '@cadence/shared/normalize.js'

const NO_DAY = 'No day set'
const NO_TIME = 'No time set'
const PRIORITY_NAMES = { low: 'Low', normal: 'Normal', high: 'High' }
const MAX_CLASH_NAMES = 2

const hasTime = (value) => Number.isFinite(value)

/** "7:00–8:30 PM", or "11:30 PM–12:30 AM" when the half of the day changes. */
function rangeLabel(startMin, durationMin) {
  const endMin = startMin + durationMin
  const from = minToLabel(startMin)
  const to = minToLabel(endMin % (24 * 60))
  const [fromClock, fromSuffix] = from.split(' ')
  const toSuffix = to.split(' ')[1]
  return fromSuffix === toSuffix && endMin < 24 * 60 ? `${fromClock}–${to}` : `${from}–${to}`
}

const dayLabel = (date, today) => (date ? relativeDayLabel(date, today) : NO_DAY)
const timeLabel = (startMin) => (hasTime(startMin) ? minToLabel(startMin) : NO_TIME)

/** The block an item will occupy on a day, or null when it has no time to clash. */
function blockOf(item, before) {
  if (item.action === 'create') {
    if (!item.date || !hasTime(item.startMin)) return null
    return {
      id: null,
      title: item.title,
      date: item.date,
      startMin: item.startMin,
      durationMin: item.durationMin ?? DEFAULT_DURATION_MIN,
    }
  }
  if (item.action !== 'update') return null
  const patch = item.patch ?? {}
  const date = patch.date ?? before?.date ?? null
  const startMin = 'startMin' in patch ? patch.startMin : (before?.startMin ?? null)
  if (!date || !hasTime(startMin)) return null
  return {
    id: item.taskId,
    title: patch.title ?? before?.title ?? 'a task',
    date,
    startMin,
    durationMin: patch.durationMin ?? before?.durationMin ?? DEFAULT_DURATION_MIN,
  }
}

const overlaps = (a, b) =>
  a.startMin < b.startMin + Math.max(1, b.durationMin) && b.startMin < a.startMin + Math.max(1, a.durationMin)

/** Up to two names with their times, then "and N more". */
function clashNote(clashes) {
  const named = clashes
    .slice(0, MAX_CLASH_NAMES)
    .map((c) => `“${c.title}” (${rangeLabel(c.startMin, Math.max(1, c.durationMin))})`)
  const more = clashes.length - named.length
  return `Overlaps ${named.join(', ')}${more > 0 ? ` and ${more} more` : ''} — kept at the time you gave.`
}

/**
 * @param items   the route's sanitized items (api/ai-schedule.js)
 * @param context
 *   tasks     every task, as they are right now (for "was" and for titles)
 *   tags      the account's tags
 *   dayItems  (dayKey) => the timed tasks and single-day events already on that
 *             day, each { id, title, startMin, durationMin }
 *   today     today's day key
 *   nowMin    minutes since midnight now, or null
 * @return rows: { action, title, meta[], changes[], tag, note, warnings[], context }
 */
export function describeChanges(items, { tasks = [], tags = [], dayItems = () => [], today, nowMin = null }) {
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const tagById = new Map(tags.map((tag) => [tag.id, tag]))
  const tagName = (id) => tagById.get(id)?.name ?? 'No tag'

  // Items about to move or go are not obstacles where they were: an update has
  // its own new block below, and a removed task leaves its slot free.
  const leaving = new Set(items.filter((i) => i.action !== 'create').map((i) => i.taskId))
  const blocks = items.map((item) => blockOf(item, taskById.get(item.taskId)))

  return items.map((item, index) => {
    const before = taskById.get(item.taskId)
    const issues = item.issues ?? []
    const block = blocks[index]
    const warnings = []

    if (block) {
      const clashes = [
        ...dayItems(block.date)
          .filter((other) => !leaving.has(other.id) && hasTime(other.startMin) && hasTime(other.durationMin))
          .map((other) => ({ title: other.title, startMin: other.startMin, durationMin: other.durationMin })),
        ...blocks
          .filter((other, i) => i !== index && other && other.date === block.date)
          .map((other) => ({ title: other.title, startMin: other.startMin, durationMin: other.durationMin })),
      ].filter((other) => overlaps(block, other))
      if (clashes.length > 0) warnings.push(clashNote(clashes))
      if (block.date === today && nowMin !== null && block.startMin < nowMin) {
        warnings.push('That time has already passed today.')
      }
    }
    if (issues.includes('time')) {
      warnings.push(
        item.action === 'update'
          ? 'Couldn’t read a time from that, so the time wasn’t changed.'
          : 'Couldn’t read a time from that, so it has no start time.',
      )
    }
    if (issues.includes('date')) warnings.push('Couldn’t read the day that was given — please check it.')

    if (item.action === 'remove') {
      const title = before?.title ?? 'a task'
      return {
        action: 'remove',
        title,
        meta: before ? [dayLabel(before.date, today), timeLabel(before.startMin)] : [],
        changes: [],
        tag: null,
        note: null,
        warnings,
        context: `Removed "${title}".`,
      }
    }

    if (item.action === 'update') {
      const patch = item.patch ?? {}
      const beforeTitle = before?.title ?? 'a task'
      const changes = []
      const facts = []
      // A field the model set to what the task already has is not a change, and
      // "Tag: Work → Work" is noise. With the task gone there is nothing to
      // compare against, so everything counts.
      const differs = (now, was) => !before || now !== was
      if ('title' in patch && differs(patch.title, before?.title)) {
        changes.push(`Renamed from “${beforeTitle}”`)
        facts.push(`title to "${patch.title}"`)
      }
      if ('date' in patch && differs(patch.date, before?.date ?? null)) {
        changes.push(`Day: ${dayLabel(before?.date, today)} → ${dayLabel(patch.date, today)}`)
        facts.push(`day to ${patch.date}`)
      }
      if ('startMin' in patch && differs(patch.startMin, before?.startMin ?? null)) {
        changes.push(`Time: ${timeLabel(before?.startMin)} → ${timeLabel(patch.startMin)}`)
        facts.push(`start to ${minToTimeValue(patch.startMin)}`)
      }
      if ('durationMin' in patch && differs(patch.durationMin, before?.durationMin ?? DEFAULT_DURATION_MIN)) {
        changes.push(`Length: ${durationLabel(before?.durationMin ?? DEFAULT_DURATION_MIN)} → ${durationLabel(patch.durationMin)}`)
        facts.push(`length to ${patch.durationMin} min`)
      }
      if ('tagId' in patch && differs(patch.tagId, before?.tagId ?? null)) {
        changes.push(`Tag: ${tagName(before?.tagId)} → ${tagName(patch.tagId)}`)
        facts.push(`tag to ${tagName(patch.tagId)}`)
      }
      if ('priority' in patch && differs(patch.priority, before?.priority ?? 'normal')) {
        changes.push(`Priority: ${PRIORITY_NAMES[before?.priority ?? 'normal']} → ${PRIORITY_NAMES[patch.priority]}`)
        facts.push(`priority to ${patch.priority}`)
      }
      if ('notes' in patch && differs(patch.notes, before?.notes ?? '')) {
        changes.push('Notes updated')
        facts.push('notes')
      }
      // Possible when every field it set already matched; said, not left blank.
      if (changes.length === 0) {
        changes.push('Already set that way')
        facts.push('nothing (already that way)')
      }
      return {
        action: 'update',
        title: patch.title ?? beforeTitle,
        meta: [],
        changes,
        tag: null,
        note: null,
        warnings,
        context: `Changed "${beforeTitle}": ${facts.join(', ')}.`,
      }
    }

    // create
    const durationMin = item.durationMin ?? null
    const meta = [dayLabel(item.date, today)]
    meta.push(hasTime(item.startMin) ? rangeLabel(item.startMin, durationMin ?? DEFAULT_DURATION_MIN) : NO_TIME)
    if (durationMin) meta.push(durationLabel(durationMin))
    if (item.priority && item.priority !== 'normal') meta.push(`${PRIORITY_NAMES[item.priority]} priority`)

    const when = [
      item.date ? `on ${item.date}` : 'with no day',
      hasTime(item.startMin) ? `at ${minToTimeValue(item.startMin)}` : null,
      durationMin ? `for ${durationMin} min` : null,
    ].filter(Boolean)
    return {
      action: 'create',
      title: item.title,
      meta,
      changes: [],
      tag: item.tagId ? (tagById.get(item.tagId) ?? null) : null,
      note: item.notes || null,
      warnings,
      context: `Created "${item.title}" ${when.join(' ')}.`,
    }
  })
}

/** The line under a reply that left some of what it was asked for out — the route
    drops an item it cannot validate or past its limit, and "all done" must not be
    said over a list that lost a few. */
export function skippedNote(skipped) {
  if (!Number.isInteger(skipped) || skipped < 1) return null
  return `${skipped} more couldn’t be added — try ${skipped === 1 ? 'it' : 'them'} in another message.`
}

/** The rows as plain text for the model, so a later turn knows what was done. */
export function changesContext(rows) {
  return rows.map((row) => row.context).join('\n')
}
