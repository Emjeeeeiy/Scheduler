/* The push schedule, as pure data.
 *
 * The browser already holds every task, event and repeat rule, and tasks are
 * stored as local wall-clock (a date key plus minutes after midnight — see
 * date.js). So the CLIENT works out which reminders should exist for the next
 * couple of weeks and hands the server a flat list of "at this instant, send
 * this text". The server never reads the schedule, never needs a time zone,
 * and never has to re-implement the repeat rules.
 *
 * This module only builds that list in wall-clock terms. Turning a (day key,
 * minute) into an instant is `reminderFireAt` below; sending is the server's
 * job (api/push/*).
 *
 * Three kinds, mirroring what the in-app bell already means by them
 * (notifications.js):
 *   - 'soon'  — `leadMin` minutes before a timed task/event starts
 *   - 'start' — the moment it starts
 *   - 'nudge' — one morning heads-up per day when anything is overdue
 */

import { isSeriesTemplate, overdueTasks } from './stats.js'
import { MINUTES_PER_DAY, addDays, fromKey } from './date.js'
import { describeNotification } from './notifications.js'

export const REMINDER_KINDS = ['soon', 'start', 'nudge']

/** How far ahead the client schedules. The server accepts a little more than
    this (see api/push/schedule.js) so clock skew can never reject a payload. */
export const DEFAULT_HORIZON_DAYS = 14

/** When the morning nudge fires if Settings has no working-hours start. */
export const DEFAULT_NUDGE_MIN = 8 * 60

/** The most titles a nudge spells out before collapsing the rest into "+N". */
const NUDGE_TITLES = 2

const isMinute = (value) => Number.isFinite(value)

/** 'Starts in 60m · 9:00 AM' for a heads-up, 'Happening now · 1h' for a start
    — the exact words the bell and the desktop alert already use, so one thing
    never gets described two ways. An event can have a start but no length
    (durationMin is null), which describeNotification has no wording for. */
function bodyFor(kind, subject, leadMin) {
  if (kind === 'soon') {
    return describeNotification({ kind: 'soon', task: subject, minutesUntil: leadMin })
  }
  if (Number.isFinite(subject.durationMin) && subject.durationMin > 0) {
    return describeNotification({ kind: 'now', task: subject })
  }
  return 'Happening now'
}

/** "Pay rent" for one, "3 overdue: A, B, +1" for several. Deliberately has no
    relative wording ("since yesterday"): this text is written now and shown
    days from now, when that wording would be wrong. */
function nudgeBody(overdue) {
  if (overdue.length === 1) return overdue[0].title
  const shown = overdue.slice(0, NUDGE_TITLES).map((task) => task.title)
  const rest = overdue.length - shown.length
  return `${overdue.length} overdue: ${shown.join(', ')}${rest > 0 ? `, +${rest}` : ''}`
}

/**
 * @param tasksOn   (dayKey) => tasks on that day, repeat occurrences expanded
 *                  (ScheduleContext's own `tasksOn`)
 * @param eventsOn  (dayKey) => events touching that day, occurrences expanded
 * @param allTasks  the flat task list — what "overdue" is measured against
 * @param fromKey   today's day key
 * @param nowMin    minutes after midnight, now; anything not strictly after
 *                  this on `fromKey` is already in the past and is dropped
 * @param days      how many days to cover, today included
 * @param leadMin   the user's "starting soon" lead time; 0/absent = no heads-up
 * @param nudgeMin  minute of day for the morning nudge
 * @return          `[{ id, kind, key, min, title, body, tag }]`, soonest
 *                  first. `min` is wall-clock minutes after midnight of `key`
 *                  and CAN be negative: a 00:15 task with a 60-minute lead
 *                  is a 23:15 reminder on the day before, which is
 *                  `reminderFireAt(key, -45)`.
 */
export function buildReminders({
  tasksOn,
  eventsOn,
  allTasks,
  fromKey: startKey,
  nowMin,
  days = DEFAULT_HORIZON_DAYS,
  leadMin = 0,
  nudgeMin = DEFAULT_NUDGE_MIN,
}) {
  const lead = Number.isFinite(leadMin) && leadMin > 0 ? Math.round(leadMin) : 0
  const nudgeAt = isMinute(nudgeMin) && nudgeMin >= 0 && nudgeMin < MINUTES_PER_DAY ? Math.round(nudgeMin) : DEFAULT_NUDGE_MIN

  const found = []

  for (let dayIndex = 0; dayIndex < days; dayIndex++) {
    const key = addDays(startKey, dayIndex)
    const dayOffset = dayIndex * MINUTES_PER_DAY

    /* Strictly after "now": the current minute has already begun, and the
       person is looking at the app that just asked for this. */
    const add = (reminder) => {
      const at = dayOffset + reminder.min
      if (at > nowMin) found.push({ at, reminder })
    }

    const timed = (subject) => {
      if (!isMinute(subject.startMin)) return
      const title = subject.title
      if (lead > 0) {
        add({
          id: `soon-${subject.id}-${key}`,
          kind: 'soon',
          key,
          min: subject.startMin - lead,
          title,
          body: bodyFor('soon', subject, lead),
          tag: `soon-${subject.id}`,
        })
      }
      add({
        id: `start-${subject.id}-${key}`,
        kind: 'start',
        key,
        min: subject.startMin,
        title,
        body: bodyFor('start', subject, lead),
        // Same tag the in-app alert uses for "in progress", so when both
        // fire the OS swaps one for the other instead of stacking two.
        tag: `now-${subject.id}`,
      })
    }

    for (const task of tasksOn(key)) {
      if (task.done || isSeriesTemplate(task)) continue
      timed(task)
    }

    /* An event gets a timed reminder on the day it begins and no other:
       an all-day event has nothing to be "soon" about, and the later days of
       a span are the same event continuing, not a new start. */
    for (const event of eventsOn(key)) {
      if (event.startDate !== key) continue
      timed(event)
    }

    const overdue = overdueTasks(allTasks, key)
    if (overdue.length > 0) {
      add({
        id: `nudge-${key}`,
        kind: 'nudge',
        key,
        min: nudgeAt,
        title: 'Overdue',
        body: nudgeBody(overdue),
        tag: `nudge-${key}`,
      })
    }
  }

  return found.sort((a, b) => a.at - b.at || a.reminder.id.localeCompare(b.reminder.id)).map((entry) => entry.reminder)
}

/**
 * The instant (epoch ms) a wall-clock reminder is due. Built by local-time
 * arithmetic on the day's midnight rather than `midnight + min * 60000`, so a
 * 23- or 25-hour daylight-saving day still lands on the clock time the person
 * saw when they made the task.
 */
export function reminderFireAt(key, min) {
  const at = fromKey(key)
  at.setMinutes(at.getMinutes() + min)
  return at.getTime()
}
