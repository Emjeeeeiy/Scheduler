/* Stand-in for state/ScheduleContext.jsx during the smoke render. Aliased in by
   tests/smoke/vite.config.js so no production code knows this file exists. */

import { addDays, todayKey } from '../../src/lib/date.js'

export const DEFAULT_DURATION_MIN = 30

export const TAG_SLOTS = ['blue', 'orange', 'aqua', 'yellow', 'magenta', 'green', 'violet', 'red']

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
  task('j', { title: 'Unscheduled idea' }),
  task('k', { title: 'Another loose end', tagId: 'personal' }),
  task('l', { title: 'Done in the inbox', done: true }),
]

const tagById = new Map(tags.map((t) => [t.id, t]))
const tasksByDate = new Map()
const inbox = []
for (const t of tasks) {
  if (t.date === null) inbox.push(t)
  else tasksByDate.set(t.date, [...(tasksByDate.get(t.date) ?? []), t])
}
for (const bucket of tasksByDate.values()) {
  bucket.sort((a, b) => (a.startMin ?? -1) - (b.startMin ?? -1))
}

const noop = async () => {}

export const mockValue = {
  tasks,
  tags,
  tagById,
  tasksByDate,
  inbox,
  loading: false,
  error: null,
  getTag: (id) => (id ? tagById.get(id) ?? null : null),
  tasksOn: (key) => tasksByDate.get(key) ?? [],
  addTask: noop,
  updateTask: noop,
  toggleDone: noop,
  removeTask: noop,
  scheduleTask: noop,
  unscheduleTask: noop,
  addTag: noop,
  updateTag: noop,
  removeTag: noop,
}

export function ScheduleProvider({ children }) {
  return children
}

export function useSchedule() {
  return mockValue
}
