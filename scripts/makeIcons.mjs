/* Generates the PWA's PNG icons from the same clock mark public/favicon.svg
 * draws, rasterized here rather than pulled in from a design tool.
 *
 * The drawing and the PNG encoding both live in scripts/lib/markPng.mjs,
 * shared with makeMobileAssets.mjs — the Expo app's icon and splash artwork
 * come out of the same rasterizer, so the installed-app icon and the in-app
 * splash mark can't drift apart.
 *
 *   node scripts/makeIcons.mjs            every icon
 *   node scripts/makeIcons.mjs notif      only the files whose path contains "notif"
 *
 * Re-run it only if the mark itself changes; the outputs are committed. Use the
 * filter to regenerate one family without rewriting the others' bytes.
 */

import { writeFileSync } from 'node:fs'
import { markPng } from './lib/markPng.mjs'

const WHITE = [255, 255, 255]
const INK = [11, 11, 11] // --color-ink, the favicon's stroke

const OUTPUTS = [
  { file: 'public/icon-192.png', size: 192, background: 'plate' },
  { file: 'public/icon-512.png', size: 512, background: 'plate' },
  // 20% inset keeps the mark inside the ~80% safe zone a maskable icon is
  // guaranteed to keep, whatever shape the platform crops to.
  { file: 'public/icon-maskable-512.png', size: 512, background: 'full', inset: 0.2 },
  { file: 'public/apple-touch-icon.png', size: 180, background: 'plate' },

  /* ---- push notifications (public/sw.js, packages/shared/src/notifications.js)
     Android draws a notification from TWO different images, and treats them
     oppositely:

     badge — the small icon in the status bar and at the top-left of the card.
       Android throws the colour away and keeps only the alpha channel, then
       tints it. So it must be a glyph on TRANSPARENCY. Handing it the app icon
       (a mark on an opaque plate) makes every pixel of the plate "ink", and
       the result is the solid white square this used to show. The mark is
       enlarged (negative inset) and drawn heavier, because at ~24 px it has no
       plate around it and a hairline clock turns to mush. White is only for
       previews; the colour is ignored.

     icon — the large picture. Used on DESKTOP only: on Android the logo
       already sits in the card header (the badge), so the code leaves this off
       there. Shown as given, only rounding the corners, so it is full-bleed: no
       plate of its own for the system's rounding to fight. Light mark on the
       brand's ink, so it reads as a logo on both light and dark notification
       shades (a white tile is a glaring block on dark and vanishes on light),
       drawn larger and heavier so the clock, not the tile, is what you see. */
  { file: 'public/notif-badge-96.png', size: 96, background: 'none', inset: -0.3, weight: 1.4, ink: WHITE, paper: WHITE },
  { file: 'public/notif-icon-256.png', size: 256, background: 'full', inset: -0.12, weight: 1.25, ink: WHITE, paper: INK },
]

const only = process.argv[2]

for (const { file, size, ...options } of OUTPUTS) {
  if (only && !file.includes(only)) continue
  const png = markPng(size, options)
  writeFileSync(file, png)
  console.log(`${file}  ${size}×${size}  ${(png.length / 1024).toFixed(1)} kB`)
}
