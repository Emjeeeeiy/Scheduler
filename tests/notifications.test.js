import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SOON_WINDOW_MIN, buildNotifications } from '../src/lib/notifications.js'

const timed = (id, date, startMin, durationMin, done = false) => ({
  id,
  date,
  startMin,
  durationMin,
  done,
  tagId: null,
  createdAt: 0,
})

const REF = '2026-08-24'

describe('buildNotifications', () => {
  it('flags a past-due open task as overdue', () => {
    const out = buildNotifications([timed('a', '2026-08-20', 540, 60)], REF, 600)
    assert.equal(out.length, 1)
    assert.equal(out[0].kind, 'overdue')
  })

  it('ignores a done task even if its day has passed', () => {
    const out = buildNotifications([timed('a', '2026-08-20', 540, 60, true)], REF, 600)
    assert.equal(out.length, 0)
  })

  it('flags a task as "now" while inside its window', () => {
    // 9:00-10:00, checked at 9:30
    const out = buildNotifications([timed('a', REF, 540, 60)], REF, 570)
    assert.equal(out.length, 1)
    assert.equal(out[0].kind, 'now')
  })

  it('stops flagging "now" the instant the window ends', () => {
    // Half-open interval, matching layout.js's block-end convention.
    const out = buildNotifications([timed('a', REF, 540, 60)], REF, 600)
    assert.equal(out.length, 0)
  })

  it('flags a task starting exactly at the edge of the soon window', () => {
    const out = buildNotifications([timed('a', REF, 540, 30)], REF, 540 - SOON_WINDOW_MIN)
    assert.equal(out.length, 1)
    assert.equal(out[0].kind, 'soon')
    assert.equal(out[0].minutesUntil, SOON_WINDOW_MIN)
  })

  it('does not flag a task just outside the soon window', () => {
    const out = buildNotifications([timed('a', REF, 540, 30)], REF, 540 - SOON_WINDOW_MIN - 1)
    assert.equal(out.length, 0)
  })

  it('ignores unscheduled and all-day tasks for now/soon', () => {
    const inbox = { id: 'x', date: null, startMin: null, durationMin: 30, done: false, createdAt: 0 }
    const allDay = { id: 'y', date: REF, startMin: null, durationMin: 30, done: false, createdAt: 0 }
    const out = buildNotifications([inbox, allDay], REF, 600)
    assert.equal(out.length, 0)
  })

  it('ignores a timed task on a different, future day', () => {
    const out = buildNotifications([timed('a', '2026-08-25', 540, 30)], REF, 600)
    assert.equal(out.length, 0)
  })

  it('orders overdue before now before soon', () => {
    const out = buildNotifications(
      [
        timed('soon', REF, 570, 30),
        timed('now', REF, 540, 60),
        timed('overdue', '2026-08-20', 540, 60),
      ],
      REF,
      560, // inside 'now' window, 10 minutes before 'soon' starts
    )
    assert.deepEqual(
      out.map((n) => n.kind),
      ['overdue', 'now', 'soon'],
    )
  })

  it('orders multiple "soon" items by how soon, not by id or start time raw order', () => {
    const out = buildNotifications(
      [timed('later', REF, 600, 30), timed('sooner', REF, 550, 30)],
      REF,
      540,
    )
    assert.deepEqual(
      out.map((n) => n.task.id),
      ['sooner', 'later'],
    )
  })
})
