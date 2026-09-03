import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bestDayOfWeek,
  dayStats,
  focusByTag,
  focusStatsFor,
  isSeriesTemplate,
  openBlockers,
  overdueTasks,
  rangeStats,
  rollUpTags,
  summarize,
  tagBreakdown,
  upcomingTasks,
} from '../src/lib/stats.js'
import { weekdayOf } from '../src/lib/date.js'

const timed = (id, date, startMin, durationMin, done = false, tagId = null) => ({
  id,
  date,
  startMin,
  durationMin,
  done,
  tagId,
  createdAt: 0,
})

const allDay = (id, date, done = false) => ({
  id,
  date,
  startMin: null,
  durationMin: 30,
  done,
  tagId: null,
  createdAt: 0,
})

describe('dayStats', () => {
  it('counts only timed tasks toward planned hours', () => {
    // An all-day item is a commitment to a day, not to a span of hours —
    // folding it into the totals would make "planned" meaningless.
    const stats = dayStats([timed('a', '2026-08-24', 540, 60), allDay('b', '2026-08-24')])
    assert.equal(stats.plannedMin, 60)
    assert.equal(stats.count, 2)
  })

  it('tracks completion separately from planning', () => {
    const stats = dayStats([
      timed('a', '2026-08-24', 540, 60, true),
      timed('b', '2026-08-24', 660, 30),
    ])
    assert.equal(stats.plannedMin, 90)
    assert.equal(stats.completedMin, 60)
    assert.equal(stats.remainingMin, 30)
    assert.equal(stats.doneCount, 1)
    assert.equal(stats.openCount, 1)
  })

  it('is all zeroes for an empty day', () => {
    const stats = dayStats([])
    assert.equal(stats.plannedMin, 0)
    assert.equal(stats.count, 0)
  })
})

describe('summarize', () => {
  it('reports an empty range as undefined, not 0%', () => {
    // Averaging an empty day in as zero would quietly punish deliberate rest.
    const totals = summarize(rangeStats(() => [], ['2026-08-24', '2026-08-25']))
    assert.equal(totals.completionRate, null)
    assert.equal(totals.hourRate, null)
  })

  it('adds up a range', () => {
    const byDate = new Map([
      ['2026-08-24', [timed('a', '2026-08-24', 540, 60, true)]],
      ['2026-08-25', [timed('b', '2026-08-25', 540, 60)]],
    ])
    const totals = summarize(
      rangeStats((key) => byDate.get(key) ?? [], ['2026-08-24', '2026-08-25']),
    )
    assert.equal(totals.plannedMin, 120)
    assert.equal(totals.completedMin, 60)
    assert.equal(totals.completionRate, 0.5)
    assert.equal(totals.hourRate, 0.5)
  })
})

describe('tagBreakdown', () => {
  const tags = [{ id: 'work', name: 'Work', color: 'var(--tag-blue)' }]

  it('reports untagged work rather than dropping it', () => {
    const rows = tagBreakdown(
      [timed('a', '2026-08-24', 540, 120, false, 'work'), timed('b', '2026-08-24', 700, 60)],
      tags,
    )
    assert.equal(rows.length, 2)
    assert.equal(rows[0].tag.name, 'Work') // largest first
    assert.equal(rows[1].tag.name, 'Untagged')
  })

  it('survives a tag id with no matching tag doc', () => {
    const rows = tagBreakdown([timed('a', '2026-08-24', 540, 60, false, 'ghost')], [])
    assert.equal(rows.length, 1)
    assert.equal(rows[0].plannedMin, 60)
  })
})

describe('overdueTasks', () => {
  it('finds open tasks whose day has passed', () => {
    const out = overdueTasks(
      [
        timed('past-open', '2026-08-20', 540, 60),
        timed('past-done', '2026-08-20', 600, 60, true),
        timed('today', '2026-08-24', 540, 60),
        timed('future', '2026-08-25', 540, 60),
        { id: 'inbox', date: null, startMin: null, durationMin: 30, done: false, createdAt: 0 },
      ],
      '2026-08-24',
    )
    assert.deepEqual(
      out.map((t) => t.id),
      ['past-open'],
    )
  })

  it('never piles up a repeating task’s own anchor document', () => {
    // Missing Tuesday's run is not work left behind; it is a day of a habit
    // that comes back on its own, not something for the overdue list to carry.
    const out = overdueTasks(
      [{ ...timed('habit', '2026-08-20', 540, 60), recurrence: { days: [0, 1, 2, 3, 4, 5, 6] } }],
      '2026-08-24',
    )
    assert.equal(out.length, 0)
  })
})

describe('isSeriesTemplate', () => {
  it('is true only for a rule document, not one of its expanded days', () => {
    const rule = { recurrence: { days: [1] } }
    assert.equal(isSeriesTemplate(rule), true)
    assert.equal(isSeriesTemplate({ ...rule, occurrenceDate: '2026-08-24' }), false)
    assert.equal(isSeriesTemplate({ recurrence: null }), false)
  })
})

describe('upcomingTasks', () => {
  it('skips blocks that have already finished today', () => {
    const out = upcomingTasks(
      [
        timed('done-earlier', '2026-08-24', 8 * 60, 60), // ends 09:00
        timed('in-progress', '2026-08-24', 9 * 60 + 30, 60), // ends 10:30
        timed('later', '2026-08-24', 14 * 60, 60),
        timed('tomorrow', '2026-08-25', 9 * 60, 60),
      ],
      '2026-08-24',
      10 * 60, // it is 10:00
      5,
    )
    assert.deepEqual(
      out.map((t) => t.id),
      ['in-progress', 'later', 'tomorrow'],
    )
  })

  it('honours the limit', () => {
    const out = upcomingTasks(
      [
        timed('a', '2026-08-25', 540, 60),
        timed('b', '2026-08-26', 540, 60),
        timed('c', '2026-08-27', 540, 60),
      ],
      '2026-08-24',
      0,
      2,
    )
    assert.equal(out.length, 2)
  })
})

describe('focusStatsFor', () => {
  const sessions = [
    { date: '2026-08-24', minutes: 25, tagId: 'work' },
    { date: '2026-08-24', minutes: 25, tagId: 'work' },
    { date: '2026-08-25', minutes: 25, tagId: 'personal' },
    { date: '2026-09-01', minutes: 25, tagId: null },
  ]

  it('sums minutes and counts rounds within the given day keys', () => {
    assert.deepEqual(focusStatsFor(sessions, ['2026-08-24']), { minutes: 50, count: 2 })
    assert.deepEqual(focusStatsFor(sessions, ['2026-08-24', '2026-08-25']), { minutes: 75, count: 3 })
  })

  it('is zero for a range with nothing in it', () => {
    assert.deepEqual(focusStatsFor(sessions, ['2020-01-01']), { minutes: 0, count: 0 })
    assert.deepEqual(focusStatsFor([], ['2026-08-24']), { minutes: 0, count: 0 })
  })
})

describe('focusByTag', () => {
  it('groups minutes by tag, largest first, reporting untagged rather than dropping it', () => {
    const sessions = [
      { tagId: 'work', minutes: 25 },
      { tagId: 'work', minutes: 25 },
      { tagId: 'personal', minutes: 10 },
      { tagId: null, minutes: 90 },
    ]
    const rows = focusByTag(sessions, [{ id: 'work', name: 'Work' }, { id: 'personal', name: 'Personal' }])
    assert.deepEqual(
      rows.map((r) => [r.tag.name, r.minutes]),
      [['Untagged', 90], ['Work', 50], ['Personal', 10]],
    )
  })
})

describe('openBlockers', () => {
  const all = [
    timed('a', '2026-08-24', 540, 60, false),
    timed('b', '2026-08-24', 600, 60, true),
  ]

  it('is empty when a task has no blockers', () => {
    assert.deepEqual(openBlockers({ blockedBy: [] }, all), [])
    assert.deepEqual(openBlockers({}, all), [])
  })

  it('only reports blockers that still exist and are not done', () => {
    const blocked = openBlockers({ blockedBy: ['a', 'b', 'missing'] }, all)
    assert.deepEqual(
      blocked.map((t) => t.id),
      ['a'],
    )
  })

  it('is empty once every blocker is done', () => {
    assert.deepEqual(openBlockers({ blockedBy: ['b'] }, all), [])
  })
})

describe('rollUpTags', () => {
  const TAGS = [
    { id: 'work', name: 'Work', parentId: null },
    { id: 'deep', name: 'Deep work', parentId: 'work' },
    { id: 'deeper', name: 'Deeper still', parentId: 'deep' },
    { id: 'home', name: 'Home', parentId: null },
  ]

  it('folds a child into its parent instead of listing both', () => {
    const rows = tagBreakdown(
      [
        timed('a', '2026-08-24', 540, 60, false, 'work'),
        timed('b', '2026-08-24', 600, 30, false, 'deep'),
      ],
      TAGS,
    )
    const rolled = rollUpTags(rows, TAGS)
    assert.equal(rolled.length, 1)
    assert.equal(rolled[0].tag.name, 'Work')
    assert.equal(rolled[0].plannedMin, 90)
    assert.equal(rolled[0].count, 2)
  })

  it('climbs the whole chain, not just one level', () => {
    const rows = tagBreakdown([timed('a', '2026-08-24', 540, 45, false, 'deeper')], TAGS)
    const rolled = rollUpTags(rows, TAGS)
    assert.equal(rolled[0].id, 'work')
    assert.equal(rolled[0].plannedMin, 45)
  })

  it('leaves a top-level tag and untagged work alone', () => {
    const rows = tagBreakdown(
      [timed('a', '2026-08-24', 540, 60, false, 'home'), timed('b', '2026-08-24', 600, 30)],
      TAGS,
    )
    const rolled = rollUpTags(rows, TAGS)
    assert.deepEqual(
      rolled.map((r) => r.tag.name).sort(),
      ['Home', 'Untagged'],
    )
  })

  it('sums completed minutes alongside planned', () => {
    const rows = tagBreakdown(
      [
        timed('a', '2026-08-24', 540, 60, true, 'work'),
        timed('b', '2026-08-24', 600, 60, false, 'deep'),
      ],
      TAGS,
    )
    assert.equal(rollUpTags(rows, TAGS)[0].completedMin, 60)
  })

  it('terminates on a cycle rather than climbing forever', () => {
    // ScheduleContext already breaks loops before anything gets here, but a
    // pure module callable on any list should not hang on bad input.
    const looped = [
      { id: 'a', name: 'A', parentId: 'b' },
      { id: 'b', name: 'B', parentId: 'a' },
    ]
    const rows = tagBreakdown([timed('t', '2026-08-24', 540, 30, false, 'a')], looped)
    const rolled = rollUpTags(rows, looped)
    assert.equal(rolled.length, 1)
    assert.equal(rolled[0].plannedMin, 30)
  })

  it('is sorted largest first, like tagBreakdown itself', () => {
    const rows = tagBreakdown(
      [
        timed('a', '2026-08-24', 540, 15, false, 'work'),
        timed('b', '2026-08-24', 600, 120, false, 'home'),
      ],
      TAGS,
    )
    assert.deepEqual(
      rollUpTags(rows, TAGS).map((r) => r.tag.name),
      ['Home', 'Work'],
    )
  })
})

describe('bestDayOfWeek', () => {
  // Weekdays are derived through weekdayOf rather than hardcoded, for the
  // same reason date.js warns against `new Date('YYYY-MM-DD')` — the shape of
  // a key says nothing about which day it lands on.
  const row = (key, count, doneCount) => ({ key, count, doneCount, plannedMin: 0, completedMin: 0 })

  it('picks the weekday that finishes the largest share of its work', () => {
    const rows = [
      row('2026-08-24', 2, 2),
      row('2026-08-31', 2, 2),
      row('2026-08-25', 2, 0),
      row('2026-09-01', 2, 0),
    ]
    const best = bestDayOfWeek(rows)
    assert.equal(best.day, weekdayOf('2026-08-24'))
    assert.equal(best.rate, 1)
  })

  it('ignores a weekday with too little history to mean anything', () => {
    const rows = [row('2026-08-24', 1, 1), row('2026-08-25', 4, 3)]
    assert.equal(bestDayOfWeek(rows).day, weekdayOf('2026-08-25'))
  })

  it('is null when no weekday clears the minimum', () => {
    assert.equal(bestDayOfWeek([row('2026-08-24', 1, 1)]), null)
    assert.equal(bestDayOfWeek([]), null)
  })

  it('aggregates a weekday across the range rather than ranking single days', () => {
    // One hit and three misses on the same weekday is 25%, not a perfect day
    // sitting beside a bad one.
    assert.equal(bestDayOfWeek([row('2026-08-24', 1, 1), row('2026-08-31', 3, 0)]).rate, 0.25)
  })
})
