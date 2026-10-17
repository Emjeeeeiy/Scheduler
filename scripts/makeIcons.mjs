/* Generates the PWA's PNG icons from the same clock mark public/favicon.svg
 * draws, rasterized here rather than pulled in from a design tool.
 *
 * The drawing and the PNG encoding both live in scripts/lib/markPng.mjs,
 * shared with makeMobileAssets.mjs — the Expo app's icon and splash artwork
 * come out of the same rasterizer, so the installed-app icon and the in-app
 * splash mark can't drift apart.
 *
 *   node scripts/makeIcons.mjs
 *
 * Re-run it only if the mark itself changes; the outputs are committed.
 */

import { writeFileSync } from 'node:fs'
import { markPng } from './lib/markPng.mjs'

const OUTPUTS = [
  { file: 'public/icon-192.png', size: 192, background: 'plate' },
  { file: 'public/icon-512.png', size: 512, background: 'plate' },
  // 20% inset keeps the mark inside the ~80% safe zone a maskable icon is
  // guaranteed to keep, whatever shape the platform crops to.
  { file: 'public/icon-maskable-512.png', size: 512, background: 'full', inset: 0.2 },
  { file: 'public/apple-touch-icon.png', size: 180, background: 'plate' },
]

for (const { file, size, background, inset = 0 } of OUTPUTS) {
  const png = markPng(size, { inset, background })
  writeFileSync(file, png)
  console.log(`${file}  ${size}×${size}  ${(png.length / 1024).toFixed(1)} kB`)
}