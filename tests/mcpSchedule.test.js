/* mcp/schedule.js — the MCP layer's read-side logic, with no I/O. Everything
 * here is a pure function of the normalized tasks, events and tags, so these
 * tests build those through the app's own normalizers (the same objects the app
 * sees) and check what the assistant would be told.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeEvent, normalizeTag, normalizeTask } from '@cadence/shared/normalize.js'
import {
  agendaForDays,
  eventsOnDay,
  findTasks,
  freeWindows,
  isRealDay,
  matchesText,
  parseTime,
  resolveTag,
  tagPaths,
  taskView,
  tasksOnDay,
  todayIn,
} from '../mcp/schedule.js'

// 2026-08-24 is a Monday.
const MON = '2026-08-24'
const TUE = '2026-08-25'
const SAT = '2026-08-29'

const task = (id, raw) => normalizeTask(id, { createdAt: 1, ...raw })
const event = (id, raw) => normalizeEvent(id, { createdAt: 1, ...raw })
const tag = (id, raw) => normalizeTag(id, raw)

const TAGS = [
  tag('work', { name: 'Work', slot: 'blue', order: 0 }),
  tag('deep', { name: 'Deep work', slot: 'violet', order: 1, parentId: 'work' }),
  tag('home', { name: 'Home', slot: 'green', order: 2 }),
]

const WEEKDAYS_RULE = { freq: 'weekly', days: [1, 2, 3, 4, 5], anchor: '2026-08-17' }

describe('todayIn', () => {
  it('answers in the requested zone, not the server’s', () => {
    const instant = new Date('2026-08-24T18:30:00Z')
    assert.deepEqual(todayIn('UTC', instant), { key: '2026-08-24', min: 18 * 60 + 30 })
    // Manila is UTC+8: already the next morning.
    assert.deepEqual(todayIn('Asia/Manila', instant), { key: '2026-08-25', min: 2 * 60 + 30 })
    // Los Angeles is UTC-7 in August.
    assert.deepEqual(todayIn('America/Los_Angeles', instant), { key: '2026-08-24', min: 11 * 60 + 30 })
  })

  it('reads midnight as minute 0, not 1440', () => {
    assert.deepEqual(todayIn('UTC', new Date('2026-08-24T00:00:00Z')), { key: '2026-08-24', min: 0 })
  })
})

describe('isRealDay / parseTime', () => {
  it('rejects a day that only looks like a date', () => {
    assert.equal(isRealDay('2026-08-24'), true)
    assert.equal(isRealDay('2028-02-29'), true)
    assert.equal(isRealDay('2026-02-29'), false)
    assert.equal(isRealDay('2026-02-31'), false)
    assert.equal(isRealDay('2026-13-01'), false)
    assert.equal(isRealDay('tomorrow'), false)
    assert.equal(isRealDay(undefined), false)
  })

  it('accepts only 24-hour HH:MM', () => {
    assert.equal(parseTime('09:30'), 570)
    assert.equal(parseTime('00:00'), 0)
    assert.equal(parseTime('23:59'), 1439)
    for (const bad of ['24:00', '9:30', '09:60', '09:30:00', '', null, undefined, 930]) {
      assert.equal(parseTime(bad), null, String(bad))
    }
  })
})

describe('tags', () => {
  it('builds "Parent / Child" paths', () => {
    const paths = tagPaths(TAGS)
    assert.equal(paths.get('work'), 'Work')
    assert.equal(paths.get('deep'), 'Work / Deep work')
  })

  it('survives a tag cycle and a missing parent', () => {
    const paths = tagPaths([
      tag('a', { name: 'A', parentId: 'b' }),
      tag('b', { name: 'B', parentId: 'a' }),
      tag('c', { name: 'C', parentId: 'ghost' }),
    ])
    assert.ok(paths.get('a').includes('A'))
    assert.equal(paths.get('c'), 'C')
  })

  it('resolves by id, name (any case) or full path', () => {
    assert.equal(resolveTag('deep', TAGS).tag.id, 'deep')
    assert.equal(resolveTag('DEEP WORK', TAGS).tag.id, 'deep')
    assert.equal(resolveTag('work / deep work', TAGS).tag.id, 'deep')
    assert.equal(resolveTag('  Home ', TAGS).tag.id, 'home')
  })

  it('never invents a tag: an unknown one lists what exists', () => {
    const result = resolveTag('Errands', TAGS)
    assert.equal(result.tag, undefined)
    assert.match(result.error, /No tag called "Errands"/)
    assert.match(result.error, /Work \/ Deep work/)
  })

  it('refuses to guess between two tags of the same name', () => {
    const twins = [tag('x', { name: 'Admin' }), tag('y', { name: 'Admin', parentId: 'x' })]
    assert.match(resolveTag('Admin', twins).error, /More than one tag/)
    assert.equal(resolveTag('y', twins).tag.id, 'y')
  })
})

describe('what is on a day', () => {
  const series = task('habit', { title: 'Stretch', date: '2026-08-17', recurrence: WEEKDAYS_RULE })

  it('places a one-off task only on its own day', () => {
    const one = task('one', { title: 'Report', date: MON })
    assert.deepEqual(tasksOnDay([one], MON).map((t) => t.id), ['one'])
    assert.deepEqual(tasksOnDay([one], TUE), [])
  })

  it('expands a repeating task into that day’s occurrence, with the occurrence id', () => {
    const [occurrence] = tasksOnDay([series], MON)
    assert.equal(occurrence.id, `habit~${MON}`)
    assert.equal(occurrence.seriesId, 'habit')
    assert.deepEqual(tasksOnDay([series], SAT), [], 'not on a Saturday')
    // The series document is a rule: it is not also listed on its anchor day.
    assert.deepEqual(tasksOnDay([series], '2026-08-17').map((t) => t.id), ['habit~2026-08-17'])
  })

  it('skips a day that was detached, and reports a ticked-off day as done', () => {
    const edited = task('habit', {
      title: 'Stretch',
      date: '2026-08-17',
      recurrence: WEEKDAYS_RULE,
      overrides: { [MON]: { detached: true }, [TUE]: { done: true, completedAt: 5 } },
    })
    assert.deepEqual(tasksOnDay([edited], MON), [])
    assert.equal(tasksOnDay([edited], TUE)[0].done, true)
  })

  it('orders all-day items first, then by time', () => {
    const items = [
      task('late', { title: 'Late', date: MON, startMin: 900 }),
      task('anytime', { title: 'Any', date: MON }),
      task('early', { title: 'Early', date: MON, startMin: 480 }),
    ]
    assert.deepEqual(tasksOnDay(items, MON).map((t) => t.id), ['anytime', 'early', 'late'])
  })

  it('covers every day of a multi-day event, and expands a repeating one', () => {
    const trip = event('trip', { title: 'Retreat', startDate: '2026-08-22', endDate: '2026-08-25' })
    assert.equal(eventsOnDay([trip], MON).length, 1)
    assert.equal(eventsOnDay([trip], '2026-08-26').length, 0)

    const weekly = event('standup', {
      title: 'Standup',
      startDate: '2026-08-17',
      endDate: '2026-08-17',
      startMin: 540,
      recurrence: { freq: 'weekly', days: [1], anchor: '2026-08-17' },
    })
    assert.equal(eventsOnDay([weekly], MON)[0].id, `standup~${MON}`)
    assert.equal(eventsOnDay([weekly], TUE).length, 0)
  })
})

describe('free time', () => {
  const window = { fromMin: 8 * 60, toMin: 20 * 60 }

  it('treats timed tasks and timed single-day events as busy', () => {
    const tasks = [task('t', { title: 'T', date: MON, startMin: 9 * 60, durationMin: 60 })]
    const events = [event('e', { title: 'E', startDate: MON, endDate: MON, startMin: 13 * 60, endMin: 14 * 60 })]
    assert.deepEqual(freeWindows(tasks, events, window), [
      { start: '08:00', end: '09:00', lengthMin: 60 },
      { start: '10:00', end: '13:00', lengthMin: 180 },
      { start: '14:00', end: '20:00', lengthMin: 360 },
    ])
  })

  it('does not let a multi-day or all-day event block time', () => {
    const trip = event('trip', { title: 'Retreat', startDate: MON, endDate: TUE, startMin: 600 })
    const allDay = event('all', { title: 'Holiday', startDate: MON, endDate: MON })
    assert.deepEqual(freeWindows([], [trip, allDay], window), [{ start: '08:00', end: '20:00', lengthMin: 720 }])
  })

  it('does not offer time that has already passed today', () => {
    const [today] = agendaForDays({
      tasks: [],
      events: [],
      tags: [],
      startDate: MON,
      days: 1,
      today: MON,
      nowMin: 15 * 60,
    })
    assert.equal(today.freeWindows[0].start, '15:00')
    const [tomorrow] = agendaForDays({
      tasks: [],
      events: [],
      tags: [],
      startDate: TUE,
      days: 1,
      today: MON,
      nowMin: 15 * 60,
    })
    assert.equal(tomorrow.freeWindows[0].start, '08:00', 'only today is trimmed')
  })

  it('offers nothing once the working window has closed for today', () => {
    const [today] = agendaForDays({
      tasks: [],
      events: [],
      tags: [],
      startDate: MON,
      days: 1,
      today: MON,
      nowMin: 21 * 60,
    })
    assert.deepEqual(today.freeWindows, [])
  })
})

describe('agendaForDays', () => {
  const tasks = [
    task('a', { title: 'Done thing', date: MON, startMin: 540, done: true, tagId: 'deep' }),
    task('b', { title: 'Open thing', date: MON, startMin: 660 }),
  ]

  it('keeps done tasks busy even when it hides them from the list', () => {
    const [day] = agendaForDays({ tasks, events: [], tags: TAGS, startDate: MON, days: 1, includeDone: false, today: TUE })
    assert.deepEqual(day.tasks.map((t) => t.id), ['b'])
    assert.ok(!day.freeWindows.some((w) => w.start === '09:00'), '09:00 was spent on the done task')
  })

  it('returns one entry per day with its weekday and the tag path', () => {
    const days = agendaForDays({ tasks, events: [], tags: TAGS, startDate: MON, days: 3, today: TUE })
    assert.deepEqual(days.map((d) => [d.date, d.weekday]), [
      [MON, 'Monday'],
      [TUE, 'Tuesday'],
      ['2026-08-26', 'Wednesday'],
    ])
    assert.equal(days[0].tasks[0].tag, 'Work / Deep work')
  })
})

describe('taskView', () => {
  it('labels a repeat and carries its series id', () => {
    const series = task('habit', { title: 'Stretch', date: '2026-08-17', recurrence: WEEKDAYS_RULE })
    const view = taskView(tasksOnDay([series], MON)[0], new Map())
    assert.equal(view.id, `habit~${MON}`)
    assert.equal(view.seriesId, 'habit')
    assert.equal(view.repeats, 'Every weekday')
  })

  it('caps long notes and omits empty ones', () => {
    const long = taskView(task('n', { title: 'N', notes: 'x'.repeat(1000) }), new Map())
    assert.ok(long.notes.length <= 301)
    assert.ok(long.notes.endsWith('…'))
    assert.equal('notes' in taskView(task('m', { title: 'M', notes: '   ' }), new Map()), false)
  })
})

describe('matchesText', () => {
  const t = task('t', { title: 'Call the Dentist', notes: 'about the crown' })
  it('needs every word, in any order and any case, in title or notes', () => {
    assert.equal(matchesText(t, 'dentist call'), true)
    assert.equal(matchesText(t, 'CROWN dentist'), true)
    assert.equal(matchesText(t, 'dentist plumber'), false)
    assert.equal(matchesText(t, ''), true)
  })
})

describe('findTasks', () => {
  const tasks = [
    task('inbox1', { title: 'Sort photos', createdAt: 10 }),
    task('inbox2', { title: 'Read the Work memo', createdAt: 20, tagId: 'work' }),
    task('over', { title: 'Overdue thing', date: '2026-08-20', startMin: 600 }),
    task('overdone', { title: 'Finished long ago', date: '2026-08-20', done: true }),
    task('today', { title: 'Today thing', date: MON, tagId: 'deep' }),
    task('far', { title: 'Next month', date: '2026-10-01' }),
    task('habit', { title: 'Stretch', date: '2026-08-17', recurrence: WEEKDAYS_RULE }),
  ]
  const run = (extra) => findTasks({ tasks, tags: TAGS, today: MON, view: 'upcoming', ...extra })
  const ids = (result) => result.tasks.map((t) => t.id)

  it('inbox: undated, one-off tasks, newest first', () => {
    assert.deepEqual(ids(run({ view: 'inbox' })), ['inbox2', 'inbox1'])
  })

  it('overdue: open and in the past, never a repeat or a done task', () => {
    assert.deepEqual(ids(run({ view: 'overdue' })), ['over'])
    assert.deepEqual(ids(run({ view: 'overdue', includeDone: true })), ['over'])
  })

  it('upcoming: the next 14 days with repeats expanded, not the far future', () => {
    const got = ids(run({ view: 'upcoming' }))
    assert.ok(got.includes('today'))
    assert.ok(got.includes(`habit~${MON}`))
    assert.ok(got.includes('habit~2026-09-04'), 'day 11')
    assert.ok(!got.includes('far'))
    assert.ok(!got.includes('over'))
  })

  it('all: every task, a repeat appearing once as its rule', () => {
    const got = ids(run({ view: 'all', includeDone: true }))
    assert.equal(got.filter((id) => id.startsWith('habit')).length, 1)
    assert.equal(got.length, tasks.length)
  })

  it('hides done tasks unless asked', () => {
    assert.ok(!ids(run({ view: 'all' })).includes('overdone'))
    assert.ok(ids(run({ view: 'all', includeDone: true })).includes('overdone'))
  })

  it('a tag filter includes the tags filed beneath it', () => {
    assert.deepEqual(ids(run({ view: 'all', tag: 'Work' })).sort(), ['inbox2', 'today'])
    assert.deepEqual(ids(run({ view: 'all', tag: 'Work / Deep work' })), ['today'])
  })

  it('reports an unknown tag rather than returning everything', () => {
    const result = run({ tag: 'Nope' })
    assert.match(result.error, /No tag called "Nope"/)
    assert.deepEqual(result.tasks, [])
  })

  it('searches title and notes', () => {
    assert.deepEqual(ids(run({ view: 'all', query: 'memo work' })), ['inbox2'])
  })

  it('limits the list and says it was cut short', () => {
    const result = run({ view: 'all', limit: 2 })
    assert.equal(result.tasks.length, 2)
    assert.equal(result.truncated, true)
    assert.equal(result.total, 6)
    assert.equal(run({ view: 'all', limit: 50 }).truncated, false)
  })
})
