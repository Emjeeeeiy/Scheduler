#!/usr/bin/env node
/* Work out which checks a change needs, cheapest first. Plans; does not run.
 *
 *   node .claude/skills/cadence-verify/scripts/plan-checks.mjs [--base main] [--files a,b] [--json]
 *
 * This repo has seven checks that each cover something the others do not
 * (README "Scripts" and ci.yml), and the full set is slow — the vitest layer
 * alone is about 70 s here. Running all of them for a CSS tweak wastes time;
 * running only `npm test` for a view change misses the SSR render check, which
 * is the one that catches a mock drifting out of step. So the mapping from
 * "what changed" to "what to run" lives here, once, instead of in someone's
 * head.
 *
 * The changed set is the diff against --base (default main) plus staged,
 * unstaged and untracked files. --files replaces it, so the mapping can be
 * tried without touching the working tree.
 */

import { spawnSync } from 'node:child_process'
import { git, read, repoRoot, walk } from './lib.mjs'

const argv = process.argv.slice(2)
const root = repoRoot(process.argv)
const flag = (name) => {
  const at = argv.indexOf(name)
  return at === -1 ? null : (argv[at + 1] ?? null)
}
const base = flag('--base') ?? 'main'
const asJson = argv.includes('--json')

/* ------------------------------------------------------- changed files */

function changedFiles() {
  const given = flag('--files')
  if (given) return [...new Set(given.split(',').map((f) => f.trim().replace(/\\/g, '/')).filter(Boolean))].sort()

  const sets = [
    git(root, ['diff', '--name-only', `${base}...HEAD`]), // committed on this branch
    git(root, ['diff', '--name-only', 'HEAD']), // staged + unstaged
    git(root, ['ls-files', '--others', '--exclude-standard']), // new, not yet added
  ]
  if (sets[0] === null) notes.push(`Could not diff against "${base}" (no such ref, or git failed), so committed changes on this branch are NOT included. Pass --base <ref>.`)
  return [...new Set(sets.flat().filter(Boolean))].sort()
}

/* --------------------------------------------------------- the catalogue */

const CATALOGUE = {
  drift: { cost: 1, command: 'node .claude/skills/cadence-verify/scripts/drift.mjs' },
  lint: { cost: 1, command: 'npm run lint' },
  test: { cost: 2, command: 'npm test' },
  api: { cost: 3, command: 'npx vitest run --project node' },
  functions: { cost: 3, command: 'npm run test:functions' },
  render: { cost: 4, command: 'npm run test:render' },
  'dom-targeted': { cost: 4.5, command: 'npx vitest run' }, // files appended below
  dom: { cost: 5, command: 'npm run test:dom' },
  dst: { cost: 5.5, command: 'node .claude/skills/cadence-verify/scripts/with-tz.mjs America/Los_Angeles -- npm test' },
  build: { cost: 6, command: 'npm run build' },
  rules: { cost: 7, command: 'npm run test:rules' },
}
const WHAT = {
  drift: 'stale doc paths, apiTests, smoke mocks, dialogs, functions sync',
  lint: 'oxlint',
  test: 'pure-logic tests (node:test)',
  api: 'api handler tests (vitest node project)',
  functions: 'Cloud Functions tests',
  render: 'SSR smoke render of every view',
  'dom-targeted': 'the component tests that cover the changed files',
  dom: 'all component/hook tests (vitest + jsdom)',
  dst: 'pure-logic tests again in a zone with daylight saving',
  build: 'production bundle',
  rules: 'firestore.rules against the emulator',
}

const planned = new Map() // id -> Set of reasons
const notes = []
const unclassified = []
const need = (id, reason) => {
  if (!planned.has(id)) planned.set(id, new Set())
  planned.get(id).add(reason)
}

/* ---------------------------------------------------------- the mapping */

// What scripts/syncSharedLib.mjs copies into functions/ — read from the
// script, not repeated here, so this cannot drift from it.
const syncScript = read(root, 'scripts/syncSharedLib.mjs') ?? ''
const SYNCED = new Set([...(/const FILES\s*=\s*\[([\s\S]*?)\]/.exec(syncScript)?.[1] ?? '').matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]))

// Code whose behaviour depends on the local timezone or on DST.
const DATE_SENSITIVE = /(^|\/)(date|dayModel|recurrence|reminders|slots|autoSchedule|stats|spans|parseQuickAdd|notifications|exportFormats|digest|journalFormat|useNow|useReminderSync|ScheduleContext)[^/]*$/

const CONFIG = /^(package(-lock)?\.json|vitest\.config\.js|vite\.config\.js|\.oxlintrc\.json|jsconfig\.json|\.github\/workflows\/.+)$/
const DOCS = /(\.md|\.env\.example|\.gitignore|\.gitattributes)$/

const files = changedFiles()
const testSources = [...walk(root, 'tests', /\.test\.jsx?$/)].map((p) => ({ path: p, text: read(root, p) ?? '' }))
const targetedDom = new Set()
const skillScripts = []

for (const f of files) {
  const code = /\.(m?js|jsx)$/.test(f)
  if (code) need('lint', `${f} is code`)
  if (code && DATE_SENSITIVE.test(f)) need('dst', `${f} depends on the timezone / DST`)

  if (CONFIG.test(f)) {
    for (const id of ['lint', 'test', 'api', 'functions', 'render', 'dom', 'build']) need(id, `${f} is shared config — everything`)
    continue
  }

  if (f.startsWith('packages/shared/')) {
    need('test', `${f} is shared logic`)
    need('dom', `${f} is shared logic`)
    need('render', `${f} is shared logic`)
    need('build', `${f} is shared logic`)
    if (SYNCED.has(f.split('/').pop())) need('functions', `${f} is copied into functions/ by syncSharedLib.mjs`)
    findTests(f)
  } else if (f.startsWith('src/')) {
    need('build', `${f} is in the bundle`)
    if (f.endsWith('.css')) {
      notes.push(`${f}: a build proves it parses, not that it looks right — check it in the browser, dark theme first (see /impeccable for visual review).`)
    } else {
      need('dom', `${f} is app code`)
      if (/\.jsx$/.test(f) || f.startsWith('src/state/')) need('render', `${f} is rendered by the SSR smoke build`)
      if (!/\.jsx$/.test(f)) need('test', `${f} is plain JS, which node:test files import`)
      findTests(f)
    }
  } else if (f.startsWith('api/')) {
    need('api', `${f} is an api route or helper`)
  } else if (f.startsWith('functions/')) {
    need('functions', `${f} is a Cloud Function`)
  } else if (f === 'scripts/syncSharedLib.mjs') {
    need('functions', `${f} decides what functions/ can import`)
  } else if (f === 'firestore.rules' || f.startsWith('tests/rules/')) {
    need('rules', `${f} is the data boundary`)
  } else if (f.startsWith('tests/smoke/')) {
    need('render', `${f} is the SSR smoke harness`)
    if (/mock(Journal|Schedule)\./.test(f)) need('dom', `${f} is reused by vitest tests`)
  } else if (/^tests\/.+\.test\.js$/.test(f)) {
    need('test', `${f} is a node:test file`)
  } else if (/^tests\/.+\.test\.jsx$/.test(f)) {
    targetedDom.add(f)
    need('dom-targeted', `${f} changed`)
  } else if (f.startsWith('tests/')) {
    need('dom', `${f} is a shared test helper`)
    need('api', `${f} is a shared test helper`)
  } else if (f === 'index.html' || f === 'vercel.json' || f.startsWith('public/')) {
    need('build', `${f} is part of the build`)
  } else if (f.startsWith('.claude/skills/cadence-')) {
    need('drift', `${f} is part of the project skills`)
    if (code) skillScripts.push(f)
  } else if (f.startsWith('apps/mobile/')) {
    notes.push(`${f}: the mobile app has no tests; lint is all that runs.`)
  } else if (DOCS.test(f) || f.endsWith('.md')) {
    // documentation only — drift below is the check
  } else if (!code) {
    unclassified.push(f)
  }
}

/* The component tests that mention a changed module by name: a vitest run
   scoped to those is the fast loop; the full test:dom is for the end. */
function findTests(path) {
  const name = path.split('/').pop().replace(/\.[^.]+$/, '')
  if (name === 'index') return
  const mention = new RegExp(`/${name}(?:\\.jsx?)?['"]`)
  const hits = testSources.filter((test) => test.path.endsWith('.test.jsx') && mention.test(test.text))
  for (const test of hits) targetedDom.add(test.path)
  if (hits.length) need('dom-targeted', `${path} is imported by ${hits.length} component test${hits.length === 1 ? '' : 's'}`)
}

// Always cheap, always useful: stale paths and drifted mocks are found here.
need('drift', 'always — a cheap consistency scan')
if (skillScripts.length) notes.push(`${skillScripts.length} skill script${skillScripts.length === 1 ? '' : 's'} changed (${skillScripts.map((s) => s.split('/').pop()).join(', ')}). No test covers them: run each once, against a scratch fixture with --root where it takes one, and read the output.`)
if (files.length === 0) notes.push('No changed files were found (clean tree on the base branch?). Pass --files to plan for specific paths.')
if (planned.has('dom')) notes.push('Iterate with the targeted vitest run; run the full test:dom once at the end. One timeout under load is a known flake: rerun that file alone before calling it a failure.')
if (planned.has('dst')) notes.push('Date-sensitive code changed: also run the relevant vitest files under the DST zone, e.g. with-tz.mjs America/Los_Angeles -- npx vitest run tests/<file>.test.jsx')
if (planned.has('lint')) notes.push('Lint passes at 0 errors; the baseline has 16 warnings, so also run `npx oxlint <changed files>` and fix any warning in a file you touched.')

/* The Firestore emulator needs JDK 21+ (firebase-tools 15). "A java exists" is
   not enough — this machine has Java 8, where `java -version` succeeds and the
   emulator then fails with an unrelated-looking error. So read the major
   version ("1.8.0_481" is 8, "21.0.2" is 21) and say plainly when the check
   cannot run here, rather than let it fail confusingly. */
const REQUIRED_JAVA = 21
let rulesSkip = null
if (planned.has('rules')) {
  const java = spawnSync('java', ['-version'], { encoding: 'utf8' })
  const text = `${java.stderr ?? ''}${java.stdout ?? ''}`
  const raw = /version "(\d+)(?:\.(\d+))?/.exec(text)
  const major = raw ? (raw[1] === '1' ? Number(raw[2]) : Number(raw[1])) : null
  if (java.error || java.status !== 0 || major === null) {
    rulesSkip = `no JDK on PATH (needs ${REQUIRED_JAVA}+) — cannot run locally; CI's \`rules\` job covers it`
  } else if (major < REQUIRED_JAVA) {
    rulesSkip = `JDK ${major} found, needs ${REQUIRED_JAVA}+ — cannot run locally; CI's \`rules\` job covers it`
  }
}

/* -------------------------------------------------------------- output */

const checks = [...planned.entries()]
  .map(([id, reasons]) => ({
    id,
    cost: CATALOGUE[id].cost,
    what: WHAT[id],
    command: id === 'dom-targeted' ? `${CATALOGUE[id].command} ${[...targetedDom].sort().join(' ')}` : CATALOGUE[id].command,
    reasons: [...reasons],
    skip: id === 'rules' ? rulesSkip : null,
  }))
  .sort((a, b) => a.cost - b.cost)
const skipped = Object.keys(CATALOGUE).filter((id) => !planned.has(id))

if (asJson) {
  console.log(JSON.stringify({ base, files, checks, notRequired: skipped, notes, unclassified }, null, 2))
  process.exit(0)
}

const shown = files.slice(0, 15)
console.log(`Changed files (${files.length}) vs ${base}:`)
for (const f of shown) console.log(`  ${f}`)
if (files.length > shown.length) console.log(`  … and ${files.length - shown.length} more`)

console.log('\nChecks, cheapest first:')
checks.forEach((check, index) => {
  console.log(`\n ${index + 1}. ${check.id} — ${check.what}${check.skip ? '   [CANNOT RUN HERE]' : ''}`)
  console.log(`    $ ${check.command}`)
  const why = check.reasons.slice(0, 3).join('; ')
  console.log(`    why: ${why}${check.reasons.length > 3 ? `; +${check.reasons.length - 3} more` : ''}`)
  if (check.skip) console.log(`    ${check.skip}`)
})

if (skipped.length) console.log(`\nNot needed for this change: ${skipped.join(', ')}`)
if (unclassified.length) console.log(`\nNot classified (no check mapped — decide by hand): ${unclassified.join(', ')}`)
if (notes.length) {
  console.log('\nNotes:')
  for (const note of notes) console.log(`  - ${note}`)
}
