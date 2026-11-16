#!/usr/bin/env node
/* Run a command under a different timezone, and prove the timezone took.
 *
 *   node .claude/skills/cadence-verify/scripts/with-tz.mjs America/Los_Angeles -- npm test
 *
 * Why this exists: the date code here (day keys, DST-safe reminder times,
 * recurrence) is only really exercised in a zone that has daylight saving, and
 * neither place the tests normally run has one — this machine is UTC+8
 * (Asia/Singapore) and CI is UTC. And the obvious way to try it does not work
 * everywhere: `TZ=America/Los_Angeles npm test` typed in Git Bash is silently
 * ignored for any zone but UTC, so the run "passes" in the wrong zone. This
 * sets TZ in the child's environment directly, then asks the child what zone
 * it actually got and refuses to run if the answer is not the one requested.
 */

import { spawnSync } from 'node:child_process'

const argv = process.argv.slice(2)
const split = argv.indexOf('--')
const zone = argv[0]
const command = split === -1 ? [] : argv.slice(split + 1)

if (!zone || zone === '--' || command.length === 0) {
  console.error('usage: with-tz.mjs <IANA zone> -- <command> [args...]')
  console.error('   eg: with-tz.mjs America/Los_Angeles -- npm test')
  process.exit(2)
}

try {
  new Intl.DateTimeFormat('en', { timeZone: zone })
} catch {
  console.error(`"${zone}" is not a timezone Node recognises (use an IANA name such as America/Los_Angeles).`)
  process.exit(2)
}

const env = { ...process.env, TZ: zone }

/* Ask a child, in the environment the real command will get, what it sees.
   January and July offsets differ exactly when the zone observes DST. */
const probe = spawnSync(
  process.execPath,
  [
    '-e',
    `const z = Intl.DateTimeFormat().resolvedOptions().timeZone
     console.log(JSON.stringify({ zone: z, jan: new Date(2026, 0, 15).getTimezoneOffset(), jul: new Date(2026, 6, 15).getTimezoneOffset() }))`,
  ],
  { env, encoding: 'utf8' },
)
let seen
try {
  seen = JSON.parse(probe.stdout)
} catch {
  console.error('Could not determine the timezone the child process sees.')
  process.exit(2)
}

const label = (minutes) => {
  const sign = minutes <= 0 ? '+' : '-'
  const abs = Math.abs(minutes)
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}
const observesDst = seen.jan !== seen.jul
console.log(`TZ=${zone}: child sees ${seen.zone} — January ${label(seen.jan)}, July ${label(seen.jul)}, DST ${observesDst ? 'yes' : 'NO'}`)

if (seen.zone !== zone) {
  console.error(`The child process reports ${seen.zone}, not ${zone}. Not running: a result from the wrong zone proves nothing.`)
  process.exit(2)
}
if (!observesDst) {
  console.warn(`Note: ${zone} has no daylight saving, so this does not exercise DST. Try America/Los_Angeles or Europe/London.`)
}

/* npm and npx are .cmd shims on Windows and need a shell; everything else is
   run directly. Arguments with spaces are quoted for that shell. */
const needsShell = process.platform === 'win32'
const quote = (arg) => (/\s/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg)
const result = needsShell
  ? spawnSync(command.map(quote).join(' '), { env, stdio: 'inherit', shell: true })
  : spawnSync(command[0], command.slice(1), { env, stdio: 'inherit' })

process.exit(result.status ?? 1)
