#!/usr/bin/env node
/* Scan the lines a change ADDS for patterns this codebase has been bitten by.
 *
 *   node .claude/skills/cadence-review/scripts/sweep.mjs [--base main] [--strict] [--root <dir>]
 *
 * Only added lines are looked at (the diff against --base, staged and unstaged
 * edits, and untracked files), so existing code that predates a rule never
 * shows up and every finding is something this change introduced. It is a
 * regex pass over lines, not a parser: a finding is a place to look, with the
 * file and line, never a verdict. Rules were calibrated against the current
 * tree — a rule that fires on code that is fine today would only teach people
 * to ignore it, so the known legitimate exceptions are excluded by file.
 *
 *   must fix  breaks an invariant that loses data or weakens security
 *   check     usually wrong; read it and either fix it or know why it is fine
 *   note      a convention
 *
 * Exits 0 unless --strict is given and a "must fix" was found.
 */

import { git, read, repoRoot } from '../../cadence-verify/scripts/lib.mjs'

const argv = process.argv.slice(2)
const root = repoRoot(process.argv)
const strict = argv.includes('--strict')
const baseAt = argv.indexOf('--base')
const base = baseAt === -1 ? 'main' : (argv[baseAt + 1] ?? 'main')

/* ------------------------------------------------------ added lines */

const CODE = /\.(m?js|cjs|jsx|css)$/
const SKIP_PATH = /^(\.claude\/|node_modules\/|dist\/|functions\/shared\/|\.impeccable\/)/

/** `git diff -U0` as [{ file, line, text }] for every added line. */
function parseDiff(lines) {
  const out = []
  let file = null
  let next = 0
  for (const raw of lines) {
    if (raw.startsWith('+++ ')) {
      file = raw === '+++ /dev/null' ? null : raw.slice(4).replace(/^b\//, '')
    } else if (raw.startsWith('@@')) {
      const hunk = /\+(\d+)/.exec(raw)
      next = hunk ? Number(hunk[1]) : 0
    } else if (file && raw.startsWith('+') && !raw.startsWith('+++')) {
      out.push({ file, line: next, text: raw.slice(1) })
      next += 1
    }
  }
  return out
}

const notes = []
const committed = git(root, ['diff', '-U0', '--no-color', `${base}...HEAD`])
if (committed === null) notes.push(`Could not diff against "${base}" (no such ref, or git failed), so committed changes on this branch were NOT scanned. Pass --base <ref>.`)
const working = git(root, ['diff', '-U0', '--no-color', 'HEAD']) ?? []
const untracked = git(root, ['ls-files', '--others', '--exclude-standard']) ?? []

const added = [...parseDiff(committed ?? []), ...parseDiff(working)]
for (const file of untracked.filter((f) => CODE.test(f))) {
  const text = read(root, file)
  if (text !== null) text.split(/\r?\n/).forEach((line, index) => added.push({ file, line: index + 1, text: line }))
}

const seen = new Set()
const lines = added.filter((entry) => {
  if (!CODE.test(entry.file) || SKIP_PATH.test(entry.file)) return false
  const key = `${entry.file}:${entry.line}:${entry.text}`
  if (seen.has(key)) return false
  seen.add(key)
  return true
})

/* ---------------------------------------------------------- the rules */

const inSrc = (f) => f.startsWith('src/')
const isJs = (f) => /\.(m?js|cjs|jsx)$/.test(f)
const isCss = (f) => f.endsWith('.css')
const appCode = (f) => isJs(f) && /^(src|api|packages|functions)\//.test(f)

const RULES = [
  // --- dates and data
  {
    id: 'day-key-parsed-as-utc', level: 'must fix',
    when: (f, t) => appCode(f) && (/new Date\(\s*['"`]\d{4}-\d{2}-\d{2}/.test(t) || /new Date\(\s*[\w.]*[kK]ey\s*\)/.test(t)),
    why: 'new Date("YYYY-MM-DD") is UTC midnight: the previous day west of Greenwich. Use fromKey(key) from @cadence/shared/date.js.',
  },
  {
    id: 'utc-date-as-day-key', level: 'must fix',
    when: (f, t) => appCode(f) && /toISOString\(\)\s*\.\s*(slice|substring|split)/.test(t),
    why: 'That is the UTC date, not the local day. Use toKey(date).',
  },
  {
    id: 'server-timestamp', level: 'must fix',
    when: (f, t) => appCode(f) && /\bserverTimestamp\s*\(|\bTimestamp\.(now|fromDate|fromMillis)|\bnew Timestamp\(/.test(t),
    why: 'Timestamps are Date.now() milliseconds. serverTimestamp() reads back null until acknowledged and is wrong offline.',
  },
  {
    id: 'millisecond-day-math', level: 'check',
    when: (f, t) => appCode(f) && f !== 'packages/shared/src/date.js' && /86400000|86_400_000|24 \* 60 \* 60 \* 1000/.test(t),
    why: 'A day is 23, 24 or 25 hours across DST. Use addDays / daysBetween.',
  },
  {
    id: 'date-parse', level: 'check',
    when: (f, t) => appCode(f) && /\bDate\.parse\(/.test(t),
    why: 'Parsing a day key this way is UTC. Use fromKey().',
  },
  {
    id: 'dotted-override-path', level: 'must fix',
    when: (f, t) => isJs(f) && /['"`]overrides\.|overrides\.\$\{/.test(t),
    why: 'A day key has hyphens and is not a valid dotted field path. Address it with new FieldPath("overrides", key).',
  },
  {
    id: 'firestore-in-component', level: 'must fix',
    when: (f, t) => f.startsWith('src/components/') && /from ['"]firebase\//.test(t),
    why: 'Components reach data through useSchedule() and the other context hooks; Firestore is only imported under src/state/.',
  },
  {
    id: 'hard-delete', level: 'check',
    when: (f, t) => f.startsWith('src/components/') && /\bdeleteDoc\(/.test(t),
    why: 'Deletes are soft (removeTask / removeEvent stamp deletedAt, with Undo). Only purge and account deletion remove for good.',
  },
  // --- shared package
  {
    id: 'shared-not-pure', level: 'must fix',
    when: (f, t) => f.startsWith('packages/shared/src/') && /\b(window|document|localStorage|sessionStorage)\.|from ['"]firebase/.test(t),
    why: 'packages/shared is imported by the web app, Cloud Functions and the mobile app: no window, document, storage or Firebase.',
  },
  {
    id: 'shared-barrel-import', level: 'check',
    when: (f, t) => /from ['"]@cadence\/shared['"]|@cadence\/shared\/index/.test(t),
    why: 'Import by subpath: @cadence/shared/<module>.js.',
  },
  {
    id: 'shared-relative-import', level: 'check',
    when: (f, t) => !f.startsWith('packages/shared/') && /from ['"](\.\.\/)+packages\/shared/.test(t),
    why: 'Import as @cadence/shared/<module>.js, not by relative path.',
  },
  // --- api and security
  {
    id: 'genai-in-route', level: 'must fix',
    when: (f, t) => f.startsWith('api/') && f !== 'api/_lib/gemini.js' && /from ['"]@google\/genai/.test(t),
    why: 'Routes call generateJson() from api/_lib/gemini.js; they never import the SDK.',
  },
  {
    id: 'client-env-in-api', level: 'must fix',
    when: (f, t) => f.startsWith('api/') && /process\.env\.VITE_|import\.meta\.env/.test(t),
    why: 'Server code never reads a VITE_ variable. Use a server variable (FIREBASE_PROJECT_ID is deliberately duplicated for this).',
  },
  {
    id: 'error-text-to-client', level: 'must fix',
    when: (f, t) => f.startsWith('api/') && /json\(\s*\{\s*error:\s*(caught|err|error|e)\b[^}]*message/.test(t),
    why: 'What a caught error says is logged, never returned. Throw ApiError with a user-safe message; route() handles the rest.',
  },
  {
    id: 'raw-fetch', level: 'check',
    when: (f, t) => inSrc(f) && f !== 'src/lib/apiClient.js' && /\bfetch\(/.test(t),
    why: 'src/lib/apiClient.js callApi() is the only fetch to /api: it adds the token and App Check, and never throws.',
  },
  {
    id: 'raw-html', level: 'must fix',
    when: (f, t) => inSrc(f) && /dangerouslySetInnerHTML|\.innerHTML\s*=/.test(t),
    why: 'Notes and titles are user content. Render text, not HTML.',
  },
  // --- leftovers
  {
    id: 'console-log', level: 'check',
    when: (f, t) => appCode(f) && /\bconsole\.log\(/.test(t),
    why: 'Leftover debugging? Failures are console.error with a pushError toast.',
  },
  {
    id: 'blocking-dialog', level: 'check',
    when: (f, t) => inSrc(f) && isJs(f) && /(^|[^.\w])(alert|confirm|prompt)\(/.test(t),
    why: 'Use the app\'s own dialogs and toasts.',
  },
  {
    id: 'todo-marker', level: 'note',
    when: (f, t) => appCode(f) && /\b(TODO|FIXME|HACK|XXX)\b/.test(t),
    why: 'There are none in the code today; resolve it or say where it is tracked.',
  },
  // --- tests
  {
    id: 'focused-test', level: 'must fix',
    when: (f, t) => f.startsWith('tests/') && /\b(it|describe|test)\.only\(/.test(t),
    why: 'A .only silently skips every other test in the file.',
  },
  {
    id: 'skipped-test', level: 'check',
    when: (f, t) => f.startsWith('tests/') && /\b(it|describe|test)\.skip\(/.test(t),
    why: 'A skipped test is a passing check nobody ran. Fix it or delete it.',
  },
  {
    id: 'wrong-test-runner', level: 'must fix',
    when: (f, t) =>
      (/^(tests|functions\/test)\/.*\.test\.js$/.test(f) && /from ['"]vitest['"]/.test(t)) ||
      (/^tests\/.*\.test\.jsx$/.test(f) && /from ['"]node:test['"]/.test(t)),
    why: '*.test.js runs under node --test and imports node:test; *.test.jsx runs under vitest and imports vitest.',
  },
  // --- ui
  {
    id: 'hard-coded-colour', level: 'check',
    // Only app source: a test may assert on a hex string. `mask` lines use only the
    // alpha channel, so a #000 there is not a colour choice.
    when: (f, t) =>
      inSrc(f) &&
      (isCss(f) || /\.jsx$/.test(f)) &&
      !/^src\/(styles\/tokens\.css|components\/icons\.jsx|components\/journal\/ColorPicker\.jsx|lib\/journal(Paper|Colors)\.js)$/.test(f) &&
      !/mask/.test(t) &&
      /#[0-9a-fA-F]{3,8}\b/.test(t),
    why: 'Colours are tokens (var(--color-…)); a tag colour is var(--tag). A new token goes in three places in tokens.css (light, the dark media query, [data-theme="dark"]).',
  },
  {
    id: 'shadow-on-resting-element', level: 'note',
    when: (f, t) => isCss(f) && /box-shadow\s*:/.test(t) && !/none|var\(--shadow/.test(t),
    why: 'Shadow is for floating layers only (modal, dropdown, popover), never hover feedback or decoration at rest.',
  },
  {
    id: 'coloured-side-stripe', level: 'check',
    when: (f, t) => isCss(f) && /border-(left|top|inline-start)\s*:\s*[2-9]\d*px\s+solid/.test(t),
    why: 'No coloured left/top stripe on frames, rows or callouts; the time-grid block is the one exception.',
  },
  {
    id: 'font-outside-system', level: 'check',
    when: (f, t) => isCss(f) && /font-family\s*:/.test(t) && !/var\(--font-|:\s*(inherit|initial|unset)\b/.test(t),
    why: 'Two faces only: var(--font-sans), and var(--font-mono) for a bare numeral. (A Journal sheet\'s faces come from journalFonts.js, not CSS.)',
  },
  {
    id: 'emoji-as-icon', level: 'check',
    when: (f, t) => /\.jsx$/.test(f) && /\p{Extended_Pictographic}/u.test(t),
    why: 'Icons are drawn in src/components/icons.jsx (24x24, 2px stroke), never a glyph or emoji.',
  },
  {
    id: 'direct-local-storage', level: 'note',
    when: (f, t) => inSrc(f) && !/^src\/lib\/(usePersistentState|sessionHint)\.js$/.test(f) && /\blocalStorage\b/.test(t),
    why: 'Remembered UI state goes through usePersistentState (guarded, with a revive step) under a cadence-app: key.',
  },
]

/* -------------------------------------------------------------- run */

const isComment = (text) => /^\s*(\/\/|\/\*|\*|\{\s*\/\*)/.test(text)
const ORDER = ['must fix', 'check', 'note']
const found = []
for (const entry of lines) {
  if (isComment(entry.text)) continue
  for (const rule of RULES) {
    if (rule.when(entry.file, entry.text)) found.push({ ...entry, rule })
  }
}

console.log(`Scanned ${lines.length} added line${lines.length === 1 ? '' : 's'} in ${new Set(lines.map((l) => l.file)).size} file(s) against ${base}.`)
for (const level of ORDER) {
  const group = found.filter((f) => f.rule.level === level)
  if (group.length === 0) continue
  console.log(`\n[${level}] ${group.length}`)
  for (const f of group) {
    console.log(`  ${f.file}:${f.line}  ${f.rule.id}`)
    console.log(`      ${f.text.trim().slice(0, 140)}`)
    console.log(`      ${f.rule.why}`)
  }
}
if (found.length === 0) console.log('\nNothing flagged. That means the patterns above are absent, not that the change is correct.')
for (const note of notes) console.log(`\nNote: ${note}`)

if (strict && found.some((f) => f.rule.level === 'must fix')) process.exit(1)
