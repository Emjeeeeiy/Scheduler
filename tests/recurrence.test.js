import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EVERY_DAY,
  WEEKDAYS,
  daysForPreset,
  normalizeOverrides,
  normalizeRecurrence,
  occurrenceId,
  occurrenceOn,
  occursOn,
  orderedDays,
  parseOccurrenceId,
  presetOf,
  recurrenceLabel,
} from '../src/lib/recurrence.js'

// 2026-08-24 is a Monday; the week that follows it is used throughout.
const MON = '2026-08-24'
const TUE = '2026-08-25'
const WED = '2026-08-26'
const FRI = '2026-08-28'
const SAT = '2026-08-29'
const SUN = '2026-08-30'

const series = (patch = {}) => ({
  id: 'abc',
  title: 'Morning run',
  notes: '',
  date: MON,
  startMin: 7 * 60,
  durationMin: 45,
  tagId: 'personal',
  done: false,
  completedAt: null,
  recurrence: { days: EVERY_DAY, anchor: MON },
  overrides: {},
  createdAt: 1,
  updatedAt: 1,
  ...patch,
})

describe('normalizeRecurrence', () => {
  it('needs a date to anchor to', () => {
    // An inbox task has no day to repeat from, so it can never be a series.
    assert.equal(normalizeRecurrence({ days: EVERY_DAY }, null), null)
  })

  it('falls back to the task date as the anchor', () => {
    assert.deepEqual(normalizeRecurrence({ days: [1] }, MON), { days: [1], anchor: MON })
  })

  it('drops junk days and de-duplicates', () => {
    const rule = normalizeRecurrence({ days: [1, 1, 9, -2, 'x', 3.5, 5], anchor: MON }, MON)
    assert.deepEqual(rule.days, [1, 5])
  })

  it('is null when nothing survives', () => {
    assert.equal(normalizeRecurrence({ days: [42] }, MON), null)
    assert.equal(normalizeRecurrence({ days: 'every day' }, MON), null)
    assert.equal(normalizeRecurrence(null, MON), null)
  })
})

describe('normalizeOverrides', () => {
  it('keeps only well-formed entries', () => {
    const out = normalizeOverrides({
      [MON]: { done: true, completedAt: 12 },
      [TUE]: { detached: true },
      [WED]: { done: false },
      'not-a-day': { done: true },
      [FRI]: 'nope',
    })
    assert.deepEqual(out, {
      [MON]: { done: true, completedAt: 12 },
      [TUE]: { detached: true },
    })
  })

  it('survives a missing or non-object map', () => {
    assert.deepEqual(normalizeOverrides(undefined), {})
    assert.deepEqual(normalizeOverrides('nope'), {})
  })
})

describe('occursOn', () => {
  it('matches the rule weekdays', () => {
    const rule = { days: WEEKDAYS, anchor: MON }
    assert.equal(occursOn(rule, WED), true)
    assert.equal(occursOn(rule, SAT), false)
    assert.equal(occursOn(rule, SUN), false)
  })

  it('never reaches back before the anchor', () => {
    const rule = { days: EVERY_DAY, anchor: WED }
    assert.equal(occursOn(rule, MON), false)
    assert.equal(occursOn(rule, WED), true)
  })

  it('is false without a rule', () => {
    assert.equal(occursOn(null, MON), false)
  })
})

describe('occurrenceOn', () => {
  it('carries the series fields onto the day it lands', () => {
    const occurrence = occurrenceOn(series(), WED)
    assert.equal(occurrence.title, 'Morning run')
    assert.equal(occurrence.date, WED)
    assert.equal(occurrence.startMin, 7 * 60)
    assert.equal(occurrence.seriesId, 'abc')
    assert.equal(occurrence.occurrenceDate, WED)
    assert.equal(occurrence.id, occurrenceId('abc', WED))
    // The exception map belongs to the rule, not to one day of it.
    assert.equal('overrides' in occurrence, false)
  })

  it('applies a done override to that day alone', () => {
    const parent = series({ overrides: { [WED]: { done: true, completedAt: 99 } } })
    assert.equal(occurrenceOn(parent, WED).done, true)
    assert.equal(occurrenceOn(parent, WED).completedAt, 99)
    assert.equal(occurrenceOn(parent, TUE).done, false)
    assert.equal(occurrenceOn(parent, TUE).completedAt, null)
  })

  it('skips a day that has been detached into its own document', () => {
    const parent = series({ overrides: { [WED]: { detached: true } } })
    assert.equal(occurrenceOn(parent, WED), null)
    assert.notEqual(occurrenceOn(parent, TUE), null)
  })

  it('is null on a day the rule does not name', () => {
    assert.equal(occurrenceOn(series({ recurrence: { days: WEEKDAYS, anchor: MON } }), SAT), null)
  })
})

describe('occurrence ids', () => {
  it('round-trips', () => {
    assert.deepEqual(parseOccurrenceId(occurrenceId('abc', MON)), {
      seriesId: 'abc',
      dateKey: MON,
    })
  })

  it('does not claim an ordinary document id', () => {
    // Firestore auto-ids are 20 alphanumerics, so the separator cannot occur.
    assert.equal(parseOccurrenceId('K3nQ8vTzR1aB7cD2eF9g'), null)
    assert.equal(parseOccurrenceId('abc~not-a-date'), null)
    assert.equal(parseOccurrenceId('~2026-08-24'), null)
    assert.equal(parseOccurrenceId(undefined), null)
  })
})

describe('labels', () => {
  it('names the two presets', () => {
    assert.equal(presetOf(EVERY_DAY), 'daily')
    assert.equal(presetOf(WEEKDAYS), 'weekdays')
    assert.equal(presetOf([1, 3]), 'custom')
    assert.equal(recurrenceLabel({ days: EVERY_DAY }), 'Every day')
    assert.equal(recurrenceLabel({ days: WEEKDAYS }), 'Every weekday')
  })

  it('lists custom days in display order, Monday first', () => {
    assert.equal(recurrenceLabel({ days: [0, 1, 3] }), 'Every Mon, Wed & Sun')
    assert.equal(recurrenceLabel({ days: [2] }), 'Every Tuesday')
    assert.deepEqual(orderedDays([0, 6, 1]), [1, 6, 0])
  })

  it('says so when there is no rule', () => {
    assert.equal(recurrenceLabel(null), 'Does not repeat')
  })
})

describe('daysForPreset', () => {
  it('starts a custom rule on the task own weekday', () => {
    assert.deepEqual(daysForPreset('custom', FRI), [5])
    assert.deepEqual(daysForPreset('daily'), EVERY_DAY)
    assert.deepEqual(daysForPreset('weekdays'), WEEKDAYS)
    assert.equal(daysForPreset('none'), null)
  })
})
