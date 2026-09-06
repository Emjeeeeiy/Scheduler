/* Turning a user's raw Firestore task docs into "what's actually on a given
 * day," server-side — the same job ScheduleContext's tasksOn/occurrencesOn
 * do client-side, from the same rule: a recurring task's own document is a
 * RULE, not a thing on the calendar, so it never counts on its own anchor
 * date and has to be expanded per day instead (see occurrenceOn).
 *
 * ScheduleContext does this expansion inside closures built once per
 * Firestore snapshot, which a scheduled Cloud Function has no equivalent
 * of — this recomputes it directly from a plain array on every call. Fine
 * at this scale: one person's tasks, once every few minutes, not a render
 * loop with a month grid asking 42 times.
 */

import { normalizeTask } from '../shared/lib/normalize.js'
import { occurrenceOn } from '../shared/lib/recurrence.js'
import { addDays } from '../shared/lib/date.js'

/** Raw Firestore docs, coerced through the same validation every other
    reader of this data goes through — a half-written document can't blank
    out a person's notifications any more than it can blank out their
    calendar. `raw` is `{ id, ...data() }`; normalizeTask wants them apart. */
export function normalizeAll(rawTasks) {
  return rawTasks.map(({ id, ...data }) => normalizeTask(id, data))
}

/** Every recurring series' occurrence for one specific day, from an
    already-normalized list — the one piece both exports below share. */
function occurrencesOnDay(normalized, key) {
  const out = []
  for (const task of normalized) {
    if (!task.recurrence) continue
    const occurrence = occurrenceOn(task, key)
    if (occurrence) out.push(occurrence)
  }
  return out
}

/** Exactly what's on one day: non-recurring tasks dated that day, plus that
    day's occurrence from every series — the server-side twin of
    ScheduleContext's tasksOn(key). Right shape for a day TOTAL (dayStats);
    wrong shape for scanning across dates, which is what
    tasksForNotifications below is for instead. */
export function tasksOnDay(rawTasks, key) {
  const normalized = normalizeAll(rawTasks)
  const dated = normalized.filter((task) => !task.recurrence && task.date === key)
  return [...dated, ...occurrencesOnDay(normalized, key)]
}

/** The exact list buildNotifications expects: every non-recurring task
    (whatever its date — overdueTasks inside buildNotifications scans the
    whole thing for anything in the past) plus today's occurrences from
    every recurring series. Mirrors NotificationBell's own
    `[...tasks, ...occurrencesOn(now.key)]` call precisely, since a
    notification server-side has to mean the same thing it means in the
    app the person is looking at. */
export function tasksForNotifications(rawTasks, todayKey) {
  const normalized = normalizeAll(rawTasks)
  return [...normalized, ...occurrencesOnDay(normalized, todayKey)]
}

/** Occurrences landing on any of the next `days` days after (not including)
    `fromKey`, across every recurring series — the digest's equivalent of
    Dashboard's own horizon expansion for "Next up," scoped to a week rather
    than Dashboard's fifteen days since a digest is read once and moves on,
    not kept open waiting for something further out to become relevant. */
export function expandHorizon(rawTasks, fromKey, days = 7) {
  const normalized = normalizeAll(rawTasks)
  const out = []
  for (let i = 1; i <= days; i++) {
    out.push(...occurrencesOnDay(normalized, addDays(fromKey, i)))
  }
  return out
}
