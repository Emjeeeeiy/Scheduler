/* The data-integrity layer between Firestore and the rest of the app.
 *
 * A Firestore doc is as untrusted as anything else read off a disk: it may
 * predate a field, have been written by an older build, or be half-typed
 * from another device. Every field is coerced to its expected type here so a
 * single bad document can never blank out a calendar.
 *
 * Pulled out of ScheduleContext.jsx so this layer can be unit tested on its
 * own, the same way date/recurrence/stats already are — see
 * tests/normalize.test.js.
 */

import { addDays, clampMin, daysBetween, isValidKey } from './date.js'
import { normalizeOverrides, normalizeRecurrence } from './recurrence.js'

export const DEFAULT_DURATION_MIN = 30

/** A timed event with no end time covers an hour, the same way a task with no
    stated duration covers thirty minutes. */
export const DEFAULT_EVENT_DURATION_MIN = 60

/* An event may legitimately run for months (a sabbatical, a long project), but
   not for centuries. This is a guard against corrupt data, not a product
   limit — see the cap in normalizeEvent. */
export const MAX_EVENT_DAYS = 366

/* The colour menu, in validated slot order (see the tag palette note in
   tokens.css). A tag doc stores the slot NAME, not a hex: the two themes need
   different steps of the same hue, and one stored hex could only ever satisfy
   one of them. Slots are handed out in order because that order is what keeps
   adjacent colours distinguishable under colour-vision deficiency. */
export const TAG_SLOTS = [
  'blue',
  'orange',
  'aqua',
  'yellow',
  'magenta',
  'green',
  'violet',
  'red',
]

/* Unlike a slot, no icon is ever assigned automatically — a plain colour dot
   is a complete, valid tag on its own, so this only ever reflects something
   someone deliberately picked in the Tag Manager. See TagGlyph.jsx for how a
   key here becomes a component. */
export const TAG_ICONS = [
  'briefcase',
  'home',
  'book',
  'heart',
  'wallet',
  'plane',
  'users',
  'coffee',
  'bulb',
  'flag',
  'star',
  'dumbbell',
  'pill',
  'musicNote',
  'cart',
  'utensils',
  'car',
  'phone',
  'mail',
  'gameController',
  'palette',
  'graduationCap',
  'leaf',
  'moon',
  'laptop',
  'person',
  'church',
  'gift',
  'mapPin',
  'umbrella',
  'pawPrint',
  'trophy',
  'wrench',
  'scissors',
]

export const TASK_PRIORITIES = ['low', 'normal', 'high']

/** A checklist item is dropped rather than kept-but-blank when its title is
    empty — an untitled subtask isn't a smaller task, it's nothing. The
    fallback id is positional, not random: normalizeTask runs on every
    snapshot, and a random id would hand a different React key to the same
    row on every read, for a case (a subtask written with no id at all) that
    should never happen from this app's own editor anyway. */
function normalizeSubtask(raw, index) {
  const title = typeof raw?.title === 'string' ? raw.title.trim() : ''
  if (!title) return null
  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id : `sub-${index}`,
    title,
    done: raw?.done === true,
  }
}

export function normalizeTask(id, raw) {
  const date = isValidKey(raw?.date) ? raw.date : null
  // A start time without a date is meaningless — such a task belongs in the
  // inbox, not floating on a day that does not exist.
  const startMin = date && Number.isFinite(raw?.startMin) ? clampMin(raw.startMin) : null
  const title = typeof raw?.title === 'string' ? raw.title.trim() : ''
  const recurrence = normalizeRecurrence(raw?.recurrence, date)

  return {
    id,
    title: title || 'Untitled task',
    notes: typeof raw?.notes === 'string' ? raw.notes : '',
    date,
    startMin,
    durationMin: Number.isFinite(raw?.durationMin)
      ? Math.min(24 * 60, Math.max(5, Math.round(raw.durationMin)))
      : DEFAULT_DURATION_MIN,
    tagId: typeof raw?.tagId === 'string' && raw.tagId ? raw.tagId : null,
    done: raw?.done === true,
    completedAt: Number.isFinite(raw?.completedAt) ? raw.completedAt : null,
    priority: TASK_PRIORITIES.includes(raw?.priority) ? raw.priority : 'normal',
    // Pinning is a deliberate, one-off choice — never inferred, so an
    // absent or malformed value reads as "not pinned" rather than guessed.
    pinned: raw?.pinned === true,
    // Task ids this one is waiting on — a soft reminder surfaced in the UI,
    // never an enforced block on scheduling or completing it. De-duplicated
    // since the picker that writes this can only ever add an id once, but a
    // hand-edited document might not.
    blockedBy: Array.isArray(raw?.blockedBy)
      ? [...new Set(raw.blockedBy.filter((v) => typeof v === 'string' && v))]
      : [],
    subtasks: Array.isArray(raw?.subtasks)
      ? raw.subtasks.map(normalizeSubtask).filter(Boolean).slice(0, 50)
      : [],
    recurrence,
    overrides: recurrence ? normalizeOverrides(raw?.overrides) : {},
    createdAt: Number.isFinite(raw?.createdAt) ? raw.createdAt : 0,
    updatedAt: Number.isFinite(raw?.updatedAt) ? raw.updatedAt : 0,
  }
}

/* An event is a commitment, not work to get through: no done state, no
   recurrence, and it may cover a range of days rather than sitting on one.
   Because a timed event still carries startMin and a derived durationMin, it
   flows through layoutDay/visibleWindow exactly like a task does — the grid
   needs no second code path to draw one. */
export function normalizeEvent(id, raw) {
  const startDate = isValidKey(raw?.startDate) ? raw.startDate : null
  const rawEnd = isValidKey(raw?.endDate) ? raw.endDate : null
  // An end can never sit before its start; a malformed range collapses to the
  // single day it started on rather than rendering as a bar of negative width.
  let endDate = startDate && rawEnd && rawEnd > startDate ? rawEnd : startDate
  /* And a corrupt far-future end is capped rather than trusted. The month lane
     packer walks a span day by day, so a stray '2999-12-31' would not merely
     draw something wrong — it would spin through ~350,000 iterations per
     render. Bound it here, at the same edge every other field is coerced. */
  if (endDate !== null && daysBetween(startDate, endDate) >= MAX_EVENT_DAYS) {
    endDate = addDays(startDate, MAX_EVENT_DAYS - 1)
  }
  /* Only a single-day event may repeat. A repeating span is the thing this
     app deliberately did not build: an occurrence would have to carry its own
     length, and "which day of which occurrence did you grab" becomes a real
     question for the lane packer and every drag path. Enforced on read as well
     as in the editor, so a hand-edited document cannot smuggle one in. */
  const recurrence = startDate === endDate ? normalizeRecurrence(raw?.recurrence, startDate) : null
  const startMin = startDate && Number.isFinite(raw?.startMin) ? clampMin(raw.startMin) : null
  /* An end *time* only means something inside a single day. Across a range the
     bar covers whole days, and a clock time would be ambiguous about which. */
  const endMin =
    startDate === endDate && startMin !== null && Number.isFinite(raw?.endMin)
      ? clampMin(raw.endMin)
      : null
  const title = typeof raw?.title === 'string' ? raw.title.trim() : ''

  return {
    id,
    title: title || 'Untitled event',
    notes: typeof raw?.notes === 'string' ? raw.notes : '',
    startDate,
    endDate,
    startMin,
    endMin,
    durationMin:
      startMin === null
        ? null
        : endMin !== null && endMin > startMin
          ? endMin - startMin
          : DEFAULT_EVENT_DURATION_MIN,
    tagId: typeof raw?.tagId === 'string' && raw.tagId ? raw.tagId : null,
    recurrence,
    // Events have no done state, so the only exception a day can carry is
    // `detached` — normalizeOverrides drops everything else anyway.
    overrides: recurrence ? normalizeOverrides(raw?.overrides) : {},
    createdAt: Number.isFinite(raw?.createdAt) ? raw.createdAt : 0,
    updatedAt: Number.isFinite(raw?.updatedAt) ? raw.updatedAt : 0,
  }
}

export function normalizeTag(id, raw) {
  const name = typeof raw?.name === 'string' ? raw.name.trim() : ''
  const slot = TAG_SLOTS.includes(raw?.slot) ? raw.slot : TAG_SLOTS[0]
  return {
    id,
    name: name || 'Untitled',
    slot,
    // null is a real, valid state here — "no icon, just the colour" — not a
    // missing value, so an unrecognised or absent one normalizes to null
    // rather than to some default glyph nobody chose.
    icon: TAG_ICONS.includes(raw?.icon) ? raw.icon : null,
    // Resolved once here so every consumer paints from the themed token and
    // no component has to know how a slot maps to a colour.
    color: `var(--color-tag-${slot})`,
    order: Number.isFinite(raw?.order) ? raw.order : 0,
  }
}

/** A saved "new task" starting point — title/tag/duration/priority, the
    "what and how" of a task. Deliberately carries no date/startMin (a
    template has no day of its own) and no recurrence (a rule needs an
    anchor date, which a template doesn't have until it's actually used to
    start a real task). */
export function normalizeTemplate(id, raw) {
  const title = typeof raw?.title === 'string' ? raw.title.trim() : ''
  return {
    id,
    title: title || 'Untitled template',
    tagId: typeof raw?.tagId === 'string' && raw.tagId ? raw.tagId : null,
    durationMin: Number.isFinite(raw?.durationMin)
      ? Math.min(24 * 60, Math.max(5, Math.round(raw.durationMin)))
      : DEFAULT_DURATION_MIN,
    priority: TASK_PRIORITIES.includes(raw?.priority) ? raw.priority : 'normal',
    createdAt: Number.isFinite(raw?.createdAt) ? raw.createdAt : 0,
  }
}
