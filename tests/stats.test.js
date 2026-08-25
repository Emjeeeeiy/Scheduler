import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  dayStats,
  isSeriesTemplate,
  overdueTasks,
  rangeStats,
  summarize,
  tagBreakdown,
  upcomingTasks,
} from '../src/lib/stats.js'

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
