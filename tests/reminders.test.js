import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildReminders, DEFAULT_NUDGE_MIN, reminderFireAt } from '@cadence/shared/reminders.js'
import { EVERY_DAY, eventOccurrenceOn, occurrenceOn } from '@cadence/shared/recurrence.js'
import { addDays } from '@cadence/shared/date.js'

// 2026-08-24 is a Monday.
const MON = '2026-08-24'
const TUE = '2026-08-25'

const task = (id, patch = {}) => ({
  id,
  title: `Task ${id}`,
  notes: '',
  date: MON,
  startMin: 9 * 60,
  durationMin: 60,
  done: false,
  recurrence: null,
  createdAt: 1,
  ...patch,
})

const event = (id, patch = {}) => ({
  id,
  title: `Event ${id}`,
  startDate: MON,
  endDate: MON,
  startMin: 14 * 60,
  endMin: 15 * 60,
  durationMin: 60,
  recurrence: null,
  overrides: {},
  ...patch,
})

/** The same expansion ScheduleContext's tasksOn/eventsOn do, over plain arrays:
    a repeating document is a rule, never a thing on its anchor day. */
function world({ tasks = [], events = [] } = {}) {
  const series = tasks.filter((t) => t.recurrence)
  const fixed = tasks.filter((t) => !t.recurrence)
  const eventSeries = events.filter((e) => e.recurrence)
  const fixedEvents = events.filter((e) => !e.recurrence)
  return {
    allTasks: tasks,
    tasksOn: (key) => [
      ...fixed.filter((t) => t.date === key),
      ...series.map((s) => occurrenceOn(s, key)).filter(Boolean),
    ],
    eventsOn: (key) => [
      ...fixedEvents.filter((e) => e.startDate <= key && key <= e.endDate),
      ...eventSeries.map((s) => eventOccurrenceOn(s, key)).filter(Boolean),
    ],
  }
}

const build = (input, opts = {}) =>
  buildReminders({ ...world(input), fromKey: MON, nowMin: 6 * 60, days: 1, leadMin: 30, ...opts })

describe('buildReminders — tasks', () => {
  it('makes a heads-up and a start reminder for a timed task, in the bell’s own words', () => {
    const out = build({ tasks: [task('a', { startMin: 9 * 60, durationMin: 90 })] })
    assert.deepEqual(out, [
      {
        id: `soon-a-${MON}`,
        kind: 'soon',
        key: MON,
        min: 8 * 60 + 30,
        title: 'Task a',
        body: 'Starts in 30m · 9:00 AM',
        tag: 'soon-a',
      },
      {
        id: `start-a-${MON}`,
        kind: 'start',
        key: MON,
        min: 9 * 60,
        title: 'Task a',
        body: 'Happening now · 1h 30m',
        tag: 'now-a',
      },
    ])
  })

  it('uses the same notification tags the desktop alerts use, so the OS swaps instead of stacking', () => {
    const [soon, start] = build({ tasks: [task('a')] })
    assert.equal(soon.tag, 'soon-a')
    assert.equal(start.tag, 'now-a')
  })

  it('skips the heads-up when the lead time is zero, missing or nonsense', () => {
    for (const leadMin of [0, undefined, null, -5, NaN]) {
      const out = build({ tasks: [task('a')] }, { leadMin })
      assert.deepEqual(out.map((r) => r.kind), ['start'])
    }
  })

  it('ignores done tasks, untimed tasks and the repeat rule itself', () => {
    const out = build({
      tasks: [
        task('done', { done: true }),
        task('untimed', { startMin: null }),
        task('inbox', { date: null, startMin: null }),
      ],
    })
    assert.deepEqual(out, [])
  })

  it('never turns a repeating task’s own document into a reminder', () => {
    const rule = task('rule', { recurrence: { freq: 'weekly', days: EVERY_DAY, anchor: MON }, overrides: {} })
    // A caller whose tasksOn leaked the rule itself must still get nothing for it.
    const out = buildReminders({
      tasksOn: () => [rule],
      eventsOn: () => [],
      allTasks: [rule],
      fromKey: MON,
      nowMin: 0,
      days: 1,
      leadMin: 30,
    })
    assert.deepEqual(out, [])
  })

  it('expands a repeating task into one pair per day, each id carrying its day', () => {
    const rule = task('run', {
      startMin: 7 * 60,
      recurrence: { freq: 'weekly', days: EVERY_DAY, anchor: MON },
      overrides: { [TUE]: { done: true } },
    })
    const out = build({ tasks: [rule] }, { days: 3, nowMin: 0 })
    const starts = out.filter((r) => r.kind === 'start')
    // Tuesday's occurrence is ticked off, so it makes no reminder.
    assert.deepEqual(starts.map((r) => r.id), [`start-run~${MON}-${MON}`, `start-run~${addDays(MON, 2)}-${addDays(MON, 2)}`])
    assert.equal(starts[0].tag, `now-run~${MON}`)
  })
})

describe('buildReminders — the clock', () => {
  it('drops what is already past but keeps what is still ahead', () => {
    // 8:45 now: the 8:30 heads-up is gone, the 9:00 start is not.
    const out = build({ tasks: [task('a')] }, { nowMin: 8 * 60 + 45 })
    assert.deepEqual(out.map((r) => r.kind), ['start'])
  })

  it('treats the current minute as already begun', () => {
    const out = build({ tasks: [task('a')] }, { nowMin: 9 * 60 })
    assert.deepEqual(out, [])
  })

  it('writes a heads-up that falls before midnight onto the day it belongs to, as a negative minute', () => {
    const t = task('early', { date: TUE, startMin: 15, durationMin: 30 })
    const out = buildReminders({ ...world({ tasks: [t] }), fromKey: MON, nowMin: 0, days: 2, leadMin: 60 })
    const soon = out.find((r) => r.kind === 'soon')
    assert.equal(soon.key, TUE)
    assert.equal(soon.min, -45)
    // …which is 23:15 the evening before.
    assert.equal(reminderFireAt(soon.key, soon.min), reminderFireAt(MON, 23 * 60 + 15))
  })

  it('does not look past the horizon', () => {
    const out = build({ tasks: [task('far', { date: addDays(MON, 5) })] }, { days: 5 })
    assert.deepEqual(out, [])
    const within = build({ tasks: [task('far', { date: addDays(MON, 5) })] }, { days: 6 })
    assert.equal(within.length, 2)
  })

  it('returns the soonest reminder first, across days', () => {
    const out = build(
      { tasks: [task('late', { date: TUE, startMin: 600 }), task('early', { startMin: 600 })] },
      { days: 2, nowMin: 0, leadMin: 0 },
    )
    // Monday's task is still open on Tuesday, so Tuesday's 8 AM nudge slots in
    // between the two starts — ordering is by instant, not by kind.
    assert.deepEqual(out.map((r) => r.id), [`start-early-${MON}`, `nudge-${TUE}`, `start-late-${TUE}`])
  })
})

describe('buildReminders — events', () => {
  it('reminds for a timed event on the day it starts', () => {
    const out = build({ events: [event('standup', { startMin: 600, durationMin: 30 })] })
    assert.deepEqual(out.map((r) => [r.kind, r.title, r.body]), [
      ['soon', 'Event standup', 'Starts in 30m · 10:00 AM'],
      ['start', 'Event standup', 'Happening now · 30m'],
    ])
  })

  it('has no wording problem with an event that has a start but no length', () => {
    const out = build({ events: [event('open', { startMin: 600, endMin: null, durationMin: null })] })
    assert.equal(out.find((r) => r.kind === 'start').body, 'Happening now')
  })

  it('gives an all-day event nothing to be soon about', () => {
    const out = build({ events: [event('holiday', { startMin: null, endMin: null, durationMin: null })] })
    assert.deepEqual(out, [])
  })

  it('reminds for a multi-day event on its first day only', () => {
    const trip = event('trip', { startDate: MON, endDate: addDays(MON, 2), startMin: 480, endMin: null, durationMin: null })
    const out = build({ events: [trip] }, { days: 3, nowMin: 0, leadMin: 0 })
    assert.deepEqual(out.map((r) => r.key), [MON])
  })

  it('expands a repeating event into one reminder pair per day', () => {
    const rule = event('weekly', {
      startMin: 600,
      recurrence: { freq: 'weekly', days: EVERY_DAY, anchor: MON },
    })
    const out = build({ events: [rule] }, { days: 2, nowMin: 0, leadMin: 0 })
    assert.deepEqual(out.map((r) => r.id), [`start-weekly~${MON}-${MON}`, `start-weekly~${TUE}-${TUE}`])
  })
})

describe('buildReminders — the morning nudge', () => {
  const overdue = (id, date = '2026-08-20') => task(id, { date, startMin: null })

  it('says nothing on a day with nothing overdue', () => {
    assert.deepEqual(build({ tasks: [task('a', { startMin: null })] }, { nowMin: 0 }), [])
  })

  it('sends one per day at the nudge minute when something is overdue', () => {
    const out = build({ tasks: [overdue('a')] }, { days: 3, nowMin: 0, nudgeMin: 8 * 60 + 30 })
    assert.deepEqual(out.map((r) => [r.id, r.kind, r.min]), [
      [`nudge-${MON}`, 'nudge', 510],
      [`nudge-${TUE}`, 'nudge', 510],
      [`nudge-${addDays(MON, 2)}`, 'nudge', 510],
    ])
  })

  it('names a single overdue task plainly', () => {
    const [nudge] = build({ tasks: [overdue('rent')] }, { nowMin: 0 })
    assert.equal(nudge.title, 'Overdue')
    assert.equal(nudge.body, 'Task rent')
  })

  it('lists two, then folds the rest into +N', () => {
    const two = build({ tasks: [overdue('a'), overdue('b')] }, { nowMin: 0 })[0]
    assert.equal(two.body, '2 overdue: Task a, Task b')
    const four = build({ tasks: [overdue('a'), overdue('b'), overdue('c'), overdue('d')] }, { nowMin: 0 })[0]
    assert.equal(four.body, '4 overdue: Task a, Task b, +2')
  })

  it('counts a task that will have slipped by a later day, but not a done or repeating one', () => {
    const tasks = [
      task('upcoming', { date: TUE, startMin: null }),
      task('done', { date: '2026-08-20', startMin: null, done: true }),
      task('habit', { date: '2026-08-20', startMin: null, recurrence: { freq: 'weekly', days: EVERY_DAY, anchor: '2026-08-20' }, overrides: {} }),
    ]
    const out = build({ tasks }, { days: 3, nowMin: 0 })
    // Monday: nothing is overdue yet. Tuesday: still nothing (due that day).
    // Wednesday: Tuesday's task has been missed.
    assert.deepEqual(out.map((r) => [r.key, r.body]), [[addDays(MON, 2), 'Task upcoming']])
  })

  it('skips today’s nudge once its minute has passed', () => {
    const out = build({ tasks: [overdue('a')] }, { days: 2, nowMin: 9 * 60 })
    assert.deepEqual(out.map((r) => r.key), [TUE])
  })

  it('falls back to 8 AM for a nudge minute that makes no sense', () => {
    for (const nudgeMin of [NaN, -1, 1440, undefined, null]) {
      const [nudge] = build({ tasks: [overdue('a')] }, { nowMin: 0, nudgeMin })
      assert.equal(nudge.min, DEFAULT_NUDGE_MIN)
    }
  })
})

describe('reminderFireAt', () => {
  const at = (key, h, m) => {
    const [y, mo, d] = key.split('-').map(Number)
    return new Date(y, mo - 1, d, h, m).getTime()
  }

  it('lands on the local wall-clock time the person saw', () => {
    assert.equal(reminderFireAt(MON, 9 * 60 + 30), at(MON, 9, 30))
    assert.equal(reminderFireAt(MON, 0), at(MON, 0, 0))
  })

  it('can reach back across midnight and forward past it', () => {
    assert.equal(reminderFireAt(TUE, -45), at(MON, 23, 15))
    assert.equal(reminderFireAt(MON, 24 * 60 + 30), at(TUE, 0, 30))
  })

  it('keeps the clock time across a daylight-saving change, whatever the zone', () => {
    // Walk a few weeks so any zone with a transition in here crosses it.
    let key = '2026-03-01'
    for (let i = 0; i < 90; i++, key = addDays(key, 1)) {
      assert.equal(reminderFireAt(key, 12 * 60), at(key, 12, 0))
    }
  })
})
