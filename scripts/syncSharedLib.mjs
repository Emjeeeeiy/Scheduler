/* Copies the pure task/date logic from src/lib/ into functions/shared/lib/,
 * so Cloud Functions can compute the same "what's on today" the app itself
 * shows, from one source of truth instead of a hand-duplicated copy that
 * could drift.
 *
 * Why a copy instead of an import reaching outside functions/: Firebase only
 * uploads the `functions/` directory itself when it deploys (see the
 * `source` field in firebase.json) — a relative import pointing at
 * `../src/lib/...` resolves fine locally (same filesystem) but would 404 at
 * runtime once deployed, because the file it points to was never packaged.
 * Runs as functions/package.json's `pretest`/`predeploy` hook, so both
 * "run the tests" and "ship it" always work from the same up-to-date copy —
 * there is no path where one runs stale and the other doesn't.
 *
 * The copied files are gitignored (see functions/.gitignore): they're a
 * build artifact of this script, not a second thing to keep in sync by hand.
 */

import { copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const srcLib = join(here, '..', 'src', 'lib')
const destLib = join(here, '..', 'functions', 'shared', 'lib')

/* Exactly what functions/lib needs and its own transitive dependencies —
   digest.js pulls in stats.js and date.js for its totals; expanding a
   recurring task into a given day's occurrence (see functions/lib/dayModel.js)
   needs recurrence.js and normalize.js the same way ScheduleContext does on
   the client. Keeping this list exactly as wide as what's actually used is
   what keeps it a small, auditable copy rather than a slow drift toward
   mirroring all of src/lib/. */
const FILES = ['date.js', 'recurrence.js', 'normalize.js', 'stats.js']

mkdirSync(destLib, { recursive: true })
for (const file of FILES) {
  copyFileSync(join(srcLib, file), join(destLib, file))
  console.log(`synced ${file}`)
}
