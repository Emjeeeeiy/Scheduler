import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  changesContext,
  describeChanges,
  firstNameOf,
  greetingFor,
  ideasContext,
  skippedNote,
} from '../src/components/shell/aiChatChanges.js'

// 2026-08-24 is a Monday, so 2026-08-25 reads "Tomorrow" and 2026-08-27 "Thu, Aug 27".
const TODAY = '2026-08-24'
const TAGS = [
  { id: 'health', name: 'Health' },
  { id: 'study', name: 'Study' },
]
const GYM = { id: 't1', title: 'Gym', date: '2026-08-25', startMin: 9 * 60, durationMin: 60, tagId: 'health', priority: 'normal' }

const create = (fields = {}) => ({
  action: 'create',
  title: 'Study',
  date: '2026-08-25',
  startMin: 19 * 60,
  durationMin: 90,
  tagId: 'study',
  notes: null,
  priority: 'normal',
  issues: [],
  ...fields,
})
const update = (patch, fields = {}) => ({ action: 'update', taskId: 't1', patch, issues: [], ...fields })
const remove = (fields = {}) => ({ action: 'remove', taskId: 't1', issues: [], ...fields })

const rows = (items, extra = {}) =>
  describeChanges(items, { tasks: [GYM], tags: TAGS, dayItems: () => [], today: TODAY, nowMin: null, ...extra })
const one = (item, extra) => rows([item], extra)[0]

describe('describeChanges — a created task', () => {
  it('says what it is, when, for how long, and which tag', () => {
    const row = one(create())
    assert.equal(row.action, 'create')
    assert.equal(row.title, 'Study')
    assert.deepEqual(row.meta, ['Tomorrow', '7:00–8:30 PM', '1h 30m'])
    assert.equal(row.tag.name, 'Study')
    assert.deepEqual(row.warnings, [])
  })

  it('says plainly when it has no day or no time, rather than leaving a gap', () => {
    assert.deepEqual(one(create({ date: null, startMin: null, durationMin: null, tagId: null })).meta, [
      'No day set',
      'No time set',
    ])
    assert.deepEqual(one(create({ startMin: null })).meta.slice(0, 2), ['Tomorrow', 'No time set'])
  })

  it('keeps the half of the day once when a range stays within it, and both when it crosses noon', () => {
    assert.equal(one(create({ startMin: 9 * 60, durationMin: 60 })).meta[1], '9:00–10:00 AM')
    assert.equal(one(create({ startMin: 11 * 60 + 30, durationMin: 60 })).meta[1], '11:30 AM–12:30 PM')
  })

  it('reads a block that ends at midnight as ending at 12:00 AM, not 12:00 PM', () => {
    assert.equal(one(create({ startMin: 23 * 60, durationMin: 60 })).meta[1], '11:00 PM–12:00 AM')
  })

  it('mentions a priority only when it is not the ordinary one', () => {
    assert.ok(one(create({ priority: 'high' })).meta.includes('High priority'))
    assert.ok(!one(create({ priority: 'normal' })).meta.some((part) => /priority/.test(part)))
  })

  it('carries the model’s own one-line note, and no tag it did not have', () => {
    const row = one(create({ notes: 'Bring water.', tagId: null }))
    assert.equal(row.note, 'Bring water.')
    assert.equal(row.tag, null)
  })

  it('states what was created in plain text for the next request', () => {
    assert.equal(one(create()).context, 'Created "Study" on 2026-08-25 at 19:00 for 90 min.')
    assert.equal(
      one(create({ title: 'Call Mum', date: null, startMin: null, durationMin: null })).context,
      'Created "Call Mum" with no day.',
    )
  })
})

describe('describeChanges — a changed task', () => {
  it('shows what the time was and what it is now', () => {
    const row = one(update({ startMin: 16 * 60 }))
    assert.equal(row.action, 'update')
    assert.equal(row.title, 'Gym')
    assert.deepEqual(row.changes, ['Time: 9:00 AM → 4:00 PM'])
    assert.equal(row.context, 'Changed "Gym": start to 16:00.')
  })

  it('shows one line for each field that changed, and none for the rest', () => {
    const row = one(
      update({ date: '2026-08-27', durationMin: 90, tagId: 'study', priority: 'high', title: 'Lift', notes: 'x' }),
    )
    assert.deepEqual(row.changes, [
      'Renamed from “Gym”',
      'Day: Tomorrow → Thu, Aug 27',
      'Length: 1h → 1h 30m',
      'Tag: Health → Study',
      'Priority: Normal → High',
      'Notes updated',
    ])
    assert.equal(row.title, 'Lift', 'shows the name it now has')
  })

  it('leaves out a field the model set to what the task already has', () => {
    // GYM is already Health, 9:00 AM, 60 minutes, normal priority.
    const row = one(update({ tagId: 'health', startMin: 9 * 60, durationMin: 60, priority: 'normal' }))
    assert.deepEqual(row.changes, ['Already set that way'])
    const mixed = one(update({ tagId: 'health', startMin: 16 * 60 }))
    assert.deepEqual(mixed.changes, ['Time: 9:00 AM → 4:00 PM'], 'only the field that differs is listed')
    assert.equal(mixed.context, 'Changed "Gym": start to 16:00.')
  })

  it('says "No time set" for a task that had none, rather than a blank', () => {
    const inbox = { id: 't1', title: 'Call Mum', date: null, startMin: null, durationMin: null, tagId: null }
    const row = one(update({ date: '2026-08-25', startMin: 18 * 60 }), { tasks: [inbox] })
    assert.deepEqual(row.changes, ['Day: No day set → Tomorrow', 'Time: No time set → 6:00 PM'])
  })

  it('copes with a task it can no longer find', () => {
    const row = one(update({ startMin: 600 }, { taskId: 'gone' }))
    assert.equal(row.title, 'a task')
    assert.deepEqual(row.changes, ['Time: No time set → 10:00 AM'])
  })
})

describe('describeChanges — a removed task', () => {
  it('names what is going, and when it was', () => {
    const row = one(remove())
    assert.equal(row.action, 'remove')
    assert.equal(row.title, 'Gym')
    assert.deepEqual(row.meta, ['Tomorrow', '9:00 AM'])
    assert.equal(row.context, 'Removed "Gym".')
  })
})

describe('describeChanges — clashes with what is already booked', () => {
  const dinner = { id: 'e1', title: 'Dinner with Ana', startMin: 19 * 60 + 30, durationMin: 60 }
  const dayItems = (items) => (key) => (key === '2026-08-25' ? items : [])

  it('keeps the time and names what it overlaps', () => {
    const row = one(create(), { dayItems: dayItems([dinner]) })
    assert.equal(row.warnings.length, 1)
    assert.match(row.warnings[0], /^Overlaps “Dinner with Ana” \(7:30–8:30 PM\) — kept at the time you gave\.$/)
  })

  it('does not call back-to-back a clash', () => {
    const before = { id: 'e2', title: 'Call', startMin: 18 * 60, durationMin: 60 } // ends 19:00, as Study begins
    const after = { id: 'e3', title: 'Walk', startMin: 20 * 60 + 30, durationMin: 30 } // begins as Study ends
    assert.deepEqual(one(create(), { dayItems: dayItems([before, after]) }).warnings, [])
  })

  it('only looks at the day the task is on', () => {
    assert.deepEqual(one(create({ date: '2026-08-26' }), { dayItems: dayItems([dinner]) }).warnings, [])
  })

  it('names two, then counts the rest', () => {
    const many = [1, 2, 3, 4].map((n) => ({ id: `x${n}`, title: `Thing ${n}`, startMin: 19 * 60, durationMin: 30 }))
    const [warning] = one(create(), { dayItems: dayItems(many) }).warnings
    assert.match(warning, /“Thing 1” \(.*\), “Thing 2” \(.*\) and 2 more —/)
  })

  it('ignores something with no start time, such as an all-day item', () => {
    const allDay = { id: 'e4', title: 'Conference', startMin: null, durationMin: null }
    assert.deepEqual(one(create(), { dayItems: dayItems([allDay]) }).warnings, [])
  })

  it('flags two new tasks in one message that overlap each other, on both', () => {
    const [first, second] = rows([create({ title: 'A' }), create({ title: 'B', startMin: 19 * 60 + 30 })])
    assert.match(first.warnings[0], /Overlaps “B”/)
    assert.match(second.warnings[0], /Overlaps “A”/)
  })

  // Regression: free time used to count a task's own slot as busy, so moving it to
  // a time that overlapped where it already sat was rejected. Its old place is not
  // an obstacle to its new one.
  it('does not clash a moved task with the slot it is leaving', () => {
    const old = { id: 't1', title: 'Gym', startMin: 9 * 60, durationMin: 60 }
    const row = one(update({ startMin: 9 * 60 + 30 }), { dayItems: dayItems([old]) })
    assert.deepEqual(row.warnings, [])
  })

  it('checks a moved task against its NEW time, not its old one', () => {
    const row = one(update({ startMin: 19 * 60 }), { dayItems: dayItems([dinner]) })
    assert.match(row.warnings[0], /Overlaps “Dinner with Ana”/)
  })

  it('treats a task removed in the same message as gone', () => {
    const other = { id: 't2', title: 'Old thing', date: '2026-08-25', startMin: 19 * 60, durationMin: 60 }
    const [, createRow] = describeChanges([remove({ taskId: 't2' }), create()], {
      tasks: [GYM, other],
      tags: TAGS,
      dayItems: dayItems([{ id: 't2', title: 'Old thing', startMin: 19 * 60, durationMin: 60 }]),
      today: TODAY,
      nowMin: null,
    })
    assert.deepEqual(createRow.warnings, [])
  })
})

describe('describeChanges — the other notes', () => {
  it('says when a time has already passed today, and only then', () => {
    const today = create({ date: TODAY, startMin: 9 * 60 })
    assert.deepEqual(one(today, { nowMin: 10 * 60 }).warnings, ['That time has already passed today.'])
    assert.deepEqual(one(today, { nowMin: 8 * 60 }).warnings, [])
    assert.deepEqual(one(today, { nowMin: null }).warnings, [])
    assert.deepEqual(one(create({ startMin: 9 * 60 }), { nowMin: 23 * 60 }).warnings, [], 'tomorrow is not past')
  })

  it('reports a time it could not read, differently for a new task and a changed one', () => {
    assert.deepEqual(one(create({ startMin: null, issues: ['time'] })).warnings, [
      'Couldn’t read a time from that, so it has no start time.',
    ])
    assert.deepEqual(one(update({ notes: 'x' }, { issues: ['time'] })).warnings, [
      'Couldn’t read a time from that, so the time wasn’t changed.',
    ])
  })

  it('reports a day it could not read', () => {
    assert.deepEqual(one(create({ date: null, startMin: null, issues: ['date'] })).warnings, [
      'Couldn’t read the day that was given — please check it.',
    ])
  })

  it('is quiet about a tag or length it replaced: the row already shows what it got', () => {
    assert.deepEqual(one(create({ issues: ['tag', 'duration'] })).warnings, [])
  })

  it('works on items that carry no issues list at all', () => {
    const { issues: _issues, ...bare } = create()
    assert.deepEqual(one(bare).warnings, [])
  })
})

describe('skippedNote', () => {
  it('says nothing when nothing was left out, or when the count is not a count', () => {
    for (const none of [0, undefined, null, -1, 1.5, Number.NaN, '2']) assert.equal(skippedNote(none), null)
  })

  it('says how many, singular and plural', () => {
    assert.equal(skippedNote(1), '1 more couldn’t be added — try it in another message.')
    assert.equal(skippedNote(3), '3 more couldn’t be added — try them in another message.')
  })
})

describe('changesContext', () => {
  it('lists what was done, one line each, for the next request', () => {
    const text = changesContext(rows([create(), update({ startMin: 16 * 60 }), remove({ taskId: 'gone' })]))
    assert.equal(
      text,
      ['Created "Study" on 2026-08-25 at 19:00 for 90 min.', 'Changed "Gym": start to 16:00.', 'Removed "a task".'].join('\n'),
    )
  })
})

describe('a created row — when', () => {
  it('is the phrase its context is built from, so an idea can say what it would be', () => {
    const row = one(create())
    assert.equal(row.when, 'on 2026-08-25 at 19:00 for 90 min')
    assert.equal(row.context, `Created "Study" ${row.when}.`)
  })

  it('says "with no day" for one that has none, and leaves out a time it does not have', () => {
    const row = one(create({ date: null, startMin: null, durationMin: null }))
    assert.equal(row.when, 'with no day')
  })
})

describe('ideasContext', () => {
  it('lists each idea as suggested and not added yet, one line each', () => {
    const text = ideasContext(rows([create(), create({ title: 'Read', startMin: 9 * 60, durationMin: 30 })]))
    assert.equal(
      text,
      [
        'Suggested "Study" on 2026-08-25 at 19:00 for 90 min (not added yet).',
        'Suggested "Read" on 2026-08-25 at 09:00 for 30 min (not added yet).',
      ].join('\n'),
    )
  })

  it('never calls an idea created: that is for a change that happened', () => {
    assert.doesNotMatch(ideasContext(rows([create()])), /Created/)
  })

  it('is empty for no ideas', () => {
    assert.equal(ideasContext([]), '')
  })

  it('copes with a row that has no `when`', () => {
    assert.equal(ideasContext([{ title: 'Read' }]), 'Suggested "Read" (not added yet).')
  })
})

describe('firstNameOf', () => {
  it('is the first word of a display name', () => {
    assert.equal(firstNameOf('Sam Rivera'), 'Sam')
    assert.equal(firstNameOf('  Åsa   Lind '), 'Åsa')
    assert.equal(firstNameOf('Sam'), 'Sam')
  })

  it('is empty when there is no name to use', () => {
    for (const value of [null, undefined, '', '   ', 42, {}]) assert.equal(firstNameOf(value), '')
  })

  it('is empty for an email address, which is not a name to greet someone by', () => {
    assert.equal(firstNameOf('sam@example.com'), '')
    assert.equal(firstNameOf('sam@example.com Rivera'), '')
  })
})

describe('greetingFor', () => {
  const at = (hour, minute = 0) => hour * 60 + minute

  it('follows the time of day', () => {
    assert.equal(greetingFor(at(5), ''), 'Good morning')
    assert.equal(greetingFor(at(11, 59), ''), 'Good morning')
    assert.equal(greetingFor(at(12), ''), 'Good afternoon')
    assert.equal(greetingFor(at(16, 59), ''), 'Good afternoon')
    assert.equal(greetingFor(at(17), ''), 'Good evening')
    assert.equal(greetingFor(at(21, 59), ''), 'Good evening')
  })

  it('says a plain "Hello" in the small hours, where "good evening" reads as a slip', () => {
    assert.equal(greetingFor(at(22), ''), 'Hello')
    assert.equal(greetingFor(at(0), ''), 'Hello')
    assert.equal(greetingFor(at(4, 59), ''), 'Hello')
  })

  it('adds the name after a comma, when there is one', () => {
    assert.equal(greetingFor(at(19), 'Sam'), 'Good evening, Sam')
    assert.equal(greetingFor(at(8), 'Sam'), 'Good morning, Sam')
  })

  it('says "Hello" when the time is not known', () => {
    assert.equal(greetingFor(null, ''), 'Hello')
    assert.equal(greetingFor(undefined, 'Sam'), 'Hello, Sam')
    assert.equal(greetingFor(NaN, ''), 'Hello')
  })
})
