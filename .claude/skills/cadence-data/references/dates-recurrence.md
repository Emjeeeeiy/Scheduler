# Dates, times and repeat rules

The whole app speaks two types: a **day key** (`'YYYY-MM-DD'`, a string) and a **minute** (an integer `0..1439` from local midnight). A `Date` object is an implementation detail inside a helper, never a value that crosses a function boundary or reaches Firestore. This is why a 9:00 block stays at 9:00 across a time-zone change or DST, and why day keys sort and compare as plain strings.

## Use the helpers; do not do date math by hand

All in `@cadence/shared/date.js` (import by subpath):

| Need | Use |
| --- | --- |
| A Date → its local day key | `toKey(date)` |
| A day key → local-midnight Date | `fromKey(key)` (built with the `(y, m, d)` constructor, never `Date.parse`) |
| Today / now | `todayKey()`, `nowMin()` |
| Shift a day | `addDays(key, n)`; `shiftMonth(key, n)` |
| Whole days between two keys | `daysBetween(a, b)` (compares at noon, so a 23- or 25-hour DST day still counts as one) |
| Is this string a key | `isValidKey(key)`; **shape only** (`^\d{4}-\d{2}-\d{2}$`), so `"2026-02-31"` passes |
| Weeks and months | `startOfWeek`, `weekKeys(key, weekStartsOn)`, `monthGrid`, `monthOf`, `lastNDays`, `weekdayOf`, `isWeekend`, `weekdayOrder`/`weekdayHeaders(weekStartsOn)` |
| Minutes | `clampMin`, `snapMin(min, step = 15)`, `minToLabel`, `minToShortLabel`, `minToTimeValue` (`"HH:MM"` for an `<input type="time">`), `timeValueToMin`, `durationLabel`, `toHours` |
| Labels | `formatDayLabel`, `formatFullDayLabel`, `formatMonthLabel`, `formatWeekLabel`, `relativeDayLabel` |
| Constants | `WEEK_STARTS_ON` (the default; the user's setting is `settings.weekStartsOn`), `MINUTES_PER_DAY`, `DAY_LONG`, `DAY_SHORT` |

**The instant a wall-clock time is due** (a reminder's `fireAt`) is `reminderFireAt(key, min)` in `@cadence/shared/reminders.js`. It adds the minutes to the day's local midnight with `setMinutes` instead of `midnight + min * 60000`, so a DST day still lands on the clock time the person saw.

### What to avoid

- `new Date('2026-08-24')`: parsed as **UTC**; it is the 23rd west of Greenwich. `date.test.js` pins this.
- `Date.now() - n * 86400000` for "n days ago", or `now - DAY` for "yesterday": a day is 23, 24 or 25 hours on a DST change. Use `addDays(todayKey(), -n)`.
- `toISOString().slice(0, 10)` for a day key: that is the UTC date.
- Storing a `Timestamp`, or `serverTimestamp()`.
- Hand-rolling `getHours() * 60 + getMinutes()`, `"HH:MM"` formatting or key padding that `nowMin`, `minToTimeValue` and `toKey` already provide.
- Mixing local `toKey` with `getUTC*` getters. `nowUtc()` in `functions/index.js` does, deliberately (a function has no user zone to ask), and its key and minute agree only while the process's local zone is UTC. Do not copy it into code that runs on a device.
- Trusting `isValidKey` to mean "a real day". For a date that came from a model or a user, also check it round-trips (`toKey(fromKey(key)) === key`); `api/note-tasks.js` has an `isRealDay` for this.

## Repeat rules (`@cadence/shared/recurrence.js`)

A repeating item is **one document** carrying a rule; its occurrences are computed on read for whatever range a view asks about, and nothing is generated or stored per occurrence.

Three rule shapes, told apart by `freq`, each with an `anchor` day and an optional `until` day key (an `until` earlier than the anchor is dropped):

```text
{ freq: 'weekly',   days: [0..6],               anchor, until }   // Sun = 0
{ freq: 'monthly',  weekday: 0..6, nth: 1..4|LAST(-1), anchor, until }  // "second Saturday"; a stored 5 collapses to LAST
{ freq: 'interval', unit: 'day'|'week', everyN: 1..365, anchor, until } // every 3 days
```

A **missing `freq` reads as `'weekly'`**; that is load-bearing, because every repeating task stored before monthly existed has none. Always build a rule through `normalizeRecurrence(raw, date)` (which returns `null` for a rule with no date to anchor to, or no days) or `recurrenceForPreset(...)`; never assemble one by hand.

- **Is a rule on a day / what lands there:** `occursOn(rule, key)`, `occurrenceOn(task, key)` (a task), `eventOccurrenceOn(event, key)` (an event; a single-day event collapses `startDate`/`endDate` onto the day it lands on).
- **Ids:** an occurrence's id is `${seriesId}~${dayKey}` (`occurrenceId`, `parseOccurrenceId`). The `~` can never appear in a Firestore auto id, so the split is unambiguous.
- **Per-day exceptions** live in `overrides`, a sparse map `{ [dayKey]: { done: true, completedAt } | { detached: true } }`, cleaned by `normalizeOverrides`. Always address it with `FieldPath('overrides', key)`.
- **Presets and labels:** `EVERY_DAY`, `WEEKDAYS`, `WEEKENDS`, `presetOf`, `recurrenceForPreset`, `recurrenceLabel`; `currentStreak` for a habit's streak.
- **Only a single-day event may repeat.** A repeating span would need each occurrence to carry its own length and "which day of which occurrence did you grab" becomes a live question for the lane packer and every drag path. Stretching a repeating event across days drops its rule, and `normalizeEvent` enforces it on read.
- **Expansion stays pure.** `occurrenceOn` only asks a rule "do you land here", never "did something from another day get moved onto you"; that is what detaching is for.

> The header comment in `recurrence.js`, README, PRODUCT.md and DESIGN.md still say a rule has "no interval, no end date". The code has both (`interval` and `until`). Trust the code; correct the sentence if you touch that doc.

## Testing date code

- node:test files use **fixed day keys** and name the weekday in a comment (`// 2026-08-24 is a Monday`); they never fake the clock.
- This machine is Asia/Singapore and CI is UTC; **neither has daylight saving**. A test written "whatever the zone" (like the DST case in `tests/reminders.test.js`) therefore proves nothing locally. After a date change, run `node .claude/skills/cadence-verify/scripts/with-tz.mjs America/Los_Angeles -- npm test` (and the relevant vitest files the same way). A `TZ=` prefix typed in Git Bash is silently ignored for any zone but UTC; `with-tz.mjs` checks the child really got the zone.
- Pin "today" in component tests with `vi.useFakeTimers({ toFake: ['Date'] })` and `vi.setSystemTime(new Date('<day>T12:00:00'))` (local time, no `Z`).
