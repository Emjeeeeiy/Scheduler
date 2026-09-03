import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseQuickAdd } from '../src/lib/parseQuickAdd.js'
import { addDays, weekdayOf } from '../src/lib/date.js'

/* A Monday, chosen so every weekday case has somewhere unambiguous to land.
   Asserted rather than assumed — a fixture that quietly stops being a Monday
   would make half the tests below mean something else. */
const MON = '2026-08-24'
const parse = (text) => parseQuickAdd(text, { today: MON })

describe('parseQuickAdd fixture', () => {
  it('is anchored to a Monday', () => {
    assert.equal(weekdayOf(MON), 1)
  })
})

describe('parseQuickAdd — plain text', () => {
  it('leaves an ordinary title completely alone', () => {
    assert.deepEqual(parse('Buy milk'), {
      title: 'Buy milk',
      date: null,
      startMin: null,
      durationMin: null,
    })
  })

  it('survives empty and non-string input', () => {
    assert.equal(parse('').title, '')
    assert.equal(parseQuickAdd(null, { today: MON }).title, '')
    assert.equal(parseQuickAdd(undefined, { today: MON }).date, null)
  })
})

describe('parseQuickAdd — dates', () => {
  it('reads today, tomorrow, and yesterday', () => {
    assert.equal(parse('Ship it today').date, MON)
    assert.equal(parse('Ship it tomorrow').date, addDays(MON, 1))
    assert.equal(parse('tmr standup').date, addDays(MON, 1))
    assert.equal(parse('Logged yesterday').date, addDays(MON, -1))
  })

  it('reads a weekday as the NEXT one, never today', () => {
    // Said on a Monday, "on Monday" means the coming Monday — the one today
    // is already happening.
    assert.equal(parse('Retro on monday').date, addDays(MON, 7))
    assert.equal(parse('Gym friday').date, addDays(MON, 4))
    assert.equal(parse('Call next tuesday').date, addDays(MON, 1))
  })

  it('accepts short weekday spellings without leaving letters behind', () => {
    const tues = parse('Sync tues')
    assert.equal(tues.date, addDays(MON, 1))
    assert.equal(tues.title, 'Sync')

    const thurs = parse('Review thurs')
    assert.equal(thurs.date, addDays(MON, 3))
    assert.equal(thurs.title, 'Review')
  })

  it('reads relative offsets', () => {
    assert.equal(parse('Follow up in 3 days').date, addDays(MON, 3))
    assert.equal(parse('Invoice in 2 weeks').date, addDays(MON, 14))
    assert.equal(parse('Plan next week').date, addDays(MON, 7))
  })

  it('reads a month and day, in either order', () => {
    assert.equal(parse('Dentist on sep 3').date, '2026-09-03')
    assert.equal(parse('Dentist 3 september').date, '2026-09-03')
    assert.equal(parse('Dentist 3rd of september').date, '2026-09-03')
  })

  it('rolls a month/day that has already passed into next year', () => {
    // MON is in August 2026, so March has gone.
    assert.equal(parse('Taxes mar 1').date, '2027-03-01')
  })

  it('rejects a day the month does not have', () => {
    const result = parse('Nonsense feb 30')
    assert.equal(result.date, null)
    // And leaves the words in the title rather than eating them.
    assert.match(result.title, /feb 30/i)
  })

  it('reads an ISO date', () => {
    assert.equal(parse('Launch 2026-12-01').date, '2026-12-01')
  })

  it('ignores slash dates rather than guessing a convention', () => {
    // 8/9 is ambiguous worldwide; leaving it in the title is honest.
    const result = parse('Invoice 8/9')
    assert.equal(result.date, null)
    assert.match(result.title, /8\/9/)
  })
})

describe('parseQuickAdd — times', () => {
  it('reads an explicit meridiem', () => {
    assert.equal(parse('Lunch at 1pm').startMin, 13 * 60)
    assert.equal(parse('Standup 9am').startMin, 9 * 60)
    assert.equal(parse('Call 9:30am').startMin, 9 * 60 + 30)
  })

  it('handles the two noon/midnight edge cases', () => {
    assert.equal(parse('Sync 12pm').startMin, 12 * 60)
    assert.equal(parse('Sync 12am').startMin, 0)
    assert.equal(parse('Party at noon').startMin, 12 * 60)
    assert.equal(parse('Deploy midnight').startMin, 0)
  })

  it('reads a 24-hour clock', () => {
    assert.equal(parse('Deploy 13:00').startMin, 13 * 60)
    assert.equal(parse('Deploy 08:15').startMin, 8 * 60 + 15)
  })

  it('resolves a bare hour the way people mean it', () => {
    // 1–6 is the afternoon, 7–11 the morning. Offering 03:00 for "at 3"
    // would be right roughly never.
    assert.equal(parse('Coffee at 3').startMin, 15 * 60)
    assert.equal(parse('Gym at 6').startMin, 18 * 60)
    assert.equal(parse('Flight at 7').startMin, 7 * 60)
    assert.equal(parse('Breakfast at 11').startMin, 11 * 60)
  })

  it('never reads a bare number as a time without "at"', () => {
    const result = parse('Review Q3 2 notes')
    assert.equal(result.startMin, null)
    assert.equal(result.title, 'Review Q3 2 notes')
  })

  it('gives tonight an evening hint, but never over an explicit time', () => {
    assert.equal(parse('Dinner tonight').startMin, 19 * 60)
    assert.equal(parse('Dinner tonight at 8pm').startMin, 20 * 60)
    assert.equal(parse('Dinner tonight').date, MON)
  })
})

describe('parseQuickAdd — ranges and durations', () => {
  it('reads a time range as a start plus a length', () => {
    const result = parse('Workshop 9am-11am')
    assert.equal(result.startMin, 9 * 60)
    assert.equal(result.durationMin, 120)
  })

  it('borrows a trailing meridiem backwards across a range', () => {
    // "1-2pm" states the half of the day once and means it for both ends.
    const result = parse('Review 1-2pm')
    assert.equal(result.startMin, 13 * 60)
    assert.equal(result.durationMin, 60)
  })

  it('reads "from X to Y"', () => {
    const result = parse('Focus from 9 to 10:30')
    assert.equal(result.startMin, 9 * 60)
    assert.equal(result.durationMin, 90)
  })

  it('reads an explicit duration', () => {
    assert.equal(parse('Call for 45m').durationMin, 45)
    assert.equal(parse('Deep work for 2h').durationMin, 120)
    assert.equal(parse('Nap for 1.5 hours').durationMin, 90)
  })

  it('lets an explicit duration outrank a range', () => {
    // "for 30m" is the more deliberate statement of the two.
    const result = parse('Sync 9-11am for 30m')
    assert.equal(result.startMin, 9 * 60)
    assert.equal(result.durationMin, 30)
  })

  it('rejects a backwards or zero-length range', () => {
    const result = parse('Odd 5pm-2pm')
    assert.equal(result.durationMin, null)
  })

  it('does not read a plain number range as a time', () => {
    const result = parse('Read pages 10-20')
    assert.equal(result.startMin, null)
    assert.equal(result.title, 'Read pages 10-20')
  })
})

describe('parseQuickAdd — the leftover title', () => {
  it('keeps original wording and capitalisation', () => {
    const result = parse('Lunch with Ana tomorrow at 1pm')
    assert.equal(result.title, 'Lunch with Ana')
    assert.equal(result.date, addDays(MON, 1))
    assert.equal(result.startMin, 13 * 60)
  })

  it('drops a connector left stranded at either end', () => {
    assert.equal(parse('Call Ana on friday').title, 'Call Ana')
    assert.equal(parse('tomorrow Review the deck').title, 'Review the deck')
  })

  it('keeps a connector that is doing real work mid-sentence', () => {
    assert.equal(parse('Hand off to Sam tomorrow').title, 'Hand off to Sam')
  })

  it('tidies punctuation orphaned by a removed phrase', () => {
    assert.equal(parse('Groceries, tomorrow').title, 'Groceries')
  })

  it('can end up with no title at all', () => {
    // Worth allowing rather than forcing: the editor still shows its own
    // "Untitled task" fallback, and the date/time were the point.
    const result = parse('tomorrow 3pm')
    assert.equal(result.title, '')
    assert.equal(result.date, addDays(MON, 1))
    assert.equal(result.startMin, 15 * 60)
  })

  it('parses a full sentence end to end', () => {
    const result = parse('Design review with the team next thursday from 2 to 3:30pm')
    assert.equal(result.title, 'Design review with the team')
    assert.equal(result.date, addDays(MON, 3))
    assert.equal(result.startMin, 14 * 60)
    assert.equal(result.durationMin, 90)
  })
})
