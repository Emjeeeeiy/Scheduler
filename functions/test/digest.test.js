import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildDigestSummary, renderDigestEmail } from '../lib/digest.js'

const DAY = '2026-08-24'

const task = (id, patch) => ({
  id,
  title: `Task ${id}`,
  date: DAY,
  startMin: null,
  durationMin: 30,
  done: false,
  recurrence: null,
  ...patch,
})

describe('buildDigestSummary', () => {
  it('reports a quiet day as genuinely empty, not zeroed-out noise', () => {
    const summary = buildDigestSummary({ todayItems: [], allTasks: [], upcomingPool: [], todayKey: DAY })
    assert.equal(summary.stats.count, 0)
    assert.deepEqual(summary.overdue, [])
    assert.deepEqual(summary.next, [])
  })

  it('totals today from todayItems specifically, not the whole task list', () => {
    const today = [task('a', { startMin: 540 }), task('b', { startMin: 600, done: true })]
    const elsewhere = [task('c', { date: '2026-09-01' })]
    const summary = buildDigestSummary({
      todayItems: today,
      allTasks: [...today, ...elsewhere],
      upcomingPool: [],
      todayKey: DAY,
    })
    assert.equal(summary.stats.count, 2)
    assert.equal(summary.stats.doneCount, 1)
  })

  it('finds overdue tasks from the full list, even ones not in todayItems', () => {
    const overdue = task('old', { date: '2026-08-01' })
    const summary = buildDigestSummary({
      todayItems: [],
      allTasks: [overdue],
      upcomingPool: [],
      todayKey: DAY,
    })
    assert.equal(summary.overdue.length, 1)
    assert.equal(summary.overdue[0].id, 'old')
  })

  it('lists upcoming tasks from the horizon pool, soonest first', () => {
    const pool = [task('later', { date: '2026-08-26' }), task('sooner', { date: '2026-08-25' })]
    const summary = buildDigestSummary({
      todayItems: [],
      allTasks: pool,
      upcomingPool: pool,
      todayKey: DAY,
    })
    assert.deepEqual(
      summary.next.map((t) => t.id),
      ['sooner', 'later'],
    )
  })
})

describe('renderDigestEmail', () => {
  it('says "nothing on the books" for a quiet day, in both subject and body', () => {
    const summary = buildDigestSummary({ todayItems: [], allTasks: [], upcomingPool: [], todayKey: DAY })
    const { subject, text, html } = renderDigestEmail(summary)
    assert.match(subject, /nothing on the books/)
    assert.match(text, /Nothing scheduled, nothing overdue\./)
    assert.match(html, /Nothing scheduled, nothing overdue\./)
  })

  it('states counts in the subject for a real day', () => {
    const today = [task('a', { startMin: 540 })]
    const overdue = [task('old', { date: '2026-08-01' })]
    const summary = buildDigestSummary({
      todayItems: today,
      allTasks: [...today, ...overdue],
      upcomingPool: [],
      todayKey: DAY,
    })
    const { subject } = renderDigestEmail(summary)
    assert.match(subject, /1 task/)
    assert.match(subject, /1 overdue/)
  })

  it('lists every overdue task by title in the plain-text body', () => {
    const overdue = [task('old1', { title: 'File taxes', date: '2026-08-01' })]
    const summary = buildDigestSummary({ todayItems: [], allTasks: overdue, upcomingPool: [], todayKey: DAY })
    const { text } = renderDigestEmail(summary)
    assert.match(text, /File taxes/)
  })

  it('escapes a title that looks like markup, in the html body only', () => {
    const today = [task('a', { title: '<script>alert(1)</script>', startMin: 540 })]
    const summary = buildDigestSummary({ todayItems: today, allTasks: today, upcomingPool: today, todayKey: DAY })
    const { html } = renderDigestEmail(summary)
    assert.ok(!html.includes('<script>'))
    assert.match(html, /&lt;script&gt;/)
  })

  it('produces a non-empty, real plain-text alternative, not an afterthought', () => {
    const today = [task('a', { startMin: 540 })]
    const summary = buildDigestSummary({ todayItems: today, allTasks: today, upcomingPool: today, todayKey: DAY })
    const { text } = renderDigestEmail(summary)
    assert.ok(text.length > 20)
    assert.ok(!text.includes('<'))
  })
})
