import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  EVERY_DAY,
  INTERVAL,
  LAST,
  MONTHLY,
  WEEKDAYS,
  WEEKENDS,
  eventOccurrenceOn,
  isLastWeekdayOfMonth,
  normalizeOverrides,
  normalizeRecurrence,
  occurrenceId,
  occurrenceOn,
  occursOn,
  orderedDays,
  parseOccurrenceId,
  nthWeekdayOfMonth,
  presetOf,
  recurrenceForPreset,
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
    assert.deepEqual(normalizeRecurrence({ days: [1] }, MON), {
      freq: 'weekly',
      days: [1],
      anchor: MON,
      until: null,
    })
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
    assert.equal(presetOf({ days: EVERY_DAY }), 'daily')
    assert.equal(presetOf({ days: WEEKDAYS }), 'weekdays')
    assert.equal(presetOf({ days: WEEKENDS }), 'weekends')
    assert.equal(presetOf({ days: [1, 3] }), 'custom')
    assert.equal(presetOf(null), 'none')
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

describe('recurrenceForPreset', () => {
  it('starts a custom rule on the task own weekday', () => {
    assert.deepEqual(recurrenceForPreset('custom', FRI).days, [5])
    assert.deepEqual(recurrenceForPreset('daily', MON).days, EVERY_DAY)
    assert.deepEqual(recurrenceForPreset('weekdays', MON).days, WEEKDAYS)
    assert.deepEqual(recurrenceForPreset('weekends', MON).days, WEEKENDS)
    assert.equal(recurrenceForPreset('none', MON), null)
    // No day to anchor to means no rule, whatever the preset says.
    assert.equal(recurrenceForPreset('daily', null), null)
  })
})

/* 2026-08: Saturdays fall on the 1st, 8th, 15th, 22nd and 29th — five of them,
   so it is exactly the month that tells "the fourth" and "the last" apart.
   2026-09 has only four Saturdays (5, 12, 19, 26), which is the other half of
   that same test. */
const AUG_SAT = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22', '2026-08-29']
const SEP_SAT = ['2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26']

describe('nth weekday of the month', () => {
  it('counts a weekday position from the day of the month alone', () => {
    AUG_SAT.forEach((key, index) => assert.equal(nthWeekdayOfMonth(key), index + 1))
    SEP_SAT.forEach((key, index) => assert.equal(nthWeekdayOfMonth(key), index + 1))
  })

  it('knows the last one, whether the month holds four or five', () => {
    assert.equal(isLastWeekdayOfMonth('2026-08-29'), true)
    assert.equal(isLastWeekdayOfMonth('2026-08-22'), false)
    assert.equal(isLastWeekdayOfMonth('2026-09-26'), true)
    assert.equal(isLastWeekdayOfMonth('2026-09-19'), false)
  })
})

describe('a monthly rule', () => {
  const secondSaturday = { freq: MONTHLY, weekday: 6, nth: 2, anchor: '2026-08-01' }

  it('lands on the second Saturday and nowhere else', () => {
    assert.equal(occursOn(secondSaturday, '2026-08-08'), true)
    assert.equal(occursOn(secondSaturday, '2026-09-12'), true)
    for (const key of ['2026-08-01', '2026-08-15', '2026-08-22', '2026-08-29', '2026-08-09']) {
      assert.equal(occursOn(secondSaturday, key), false)
    }
  })

  it('never reaches back before the anchor', () => {
    const rule = { ...secondSaturday, anchor: '2026-09-01' }
    assert.equal(occursOn(rule, '2026-08-08'), false)
    assert.equal(occursOn(rule, '2026-09-12'), true)
  })

  it('treats LAST as the final one, not the fourth', () => {
    const rule = { freq: MONTHLY, weekday: 6, nth: LAST, anchor: '2026-08-01' }
    // August has five Saturdays: the fourth is not the last.
    assert.equal(occursOn(rule, '2026-08-22'), false)
    assert.equal(occursOn(rule, '2026-08-29'), true)
    // September has four, so there the fourth IS the last.
    assert.equal(occursOn(rule, '2026-09-26'), true)
  })

  it('collapses a stored fifth to LAST rather than skipping short months', () => {
    const rule = normalizeRecurrence({ freq: 'monthly', weekday: 6, nth: 5 }, '2026-08-01')
    assert.equal(rule.nth, LAST)
    assert.equal(occursOn(rule, '2026-09-26'), true)
  })

  it('seeds itself from the day the form is showing', () => {
    const rule = recurrenceForPreset('monthly', '2026-08-08')
    assert.equal(rule.freq, MONTHLY)
    assert.equal(rule.weekday, 6)
    assert.equal(rule.nth, 2)
  })

  it('seeds a fifth-weekday date as LAST', () => {
    assert.equal(recurrenceForPreset('monthly', '2026-08-29').nth, LAST)
  })

  it('reads back as words', () => {
    assert.equal(recurrenceLabel(secondSaturday), 'Every second Saturday of the month')
    assert.equal(
      recurrenceLabel({ freq: MONTHLY, weekday: 0, nth: LAST }),
      'Every last Sunday of the month',
    )
    assert.equal(presetOf(secondSaturday), 'monthly')
  })
})

describe('a rule written before monthly existed', () => {
  it('still reads as weekly with no freq on it', () => {
    // Every repeating task already in Firestore looks exactly like this.
    const legacy = { days: WEEKDAYS, anchor: MON }
    assert.equal(occursOn(legacy, WED), true)
    assert.equal(occursOn(legacy, SAT), false)
    assert.equal(presetOf(legacy), 'weekdays')
    assert.equal(recurrenceLabel(legacy), 'Every weekday')
  })
})

describe('an interval rule', () => {
  it('lands every N days from the anchor', () => {
    const everyThreeDays = normalizeRecurrence({ freq: 'interval', unit: 'day', everyN: 3 }, MON)
    assert.equal(occursOn(everyThreeDays, MON), true)
    assert.equal(occursOn(everyThreeDays, TUE), false)
    assert.equal(occursOn(everyThreeDays, '2026-08-27'), true) // MON + 3
    assert.equal(occursOn(everyThreeDays, '2026-08-30'), true) // MON + 6
    assert.equal(occursOn(everyThreeDays, '2026-08-29'), false) // MON + 5
  })

  it('lands every N weeks from the anchor', () => {
    const everyTwoWeeks = normalizeRecurrence({ freq: 'interval', unit: 'week', everyN: 2 }, MON)
    assert.equal(occursOn(everyTwoWeeks, MON), true)
    assert.equal(occursOn(everyTwoWeeks, '2026-08-31'), false) // MON + 7
    assert.equal(occursOn(everyTwoWeeks, '2026-09-07'), true) // MON + 14
  })

  it('never reaches back before the anchor', () => {
    const rule = normalizeRecurrence({ freq: 'interval', unit: 'day', everyN: 2 }, WED)
    assert.equal(occursOn(rule, MON), false)
    assert.equal(occursOn(rule, WED), true)
  })

  it('defaults to a 1-day step and caps a runaway value', () => {
    assert.equal(normalizeRecurrence({ freq: 'interval' }, MON).everyN, 1)
    assert.equal(normalizeRecurrence({ freq: 'interval', everyN: 99999 }, MON).everyN, 365)
    assert.equal(normalizeRecurrence({ freq: 'interval', unit: 'nonsense' }, MON).unit, 'day')
  })

  it('is offered by the interval preset and reads back as words', () => {
    const rule = recurrenceForPreset('interval', MON)
    assert.equal(rule.freq, INTERVAL)
    assert.equal(rule.everyN, 2)
    assert.equal(presetOf(rule), 'interval')
    assert.equal(recurrenceLabel(rule), 'Every 2 days')
    assert.equal(recurrenceLabel({ freq: INTERVAL, unit: 'week', everyN: 1 }), 'Every week')
  })
})

describe('a rule with an end date', () => {
  it('stops landing after `until`', () => {
    const rule = normalizeRecurrence({ days: EVERY_DAY, until: FRI }, MON)
    assert.equal(occursOn(rule, FRI), true)
    assert.equal(occursOn(rule, SAT), false)
  })

  it('drops an end date that sits before the anchor', () => {
    const rule = normalizeRecurrence({ days: EVERY_DAY, anchor: FRI, until: MON }, FRI)
    assert.equal(rule.until, null)
  })

  it('appends the end date to the label', () => {
    const rule = normalizeRecurrence({ days: EVERY_DAY, until: FRI }, MON)
    assert.equal(recurrenceLabel(rule), 'Every day, through Fri, Aug 28')
  })

  it('a plain rule with no until is unaffected', () => {
    const rule = normalizeRecurrence({ days: EVERY_DAY }, MON)
    assert.equal(rule.until, null)
    assert.equal(occursOn(rule, '2027-01-01'), true)
  })
})

describe('eventOccurrenceOn', () => {
  const sundayService = {
    id: 'evt',
    title: 'Sunday service',
    notes: '',
    startDate: SUN,
    endDate: SUN,
    startMin: 9 * 60,
    endMin: 10 * 60,
    tagId: null,
    recurrence: { freq: 'weekly', days: [0], anchor: SUN },
    overrides: {},
  }

  it('collapses an occurrence onto the single day it lands on', () => {
    const occurrence = eventOccurrenceOn(sundayService, '2026-09-06')
    assert.equal(occurrence.startDate, '2026-09-06')
    assert.equal(occurrence.endDate, '2026-09-06')
    assert.equal(occurrence.seriesId, 'evt')
    assert.equal(occurrence.occurrenceDate, '2026-09-06')
    // The rest of the event rides along unchanged.
    assert.equal(occurrence.title, 'Sunday service')
    assert.equal(occurrence.startMin, 9 * 60)
    assert.equal(occurrence.overrides, undefined)
  })

  it('is null on a day the rule does not name', () => {
    assert.equal(eventOccurrenceOn(sundayService, SAT), null)
  })

  it('skips a day detached into its own document', () => {
    const parent = { ...sundayService, overrides: { '2026-09-06': { detached: true } } }
    assert.equal(eventOccurrenceOn(parent, '2026-09-06'), null)
    assert.notEqual(eventOccurrenceOn(parent, '2026-09-13'), null)
  })

  it('carries no done state — an event is not something you tick off', () => {
    const occurrence = eventOccurrenceOn(sundayService, '2026-09-06')
    assert.equal(occurrence.done, undefined)
    assert.equal(occurrence.completedAt, undefined)
  })
})
