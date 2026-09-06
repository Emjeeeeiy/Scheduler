import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { selectPushable } from '../lib/pushSelection.js'

const item = (id) => ({ id, kind: 'soon', task: { id } })

describe('selectPushable', () => {
  it('sends everything on the first run, with nothing already sent', () => {
    const { toSend, nextSentIds } = selectPushable([item('a'), item('b')], [])
    assert.deepEqual(toSend.map((i) => i.id), ['a', 'b'])
    assert.deepEqual(nextSentIds.sort(), ['a', 'b'])
  })

  it('does not resend something already pushed', () => {
    const { toSend, nextSentIds } = selectPushable([item('a'), item('b')], ['a'])
    assert.deepEqual(toSend.map((i) => i.id), ['b'])
    assert.deepEqual(nextSentIds.sort(), ['a', 'b'])
  })

  it('sends nothing once everything current has already gone out', () => {
    const { toSend, nextSentIds } = selectPushable([item('a'), item('b')], ['a', 'b'])
    assert.deepEqual(toSend, [])
    assert.deepEqual(nextSentIds.sort(), ['a', 'b'])
  })

  it('drops a sent id once it stops being current — the task resolved', () => {
    // 'a' was pushed on an earlier run; this run it's gone (done, or its
    // window passed). It should not linger in the sent set forever.
    const { nextSentIds } = selectPushable([item('b')], ['a', 'b'])
    assert.deepEqual(nextSentIds, ['b'])
  })

  it('lets a resolved id notify again if it genuinely comes back', () => {
    // First run: 'a' is overdue, gets sent, then resolves (rescheduled).
    const first = selectPushable([item('a')], [])
    assert.deepEqual(first.toSend.map((i) => i.id), ['a'])

    // Some run in between where 'a' isn't present at all — its sent id is
    // dropped here.
    const middle = selectPushable([], first.nextSentIds)
    assert.deepEqual(middle.nextSentIds, [])

    // Later, 'a' becomes overdue again. Nothing should still be blocking it.
    const later = selectPushable([item('a')], middle.nextSentIds)
    assert.deepEqual(later.toSend.map((i) => i.id), ['a'])
  })

  it('treats a missing sent list the same as an empty one', () => {
    const { toSend } = selectPushable([item('a')], undefined)
    assert.deepEqual(toSend.map((i) => i.id), ['a'])
  })

  it('is empty in, empty out', () => {
    const { toSend, nextSentIds } = selectPushable([], ['stale'])
    assert.deepEqual(toSend, [])
    assert.deepEqual(nextSentIds, [])
  })
})
