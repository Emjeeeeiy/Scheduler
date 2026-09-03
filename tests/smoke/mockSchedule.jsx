/* Stand-in for state/ScheduleContext.jsx during the smoke render. Aliased in by
   tests/smoke/vite.config.js so no production code knows this file exists. */

import { addDays, todayKey } from '../../src/lib/date.js'
import { WEEKDAYS, eventOccurrenceOn, occurrenceOn } from '../../src/lib/recurrence.js'

export const DEFAULT_DURATION_MIN = 30

export const TAG_SLOTS = ['blue', 'orange', 'aqua', 'yellow', 'magenta', 'green', 'violet', 'red']

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

const TODAY = todayKey()

const tag = (id, name, slot) => ({ id, name, slot, color: `var(--tag-${slot})`, order: 0 })

const tags = [tag('work', 'Work', 'blue'), tag('personal', 'Personal', 'orange')]

const task = (id, patch) => ({
  id,
  title: `Task ${id}`,
  notes: '',
  date: null,
  startMin: null,
  durationMin: 30,
  tagId: null,
  done: false,
  completedAt: null,
  recurrence: null,
  overrides: {},
  createdAt: 1,
  updatedAt: 1,
  ...patch,
})

/* Deliberately awkward fixtures: overlapping blocks (the layout path), an
   all-day item, an inbox item, a completed task, an overdue task, and a block
   outside the default 7am–10pm window. */
const tasks = [
  task('a', { title: 'Standup', date: TODAY, startMin: 9 * 60, durationMin: 30, tagId: 'work' }),
  task('b', { title: 'Design review', date: TODAY, startMin: 9 * 60 + 15, durationMin: 90, tagId: 'work' }),
  task('c', { title: 'Overlapping third', date: TODAY, startMin: 9 * 60 + 30, durationMin: 60 }),
  task('d', { title: 'All-day: conference', date: TODAY }),
  task('e', { title: 'Early flight', date: TODAY, startMin: 5 * 60, durationMin: 120, tagId: 'personal' }),
  task('f', { title: 'Finished thing', date: TODAY, startMin: 14 * 60, durationMin: 60, done: true, tagId: 'work' }),
  task('g', { title: 'Tomorrow', date: addDays(TODAY, 1), startMin: 11 * 60, durationMin: 45 }),
  task('h', { title: 'Later this week', date: addDays(TODAY, 3), startMin: 16 * 60, durationMin: 30, tagId: 'personal' }),
  task('i', { title: 'Overdue thing', date: addDays(TODAY, -2), startMin: 10 * 60, durationMin: 60 }),
  task('j', { title: 'Unscheduled idea', createdAt: 50 }),
  task('k', { title: 'Another loose end', tagId: 'personal' }),
  task('l', { title: 'Done in the inbox', done: true }),
  // A repeating task: the exercise for the block/chip/row repeat marker, and
  // for the paths that must NOT treat a rule document as a task on its own
  // anchor date (overdue, upcoming, the day buckets).
  task('m', {
    title: 'Standing sync',
    date: addDays(TODAY, -7),
    startMin: 8 * 60,
    durationMin: 30,
    tagId: 'work',
    recurrence: { days: WEEKDAYS, anchor: addDays(TODAY, -7) },
  }),
]

const event = (id, patch) => ({
  id,
  title: `Event ${id}`,
  notes: '',
  startDate: TODAY,
  endDate: TODAY,
  startMin: null,
  endMin: null,
  durationMin: null,
  tagId: null,
  recurrence: null,
  overrides: {},
  createdAt: 1,
  updatedAt: 1,
  ...patch,
})

/* Deliberately awkward fixtures, same spirit as the tasks above: a bar that
   straddles a week boundary (the lane packer's hardest case), two overlapping
   multi-day bars (which force a second lane), a single-day timed event (which
   draws in the grid rather than as a bar), and a plain all-day one. */
const events = [
  /* Eleven days long on purpose: any span this size must cross at least one
     Mon–Sun boundary whatever weekday the suite happens to run on, so the
     clipping and continuation path is always exercised. A shorter fixture
     passed or failed depending on the day of the week. */
  event('e1', {
    title: 'Team offsite',
    startDate: addDays(TODAY, -3),
    endDate: addDays(TODAY, 7),
    tagId: 'work',
  }),
  event('e2', {
    title: 'Design sprint',
    startDate: TODAY,
    endDate: addDays(TODAY, 2),
    tagId: 'personal',
  }),
  event('e3', { title: 'Product launch', startDate: TODAY }),
  /* Two repeating events, one of each rule shape, so the views actually walk
     the expansion path rather than only the stored-document one. */
  event('e5', {
    title: 'Sunday service',
    startDate: addDays(TODAY, -14),
    startMin: 9 * 60,
    endMin: 10 * 60,
    durationMin: 60,
    endDate: addDays(TODAY, -14),
    recurrence: { freq: 'weekly', days: [0], anchor: addDays(TODAY, -14) },
  }),
  event('e6', {
    title: 'Book club',
    startDate: addDays(TODAY, -28),
    startMin: 19 * 60,
    endMin: 20 * 60 + 30,
    durationMin: 90,
    tagId: 'personal',
    endDate: addDays(TODAY, -28),
    recurrence: { freq: 'monthly', weekday: 6, nth: 2, anchor: addDays(TODAY, -28) },
  }),
  event('e4', {
    title: 'Dentist',
    startDate: TODAY,
    startMin: 15 * 60,
    endMin: 16 * 60,
    durationMin: 60,
    tagId: 'personal',
  }),
]

const series = tasks.filter((t) => t.recurrence)

const tagById = new Map(tags.map((t) => [t.id, t]))
const tasksByDate = new Map()
const inbox = []
for (const t of tasks) {
  if (t.recurrence) continue
  if (t.date === null) inbox.push(t)
  else tasksByDate.set(t.date, [...(tasksByDate.get(t.date) ?? []), t])
}
for (const bucket of tasksByDate.values()) {
  bucket.sort((a, b) => (a.startMin ?? -1) - (b.startMin ?? -1))
}

const occurrencesOn = (key) =>
  series.map((s) => occurrenceOn(s, key)).filter((occurrence) => occurrence !== null)

const tasksOn = (key) =>
  [...(tasksByDate.get(key) ?? []), ...occurrencesOn(key)].sort(
    (a, b) => (a.startMin ?? -1) - (b.startMin ?? -1),
  )

const noop = async () => {}

const eventSeries = events.filter((e) => e.recurrence)
const bySpan = (a, b) =>
  a.startDate.localeCompare(b.startDate) ||
  b.endDate.localeCompare(a.endDate) ||
  a.id.localeCompare(b.id)

const sortedEvents = events.filter((e) => !e.recurrence).sort(bySpan)

const eventOccurrencesOn = (key) =>
  eventSeries.map((s) => eventOccurrenceOn(s, key)).filter((o) => o !== null)

const eventsOn = (key) =>
  [...sortedEvents.filter((e) => e.startDate <= key && key <= e.endDate),
   ...eventOccurrencesOn(key)].sort(bySpan)

const eventsInRange = (startKey, endKey) => {
  const fixed = sortedEvents.filter((e) => e.startDate <= endKey && e.endDate >= startKey)
  const expanded = []
  for (let key = startKey; key <= endKey; key = addDays(key, 1)) {
    expanded.push(...eventOccurrencesOn(key))
  }
  return [...fixed, ...expanded].sort(bySpan)
}

export const mockValue = {
  tasks,
  tags,
  tagById,
  inbox,
  loading: false,
  error: null,
  getTag: (id) => (id ? tagById.get(id) ?? null : null),
  tasksOn,
  occurrencesOn,
  getSeries: (id) => series.find((s) => s.id === id) ?? null,
  events: [...sortedEvents, ...eventSeries].sort(bySpan),
  eventsOn,
  eventsInRange,
  getEvent: (id) => events.find((e) => e.id === id) ?? null,
  getEventSeries: (id) => eventSeries.find((e) => e.id === id) ?? null,
  addTask: noop,
  updateTask: noop,
  toggleDone: noop,
  removeTask: noop,
  scheduleTask: noop,
  unscheduleTask: noop,
  addEvent: noop,
  updateEvent: noop,
  removeEvent: noop,
  moveEvent: noop,
  addTag: noop,
  updateTag: noop,
  removeTag: noop,
  removeAllItems: noop,
  templates: [],
  addTemplate: noop,
  removeTemplate: noop,
  importData: noop,
  profile: null,
  focusSessions: [],
  addFocusSession: noop,
}

export function ScheduleProvider({ children }) {
  return children
}

export function useSchedule() {
  return mockValue
}
