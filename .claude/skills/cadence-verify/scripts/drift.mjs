#!/usr/bin/env node
/* Mechanical consistency checks for the places this repo has already drifted.
 *
 *   node .claude/skills/cadence-verify/scripts/drift.mjs [--strict] [--only a,b] [--root <dir>]
 *
 * Each check below exists because the drift it looks for has already cost
 * something (see its comment). They are deliberately cheap regex scans, not a
 * parser: a false positive is something to read and dismiss, so every finding
 * names the file and says what to do. Exits 0 unless --strict is given and
 * something was found — informational by default, so it can run on every
 * change without blocking work on a finding that predates it.
 *
 *   docs    paths named in the docs that no longer exist
 *   api     api tests missing from vitest.config.js's apiTests
 *   smoke   names src/ imports from a context that the SSR smoke mock lacks
 *   dialogs dialogs that do not use useModalA11y
 *   sync    functions/ importing a shared file that syncSharedLib.mjs does not copy
 */

import { exists, exportedNames, importedNames, read, repoRoot, walk } from './lib.mjs'

const argv = process.argv.slice(2)
const root = repoRoot(process.argv)
const strict = argv.includes('--strict')
const onlyAt = argv.indexOf('--only')
const only = onlyAt === -1 ? null : new Set((argv[onlyAt + 1] ?? '').split(',').filter(Boolean))

const sourceFiles = (dir, pattern) => walk(root, dir, pattern)

/* ------------------------------------------------------------------ docs */

/* The README's Layout section went stale when the pure logic moved to
   packages/shared: it kept listing src/lib/date.js and five more files that no
   longer exist. A reader (or an AI) following it goes looking for code that is
   not there. This catches a path in prose and a path in an indented tree. */
/* The project skills' own docs are checked too: they name dozens of files, and
   a skill that points at a moved file is worse than none because it is trusted.
   They write a placeholder as `x`, `X…`, `my-…`, `My…`, `Thing` or `<…>` (see
   PLACEHOLDER), which is why those spellings are not flagged. */
const DOC_FILES = [
  'README.md',
  'README-push.md',
  'README-functions.md',
  'PRODUCT.md',
  'DESIGN.md',
  'CLAUDE.md',
  '.env.example',
  ...walk(root, '.claude/skills', /\.md$/, { skip: new Set(['node_modules', 'impeccable']) }),
]
const ROOTS = ['src', 'packages', 'api', 'functions', 'tests', 'scripts', 'apps', 'public']
const PROSE_PATH = new RegExp(`(?<![\\w./-])((?:${ROOTS.join('|')})/[\\w./@~-]*[\\w/])`, 'g')
// Text that stands for a path rather than naming one.
const PLACEHOLDER = /[*<>{}…]|\bX[A-Z]|\.\.\.|(^|[/_])(x|my-[\w-]+|My[A-Z]\w*|Thing|new[A-Z]\w*|Foo\w*)(\.|\/|$)/

function checkDocs() {
  const findings = []
  const seen = new Set()
  const note = (file, path, how) => {
    const key = `${file}|${path}`
    if (seen.has(key)) return
    seen.add(key)
    findings.push(`${file}: ${path} does not exist (${how})`)
  }

  for (const file of DOC_FILES) {
    const text = read(root, file)
    if (text === null) continue

    for (const hit of text.matchAll(PROSE_PATH)) {
      const path = hit[1]
      if (PLACEHOLDER.test(path)) continue
      if (!exists(root, path)) note(file, path, 'named in the text')
    }

    // An indented tree: a fenced block whose first line is a top-level root
    // ("src/"), with children indented beneath it.
    for (const block of text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) {
      const lines = block[1].split(/\r?\n/)
      if (!ROOTS.some((r) => lines[0]?.trim().startsWith(`${r}/`))) continue
      const stack = []
      for (const line of lines) {
        const hit = /^(\s*)([\w.@~-]+(?:\/[\w.@~-]+)*\/?)(?:\s{2,}.*)?$/.exec(line)
        if (!hit) continue
        const indent = hit[1].length
        const name = hit[2]
        const isDir = name.endsWith('/')
        if (!isDir && !/\.\w+$/.test(name)) continue // a word, not a path
        while (stack.length && stack.at(-1).indent >= indent) stack.pop()
        const path = [...stack.map((s) => s.name), name].join('').replace(/\/+/g, '/')
        if (isDir) stack.push({ indent, name })
        if (PLACEHOLDER.test(path)) continue
        if (!exists(root, path.replace(/\/$/, ''))) note(file, path, 'listed in a layout tree')
      }
    }
  }
  return findings
}

/* ------------------------------------------------------------------- api */

/* A handler test must run on vitest's `node` project: @google/genai needs
   Node's web globals, which the jsdom/vmThreads project lacks. The list is
   hand-kept in vitest.config.js, so a new api test that is not added fails in
   a confusing way ("ReadableStream is not defined"). */
function checkApi() {
  const config = read(root, 'vitest.config.js')
  if (config === null) return []
  const block = /const apiTests\s*=\s*\[([\s\S]*?)\]/.exec(config)
  if (!block) return ['vitest.config.js: could not find the `apiTests` list — update this check']
  const listed = [...block[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
  const findings = []

  for (const path of listed) {
    if (!exists(root, path)) findings.push(`vitest.config.js: apiTests names ${path}, which does not exist`)
  }
  const touchesApi = /(?:from|import\(|vi\.mock\()\s*['"](?:\.\.\/)+api\//
  for (const path of sourceFiles('tests', /\.test\.jsx$/)) {
    if (listed.includes(path)) continue
    const text = read(root, path) ?? ''
    if (touchesApi.test(text)) {
      findings.push(`${path}: imports from api/ but is not in apiTests (vitest.config.js) — it will run under jsdom`)
    }
  }
  return findings
}

/* ----------------------------------------------------------------- smoke */

/* `npm run test:render` swaps three real modules for fixtures (see the alias
   list in tests/smoke/vite.config.js). A component that imports a name the
   fixture does not export fails the whole build — it already broke once when
   TAG_ICONS was missing. */
const MOCKS = [
  { real: 'state/ScheduleContext.jsx', mock: 'tests/smoke/mockSchedule.jsx' },
  { real: 'state/AuthContext.jsx', mock: 'tests/smoke/mockAuth.jsx' },
  { real: 'state/useJournal.js', mock: 'tests/smoke/mockJournal.js' },
]

function checkSmoke() {
  const findings = []
  const files = sourceFiles('src', /\.(jsx?|mjs)$/)
  for (const { real, mock } of MOCKS) {
    const mockText = read(root, mock)
    if (mockText === null) {
      findings.push(`${mock}: missing — tests/smoke/vite.config.js aliases ${real} to it`)
      continue
    }
    const provided = exportedNames(mockText)
    const wanted = new Map() // name -> first file that imports it
    for (const file of files) {
      const text = read(root, file) ?? ''
      for (const name of importedNames(text, (spec) => spec.endsWith(`/${real}`))) {
        if (!wanted.has(name)) wanted.set(name, file)
      }
    }
    for (const [name, file] of wanted) {
      if (!provided.has(name)) findings.push(`${mock}: does not export \`${name}\` (imported by ${file}) — test:render will fail to build`)
    }
  }
  return findings
}

/* --------------------------------------------------------------- dialogs */

/* Every modal dialog gets its focus trap, Escape handling, scroll lock and
   focus restore from useModalA11y. A modal written without it looks fine and
   then leaves focus behind the overlay.

   Keyed on `aria-modal`, not on `role="dialog"`: DayPeek and the Journal
   toolbar's popovers are anchored, non-modal `role="dialog"` panels that
   deliberately do not trap focus, and flagging them would teach people to
   ignore this check. */
function checkDialogs() {
  const findings = []
  for (const file of sourceFiles('src', /\.jsx$/)) {
    const text = read(root, file) ?? ''
    if (!/aria-modal/.test(text)) continue
    if (!text.includes('useModalA11y')) {
      findings.push(`${file}: renders a modal (aria-modal) but does not call useModalA11y (src/lib/useModalA11y.js)`)
    }
  }
  return findings
}

/* ------------------------------------------------------------------ sync */

/* Firebase uploads only functions/, so scripts/syncSharedLib.mjs copies a
   fixed list of packages/shared files into functions/shared/lib/. A function
   importing a file that is not on the list works locally (the copy exists
   from an earlier run, or the import resolves upward) and then fails once
   deployed. The list must also be closed under the copied files' own imports. */
function checkSync() {
  const script = read(root, 'scripts/syncSharedLib.mjs')
  if (script === null) return []
  const list = /const FILES\s*=\s*\[([\s\S]*?)\]/.exec(script)
  if (!list) return ['scripts/syncSharedLib.mjs: could not find the `FILES` list — update this check']
  const copied = new Set([...list[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]))
  const findings = []

  const importsShared = /from\s*['"](?:\.\.?\/)+shared\/lib\/([\w.-]+)['"]/g
  const functionFiles = ['functions/index.js', ...sourceFiles('functions/lib', /\.js$/), ...sourceFiles('functions/test', /\.js$/)]
  for (const file of functionFiles) {
    const text = read(root, file) ?? ''
    for (const hit of text.matchAll(importsShared)) {
      if (!copied.has(hit[1])) findings.push(`${file}: imports shared/lib/${hit[1]}, which syncSharedLib.mjs does not copy — add it to FILES`)
    }
  }

  for (const name of copied) {
    const source = `packages/shared/src/${name}`
    const text = read(root, source)
    if (text === null) {
      findings.push(`scripts/syncSharedLib.mjs: FILES lists ${name}, but ${source} does not exist`)
      continue
    }
    for (const hit of text.matchAll(/from\s*['"]\.\/([\w.-]+)['"]/g)) {
      if (!copied.has(hit[1])) findings.push(`${source}: imports ./${hit[1]}, which is not in syncSharedLib.mjs FILES — the copy in functions/ will not resolve it`)
    }
    if (/from\s*['"]@cadence\/shared\//.test(text)) {
      findings.push(`${source}: imports @cadence/shared/…, which does not resolve inside functions/ — use a relative import`)
    }
  }
  return findings
}

/* ------------------------------------------------------------------- run */

const CHECKS = { docs: checkDocs, api: checkApi, smoke: checkSmoke, dialogs: checkDialogs, sync: checkSync }
let total = 0

for (const [name, run] of Object.entries(CHECKS)) {
  if (only && !only.has(name)) continue
  const findings = run()
  total += findings.length
  console.log(`\n[${name}] ${findings.length === 0 ? 'ok' : `${findings.length} finding${findings.length === 1 ? '' : 's'}`}`)
  for (const finding of findings) console.log(`  - ${finding}`)
}

console.log(`\n${total === 0 ? 'No drift found.' : `${total} finding${total === 1 ? '' : 's'}. Fix the ones in files you touched; report the rest.`}`)
if (strict && total > 0) process.exit(1)
