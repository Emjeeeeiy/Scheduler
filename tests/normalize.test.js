import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_DURATION_MIN,
  DEFAULT_EVENT_DURATION_MIN,
  MAX_EVENT_DAYS,
  TAG_SLOTS,
  normalizeEvent,
  normalizeTag,
  normalizeTask,
} from '../src/lib/normalize.js'
import { addDays } from '../src/lib/date.js'

const DAY = '2026-08-24'

describe('normalizeTask', () => {
  it('fills in every field from an empty document', () => {
    assert.deepEqual(normalizeTask('t1', {}), {
      id: 't1',
      title: 'Untitled task',
      notes: '',
      date: null,
      startMin: null,
      durationMin: DEFAULT_DURATION_MIN,
      tagId: null,
      done: false,
      completedAt: null,
      recurrence: null,
      overrides: {},
      createdAt: 0,
      updatedAt: 0,
    })
  })

  it('trims the title, and falls back when it is blank', () => {
    assert.equal(normalizeTask('t1', { title: '  Run  ' }).title, 'Run')
    assert.equal(normalizeTask('t1', { title: '   ' }).title, 'Untitled task')
  })

  it('drops a date that is not a YYYY-MM-DD-shaped string', () => {
    // isValidKey only checks the shape, not calendar validity — a
    // well-formed but impossible date (month 13) is a separate concern this
    // layer does not claim to catch.
    assert.equal(normalizeTask('t1', { date: 'not-a-date' }).date, null)
    assert.equal(normalizeTask('t1', { date: 12345 }).date, null)
    assert.equal(normalizeTask('t1', { date: undefined }).date, null)
  })

  it('drops a start time that has no date to belong to', () => {
    // A start time without a date is meaningless — it belongs in the inbox.
    assert.equal(normalizeTask('t1', { startMin: 600 }).startMin, null)
  })

  it('clamps an out-of-range start time to a real minute of the day', () => {
    assert.equal(normalizeTask('t1', { date: DAY, startMin: -30 }).startMin, 0)
    assert.equal(normalizeTask('t1', { date: DAY, startMin: 5000 }).startMin, 1439)
  })

  it('clamps duration to a sane range and rounds it', () => {
    assert.equal(normalizeTask('t1', { durationMin: 1 }).durationMin, 5)
    assert.equal(normalizeTask('t1', { durationMin: 999999 }).durationMin, 24 * 60)
    assert.equal(normalizeTask('t1', { durationMin: 30.6 }).durationMin, 31)
    assert.equal(normalizeTask('t1', { durationMin: 'soon' }).durationMin, DEFAULT_DURATION_MIN)
  })

  it('drops a non-string or empty tagId', () => {
    assert.equal(normalizeTask('t1', { tagId: 42 }).tagId, null)
    assert.equal(normalizeTask('t1', { tagId: '' }).tagId, null)
    assert.equal(normalizeTask('t1', { tagId: 'work' }).tagId, 'work')
  })

  it('only treats an exact boolean true as done', () => {
    assert.equal(normalizeTask('t1', { done: 'yes' }).done, false)
    assert.equal(normalizeTask('t1', { done: 1 }).done, false)
    assert.equal(normalizeTask('t1', { done: true }).done, true)
  })

  it('keeps overrides only when the task is actually a series', () => {
    const notRecurring = normalizeTask('t1', {
      date: DAY,
      overrides: { [DAY]: { done: true, completedAt: 1 } },
    })
    assert.deepEqual(notRecurring.overrides, {})

    const recurring = normalizeTask('t1', {
      date: DAY,
      recurrence: { days: [1, 2, 3, 4, 5] },
      overrides: { [DAY]: { done: true, completedAt: 1 } },
    })
    assert.ok(recurring.recurrence)
    assert.deepEqual(recurring.overrides, { [DAY]: { done: true, completedAt: 1 } })
  })
})

describe('normalizeEvent', () => {
  it('fills in every field from an empty document', () => {
    assert.deepEqual(normalizeEvent('e1', {}), {
      id: 'e1',
      title: 'Untitled event',
      notes: '',
      startDate: null,
      endDate: null,
      startMin: null,
      endMin: null,
      durationMin: null,
      tagId: null,
      recurrence: null,
      overrides: {},
      createdAt: 0,
      updatedAt: 0,
    })
  })

  it('collapses an end before its start to a single day', () => {
    const event = normalizeEvent('e1', { startDate: DAY, endDate: addDays(DAY, -3) })
    assert.equal(event.endDate, DAY)
  })

  it('caps a corrupt far-future end date instead of trusting it', () => {
    const event = normalizeEvent('e1', { startDate: DAY, endDate: '2999-12-31' })
    assert.equal(event.endDate, addDays(DAY, MAX_EVENT_DAYS - 1))
  })

  it('never lets a multi-day event carry a recurrence rule', () => {
    const event = normalizeEvent('e1', {
      startDate: DAY,
      endDate: addDays(DAY, 2),
      recurrence: { days: [1, 2, 3, 4, 5] },
    })
    assert.equal(event.recurrence, null)
  })

  it('drops an end time once the event spans more than one day', () => {
    const event = normalizeEvent('e1', {
      startDate: DAY,
      endDate: addDays(DAY, 1),
      startMin: 540,
      endMin: 600,
    })
    assert.equal(event.endMin, null)
    // A start time survives the span (it's still "starts at 9am, that day"),
    // so duration falls back to the same default an untimed end gets.
    assert.equal(event.durationMin, DEFAULT_EVENT_DURATION_MIN)
  })

  it('derives duration from start/end time, defaulting to an hour', () => {
    const timed = normalizeEvent('e1', { startDate: DAY, endDate: DAY, startMin: 540, endMin: 600 })
    assert.equal(timed.durationMin, 60)

    const noEnd = normalizeEvent('e1', { startDate: DAY, endDate: DAY, startMin: 540 })
    assert.equal(noEnd.durationMin, DEFAULT_EVENT_DURATION_MIN)

    const allDay = normalizeEvent('e1', { startDate: DAY, endDate: DAY })
    assert.equal(allDay.durationMin, null)
  })
})

describe('normalizeTag', () => {
  it('falls back to a real name and the first palette slot', () => {
    const tag = normalizeTag('tag1', {})
    assert.equal(tag.name, 'Untitled')
    assert.equal(tag.slot, TAG_SLOTS[0])
    assert.equal(tag.icon, null)
    assert.equal(tag.color, `var(--color-tag-${TAG_SLOTS[0]})`)
    assert.equal(tag.order, 0)
  })

  it('rejects a slot outside the validated palette', () => {
    const tag = normalizeTag('tag1', { slot: 'chartreuse' })
    assert.equal(tag.slot, TAG_SLOTS[0])
  })

  it('rejects an icon key that is not in the validated set', () => {
    const tag = normalizeTag('tag1', { icon: 'not-a-real-icon' })
    assert.equal(tag.icon, null)
  })
})
