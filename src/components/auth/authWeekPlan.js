/* The made-up week the sign-in screen's miniature calendar draws. Plain data in
   its own file so the component stays a component and a test can hold the data
   to its rules. */

/* The window of the day the miniature shows: 8 AM to 2 PM, an hour each. */
export const FIRST_HOUR = 8
export const HOURS = 6
export const HOUR_LABELS = ['8', '9', '10', '11', '12', '1']

/* Monday to Friday, in the order it "gets planned" — a column at a time, top to
   bottom, which is the order `--b` hands to the stylesheet. `at` and `len` are
   minutes. Every block is inside the window above, and no two in a day overlap,
   so each column stays a single lane (the real week splits an overlap into
   sub-columns; there is no room for that here). The titles are kept to about four
   characters, which is what a 32px column holds. */
export const BLOCKS = [
  { day: 0, at: 9 * 60, len: 30, title: 'Sync', tag: 'aqua' },
  { day: 0, at: 10 * 60, len: 120, title: 'Deep', tag: 'blue' },
  { day: 0, at: 13 * 60, len: 60, title: 'Plan', tag: 'violet' },
  { day: 1, at: 9 * 60 + 30, len: 60, title: 'Demo', tag: 'violet' },
  { day: 1, at: 11 * 60 + 30, len: 90, title: 'Docs', tag: 'blue' },
  { day: 2, at: 8 * 60, len: 60, title: 'Gym', tag: 'orange' },
  { day: 2, at: 10 * 60, len: 120, title: 'Deep', tag: 'blue' },
  { day: 2, at: 13 * 60, len: 45, title: '1:1', tag: 'aqua' },
  { day: 3, at: 9 * 60, len: 30, title: 'Sync', tag: 'aqua' },
  { day: 3, at: 10 * 60 + 30, len: 90, title: 'Edit', tag: 'blue' },
  { day: 3, at: 13 * 60, len: 60, title: 'Call', tag: 'orange' },
  { day: 4, at: 9 * 60, len: 60, title: 'Lab', tag: 'violet' },
  { day: 4, at: 11 * 60, len: 60, title: 'Wrap', tag: 'aqua' },
  { day: 4, at: 13 * 60, len: 60, title: 'Run', tag: 'orange' },
]

/* A block is only tall enough for a second line once it is 90 minutes or more —
   the real calendar drops the time line below 45 minutes for the same reason. */
export const SHOWS_TIME_FROM = 90

/* Under 45 minutes a block is too short for the usual padding around its one line
   of text, so it drops the padding and centres the line — the real calendar's
   `block--compact`, for the same reason. */
export const SHORT_BELOW = 45

export const clock = (minutes) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
