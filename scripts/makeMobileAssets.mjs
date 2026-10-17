/* Generates the Expo app's launcher icon and splash artwork from the same
 * clock mark public/favicon.svg draws, via the shared rasterizer in
 * scripts/lib/markPng.mjs.
 *
 *   node scripts/makeMobileAssets.mjs
 *
 * Run from the repo root. Re-run only if the mark itself changes; the outputs
 * are committed.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { markPng } from './lib/markPng.mjs'

const OUT_DIR = 'apps/mobile/assets'
mkdirSync(OUT_DIR, { recursive: true })

const OUTPUTS = [
  /* The launcher icon. 1024 is the size both stores expect; Android scales it
     down and applies its own mask, so the mark carries the rounded-square
     plate favicon.svg has rather than a bare glyph floating in a square. */
  { file: `${OUT_DIR}/icon.png`, size: 1024, background: 'plate' },
  /* The splash mark. No plate: Android composites this one onto the splash
     background colour, so a plate inside it would show as a visible white
     square on a #f9f9f7 screen. Inset for the same reason as the maskable
     PWA icon — this is the artwork an Android 12+ splash crops to whatever
     shape it likes. */
  { file: `${OUT_DIR}/splash-icon.png`, size: 512, background: 'none', inset: 0.2 },
]

for (const { file, size, background, inset = 0 } of OUTPUTS) {
  const png = markPng(size, { inset, background })
  writeFileSync(file, png)
  console.log(`${file}  ${size}×${size}  ${(png.length / 1024).toFixed(1)} kB`)
}