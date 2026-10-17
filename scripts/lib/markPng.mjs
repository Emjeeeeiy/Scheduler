/* The clock mark, rasterized to a PNG buffer.
 *
 * Shared by the two asset generators in scripts/ — makeIcons.mjs for the PWA's
 * icons, makeMobileAssets.mjs for the Expo app's icon and splash artwork — so
 * the installed-app icon and the in-app splash mark are provably the same
 * drawing, drawn in the same 32-unit coordinate space favicon.svg uses.
 *
 * Written against Node's built-in zlib and nothing else. A PNG is a handful of
 * length-prefixed chunks around a zlib stream, which is a much smaller thing to
 * own than an image dependency the rest of this project has no use for — and
 * this runs once, by hand, not on every build.
 */

import { deflateSync } from 'node:zlib'

/* Every shape is sampled SS×SS times per pixel and averaged. Anti-aliasing
   by supersampling is slower than computing exact coverage, but it is the
   same three lines for a circle, a ring, and a rounded rectangle, and at
   these sizes the whole run is still instant. */
const SS = 4

const INK = [11, 11, 11] // --color-ink, the favicon's stroke
const PAPER = [255, 255, 255]

/** Signed distance from a point to a rounded rectangle, negative inside. */
function sdRoundRect(x, y, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(x - cx) - (halfW - radius)
  const dy = Math.abs(y - cy) - (halfH - radius)
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
  return outside + Math.min(Math.max(dx, dy), 0) - radius
}

/** Signed distance to a line segment — the clock's two hands. */
function sdSegment(x, y, ax, ay, bx, by) {
  const abx = bx - ax
  const aby = by - ay
  const t = Math.max(0, Math.min(1, ((x - ax) * abx + (y - ay) * aby) / (abx * abx + aby * aby)))
  return Math.hypot(x - (ax + t * abx), y - (ay + t * aby))
}

/**
 * The mark, as coverage in [0,1] at a point in a 32-unit square — the same
 * coordinate system favicon.svg uses, so the two stay recognisably the same
 * drawing.
 *
 * `inset` shrinks the artwork within its square. A maskable icon is cropped
 * to whatever shape the platform likes (Android may cut a circle out of it),
 * so its contents have to sit inside the safe zone rather than reaching the
 * edges the way the plain icon does.
 */
function markAt(x, y, { inset }) {
  const scale = 1 - inset
  // Map back into the 32-unit artwork space, centred.
  const u = (x - 16) / scale + 16
  const v = (y - 16) / scale + 16

  const ring = Math.abs(Math.hypot(u - 16, v - 16) - 9) - 1
  const hourHand = sdSegment(u, v, 16, 10.5, 16, 16) - 1
  const minuteHand = sdSegment(u, v, 16, 16, 19.5, 18.5) - 1
  return Math.min(ring, hourHand, minuteHand) <= 0 ? 1 : 0
}

/**
 * Render the mark at `size` px square.
 *
 * `background: 'plate'` gives it favicon.svg's rounded-square plate, the
 * 'full' background fills the canvas instead (a platform mask will round the
 * corners itself, and a rounded plate inside a rounded mask reads as a
 * shrunken sticker), and 'none' leaves the artwork on transparency — what a
 * splash mark wants, since it is composited onto the splash background colour
 * rather than standing as its own tile.
 */
function render(size, { inset = 0, background = 'none' }) {
  const pixels = Buffer.alloc(size * size * 4)
  const unit = 32 / size

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let ink = 0
      let paper = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) * unit
          const y = (py + (sy + 0.5) / SS) * unit
          ink += markAt(x, y, { inset })
          paper +=
            background === 'plate' ? (sdRoundRect(x, y, 16, 16, 16, 16, 7) <= 0 ? 1 : 0)
            : background === 'full' ? 1
            : 0
        }
      }
      const samples = SS * SS
      const inkA = ink / samples
      const paperA = paper / samples

      const at = (py * size + px) * 4
      // Ink over paper over transparency, composited by hand — two source
      // shapes is not enough to justify a compositor.
      const alpha = paperA
      for (let c = 0; c < 3; c++) {
        pixels[at + c] = Math.round(INK[c] * inkA + PAPER[c] * (1 - inkA))
      }
      pixels[at + 3] = Math.round(255 * Math.max(alpha, inkA))
    }
  }
  return pixels
}

/* ------------------------------------------------------------------ png -- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))
  return Buffer.concat([length, typed, crc])
}

function toPng(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  // 10–12: deflate, adaptive filtering, no interlace — all zero already.

  /* One filter byte per scanline. Filter 0 (None) throughout: these images
     are mostly flat colour, so deflate alone gets them small, and picking a
     per-line filter would be real work for a file measured in kilobytes. */
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** The mark as a PNG buffer. Same options as render() above. */
export function markPng(size, options) {
  return toPng(size, render(size, options))
}