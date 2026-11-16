/* Helpers shared by plan-checks.mjs and drift.mjs.
 *
 * No dependencies on purpose: these run from a fresh checkout before (or
 * without) `npm ci`, and on Windows as well as in CI, so everything here goes
 * through node:fs / node:path / node:child_process and normalizes paths to
 * forward slashes for output and comparison.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/* The scripts live in <root>/.claude/skills/cadence-verify/scripts/, so the
   repository root is four levels up. `--root <dir>` overrides it (used when
   the skill is exercised against another checkout). */
const here = dirname(fileURLToPath(import.meta.url))
export function repoRoot(argv = process.argv) {
  const at = argv.indexOf('--root')
  if (at !== -1 && argv[at + 1]) return resolve(argv[at + 1])
  return resolve(here, '..', '..', '..', '..')
}

/** A path relative to the root, with forward slashes on every platform. */
export function rel(root, absolute) {
  return relative(root, absolute).split('\\').join('/')
}

export function exists(root, path) {
  return existsSync(join(root, path))
}

/** The file's text, or null when it is missing or unreadable. */
export function read(root, path) {
  try {
    return readFileSync(join(root, path), 'utf8')
  } catch {
    return null
  }
}

const ALWAYS_SKIP = new Set(['node_modules', 'dist', '.git', '.vercel', '.scratch', 'shared'])

/**
 * Every file under `dir` (root-relative) whose name matches `pattern`.
 * `shared` is skipped everywhere: functions/shared/ is a gitignored copy made
 * by scripts/syncSharedLib.mjs, and checking a copy tells you nothing.
 */
export function walk(root, dir, pattern = /./, { skip = ALWAYS_SKIP } = {}) {
  const out = []
  const start = join(root, dir)
  if (!existsSync(start)) return out
  const visit = (absolute) => {
    for (const name of readdirSync(absolute)) {
      if (skip.has(name)) continue
      const full = join(absolute, name)
      if (statSync(full).isDirectory()) visit(full)
      else if (pattern.test(name)) out.push(rel(root, full))
    }
  }
  visit(start)
  return out.sort()
}

/** Run git in the repo; returns stdout lines, or null when git failed.
    spawnSync caps captured output at 1 MiB by default and reports an overrun as
    a failure, so a large diff (a 20,000-line branch) would come back as "git
    failed" and be mistaken for a missing ref. Raise the cap well past any diff
    this repo will produce. */
export function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
  if (result.error || result.status !== 0) return null
  return result.stdout.split(/\r?\n/).filter(Boolean)
}

/**
 * The names an `import { a, b as c } from '<specifier>'` statement brings in,
 * for every import in `text` whose specifier satisfies `matches`. Handles
 * statements that span several lines. `a as b` yields `a` — the exported name.
 */
export function importedNames(text, matches) {
  const found = []
  const pattern = /import\s*(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g
  for (let hit = pattern.exec(text); hit; hit = pattern.exec(text)) {
    if (!matches(hit[2])) continue
    for (const part of hit[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim()
      if (name) found.push(name)
    }
  }
  return found
}

/**
 * The names a module exports: `export const|let|function|class|async function
 * NAME` and `export { a, b as c }` (with or without `from`).
 */
export function exportedNames(text) {
  const names = new Set()
  for (const hit of text.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([\w$]+)/g)) {
    names.add(hit[1])
  }
  for (const hit of text.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of hit[1].split(',')) {
      const pieces = part.trim().split(/\s+as\s+/)
      const name = (pieces[1] ?? pieces[0]).trim()
      if (name) names.add(name)
    }
  }
  return names
}
