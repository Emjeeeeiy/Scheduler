/* "lunch with Ana tomorrow 1pm" → a filled-in task form.
 *
 * Hand-rolled rather than pulled from a library, for the same reason the
 * rest of this project is: chrono-node is ~50kB to parse a sentence someone
 * is already halfway through typing, and it understands a great deal this
 * app has no field for ("the third Tuesday of every other month before
 * Easter"). What a time-blocker actually needs is a day, a start time, and
 * maybe a length — three fields, matched by a short ordered list of rules.
 *
 * The contract is deliberately conservative: anything not confidently
 * recognised is left in the title rather than guessed at. A wrong date
 * silently filled into the form is worse than no date, because the form is
 * the last place anyone looks before saving.
 *
 * Pure, and tested directly — see tests/parseQuickAdd.test.js. It takes
 * `today` as an argument instead of reading the clock so the tests aren't
 * dated, and returns day keys and minutes, never Date objects, like every
 * other module here.
 */

import { addDays, isValidKey, todayKey, toKey, weekdayOf } from './date.js'

const WEEKDAYS = [
  ['sunday', 'sun'],
  ['monday', 'mon'],
  ['tuesday', 'tue', 'tues'],
  ['wednesday', 'wed'],
  ['thursday', 'thu', 'thur', 'thurs'],
  ['friday', 'fri'],
  ['saturday', 'sat'],
]

const MONTHS = [
  ['january', 'jan'],
  ['february', 'feb'],
  ['march', 'mar'],
  ['april', 'apr'],
  ['may'],
  ['june', 'jun'],
  ['july', 'jul'],
  ['august', 'aug'],
  ['september', 'sep', 'sept'],
  ['october', 'oct'],
  ['november', 'nov'],
  ['december', 'dec'],
]

/** Longest spelling first, so `tues` is never matched as `tue` with a
    stray "s" left behind in the title. */
const alternation = (groups) =>
  groups
    .flat()
    .sort((a, b) => b.length - a.length)
    .join('|')

const WEEKDAY_NAMES = alternation(WEEKDAYS)
const MONTH_NAMES = alternation(MONTHS)

const indexOfName = (groups, name) =>
  groups.findIndex((spellings) => spellings.includes(name.toLowerCase()))

/** Words that only ever glued a matched phrase to the rest of the sentence.
    Once "tomorrow at 3pm" is consumed, a trailing "at" would otherwise sit
    at the end of the title. */
const CONNECTORS = new Set(['at', 'on', 'from', 'for', 'by', 'this', 'next', 'the'])

/* -------------------------------------------------------------- times -- */

/**
 * A bare hour with no am/pm, resolved the way people actually mean it:
 * 1–6 is the afternoon, 7–11 the morning, 12 is noon. "at 3" is three in
 * the afternoon to everyone except a night baker, and offering 03:00 would
 * be right roughly never.
 */
function resolveHour(hour, meridiem) {
  if (meridiem === 'am') return hour === 12 ? 0 : hour
  if (meridiem === 'pm') return hour === 12 ? 12 : hour + 12
  if (hour === 12) return 12
  return hour >= 1 && hour <= 6 ? hour + 12 : hour
}

function toMinutes(hour, minute, meridiem) {
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  // An hour past 12 states its own half of the day; a meridiem alongside it
  // ("13pm") is a typo, and the 24-hour reading is the safer one.
  const resolved = hour > 12 ? hour : resolveHour(hour, meridiem)
  return resolved * 60 + minute
}

/* -------------------------------------------------------------- dates -- */

/** The next `weekday` strictly after `today`. "Lunch on Friday" said on a
    Friday means the coming one, not the lunch already happening. */
function nextWeekday(today, weekday) {
  const delta = (weekday - weekdayOf(today) + 7) % 7
  return addDays(today, delta === 0 ? 7 : delta)
}

/** A month and day with no year: this year's, unless that has already gone
    past, in which case next year's. Built with the (y, m, d) constructor,
    never Date.parse — see the header of date.js for why. */
function monthDayKey(today, month, day) {
  const year = Number(today.slice(0, 4))
  const candidate = new Date(year, month, day)
  // A day the month does not have (Feb 30) rolls forward into the next
  // month, which is not what anyone typing it meant.
  if (candidate.getMonth() !== month) return null
  const key = toKey(candidate)
  return key >= today ? key : toKey(new Date(year + 1, month, day))
}

/* ------------------------------------------------------------- parsing -- */

/**
 * @param text   whatever was typed
 * @param today  the day "today"/"tomorrow" are relative to
 * @return { title, date, startMin, durationMin } — every field but `title`
 *         is null when nothing was confidently recognised.
 */
export function parseQuickAdd(text, { today = todayKey() } = {}) {
  const source = typeof text === 'string' ? text : ''
  const consumed = []
  let date = null
  let startMin = null
  let durationMin = null

  /** Whether a span overlaps anything already claimed by an earlier, more
      specific rule — "9 to 10" must not later re-match "10" as a time. */
  const isFree = (start, end) => !consumed.some((span) => start < span.end && end > span.start)

  /** Runs `pattern` against the original text and hands the first
      non-overlapping match to `apply`. `apply` returning false rejects the
      match, leaving those words in the title. */
  function claim(pattern, apply) {
    const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
    let match
    while ((match = regex.exec(source)) !== null) {
      const start = match.index
      const end = start + match[0].length
      if (!isFree(start, end)) continue
      if (apply(match) === false) continue
      consumed.push({ start, end })
      return true
    }
    return false
  }

  /* Order is the whole design here: every rule below may only consume text
     no earlier rule wanted, so the most specific patterns have to run
     first. A time RANGE has to beat a single time, or "9-10am" becomes
     "9am" with a dangling "-10". "for 2h" has to beat both, or the 2 reads
     as a time. */

  claim(/\bfor\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i, (m) => {
    const amount = Number(m[1])
    if (!Number.isFinite(amount) || amount <= 0) return false
    const isHours = /^h/i.test(m[2])
    const minutes = Math.round(isHours ? amount * 60 : amount)
    if (minutes < 1 || minutes > 24 * 60) return false
    durationMin = minutes
    return true
  })

  /* A range only counts as a time range when it says so — a colon, an
     am/pm, or a leading "from". Without that guard "Aug 24-25" and "items
     3-4" would both read as meetings. */
  claim(
    /\b(?:(from)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i,
    (m) => {
      const [, from, h1, m1, ap1, h2, m2, ap2] = m
      const qualified = Boolean(from || m1 || m2 || ap1 || ap2)
      if (!qualified) return false

      /* "1-2pm" states the half of the day once, at the end, and means it
         for both sides. Borrowing it backwards is what makes that read as
         13:00–14:00 rather than 01:00–14:00. */
      const start = toMinutes(Number(h1), Number(m1 ?? 0), (ap1 ?? ap2)?.toLowerCase())
      const end = toMinutes(Number(h2), Number(m2 ?? 0), ap2?.toLowerCase())
      if (start === null || end === null || end <= start) return false

      startMin = start
      // An explicit range states the length; a "for 45m" elsewhere in the
      // sentence was more deliberate still, so it keeps precedence.
      if (durationMin === null) durationMin = end - start
      return true
    },
  )

  claim(/\b(noon|midday|midnight)\b/i, (m) => {
    startMin = /midnight/i.test(m[1]) ? 0 : 12 * 60
    return true
  })

  // With a meridiem, or a colon, or an explicit "at" — never a bare number,
  // which is far more often part of the title ("review Q3 2 notes").
  claim(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i, (m) => {
    const minutes = toMinutes(Number(m[1]), Number(m[2] ?? 0), m[3].toLowerCase())
    if (minutes === null) return false
    startMin = minutes
    return true
  })

  claim(/\b(?:at\s+)?(\d{1,2}):(\d{2})\b/, (m) => {
    const minutes = toMinutes(Number(m[1]), Number(m[2]), undefined)
    if (minutes === null) return false
    startMin = minutes
    return true
  })

  claim(/\bat\s+(\d{1,2})\b/i, (m) => {
    const minutes = toMinutes(Number(m[1]), 0, undefined)
    if (minutes === null) return false
    startMin = minutes
    return true
  })

  /* Dates. ISO first — it is unambiguous and the only form that can carry
     its own year. Slash dates are deliberately NOT supported: 8/9 is the
     ninth of August to half the world and the eighth of September to the
     other half, and there is no way to pick without being wrong for
     someone. */
  claim(/\b(\d{4}-\d{2}-\d{2})\b/, (m) => {
    if (!isValidKey(m[1])) return false
    date = m[1]
    return true
  })

  claim(new RegExp(`\\b(?:on\\s+)?(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'), (m) => {
    const key = monthDayKey(today, indexOfName(MONTHS, m[1]), Number(m[2]))
    if (!key) return false
    date = key
    return true
  })

  claim(new RegExp(`\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_NAMES})\\b`, 'i'), (m) => {
    const key = monthDayKey(today, indexOfName(MONTHS, m[2]), Number(m[1]))
    if (!key) return false
    date = key
    return true
  })

  claim(/\b(today)\b/i, () => {
    date = today
    return true
  })

  claim(/\b(tonight)\b/i, () => {
    date = today
    // "Tonight" is a time of day as much as a day. Only a hint, though —
    // an explicit time anywhere in the sentence outranks it.
    if (startMin === null) startMin = 19 * 60
    return true
  })

  claim(/\b(tomorrow|tmrw|tmr)\b/i, () => {
    date = addDays(today, 1)
    return true
  })

  claim(/\byesterday\b/i, () => {
    date = addDays(today, -1)
    return true
  })

  claim(/\bnext\s+week\b/i, () => {
    date = addDays(today, 7)
    return true
  })

  claim(/\bin\s+(\d{1,3})\s*(days?|weeks?)\b/i, (m) => {
    const amount = Number(m[1])
    if (amount < 1) return false
    date = addDays(today, /^w/i.test(m[2]) ? amount * 7 : amount)
    return true
  })

  claim(new RegExp(`\\b(?:next\\s+|on\\s+|this\\s+)?(${WEEKDAY_NAMES})\\b`, 'i'), (m) => {
    date = nextWeekday(today, indexOfName(WEEKDAYS, m[1]))
    return true
  })

  /* Whatever nobody claimed is the title. Cutting the spans out rather than
     replacing matched text keeps the original wording and capitalisation —
     "Lunch with Ana" should not come back lowercased because the matcher
     was case-insensitive. */
  const kept = []
  let cursor = 0
  for (const span of [...consumed].sort((a, b) => a.start - b.start)) {
    kept.push(source.slice(cursor, span.start))
    cursor = span.end
  }
  kept.push(source.slice(cursor))

  const title = kept
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Punctuation orphaned by a removed phrase ("Lunch, tomorrow" → "Lunch,")
    .replace(/[\s,;–—-]+$/, '')
    .replace(/^[\s,;–—-]+/, '')
    // Then any connector left stranded at either end.
    .split(' ')
    .filter(Boolean)
    .reduce((words, word, index, all) => {
      const bare = word.toLowerCase().replace(/[^a-z]/g, '')
      const atEdge = index === 0 || index === all.length - 1
      if (atEdge && CONNECTORS.has(bare)) return words
      words.push(word)
      return words
    }, [])
    .join(' ')
    .trim()

  return { title, date, startMin, durationMin }
}
