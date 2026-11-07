/* The two pictures a push notification wears, and the paths that point at them.
 *
 * Android draws them oppositely, which is how this went wrong once: the status
 * bar / card-header "badge" keeps only the image's ALPHA and tints it, so it has
 * to be a glyph on transparency; handed the app icon (a clock on an opaque
 * plate) every plate pixel counts as ink and it renders as a solid white
 * square. The large "icon" is shown as given, so it has to be a complete,
 * opaque picture. These tests read the real files and the real references so
 * neither can drift back.
 */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { describe, it } from 'node:test'
import { inflateSync } from 'node:zlib'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root))

/** Decodes the PNGs scripts/lib/markPng.mjs writes: 8-bit RGBA, filter 0. */
function decodePng(path) {
  const buf = read(path)
  assert.equal(buf.subarray(1, 4).toString('ascii'), 'PNG', `${path} is not a PNG`)
  let offset = 8
  let width
  let height
  const idat = []
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    const data = buf.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      assert.equal(data[8], 8, 'bit depth')
      assert.equal(data[9], 6, 'colour type must be RGBA')
    }
    if (type === 'IDAT') idat.push(data)
    offset += 12 + length
  }
  const raw = inflateSync(Buffer.concat(idat))
  const pixels = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1)
    assert.equal(raw[row], 0, 'only filter 0 is supported')
    raw.copy(pixels, y * width * 4, row + 1, row + 1 + width * 4)
  }
  const alpha = (x, y) => pixels[(y * width + x) * 4 + 3]
  const luma = (x, y) => {
    const i = (y * width + x) * 4
    return 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]
  }
  return { width, height, alpha, luma }
}

/** Share of pixels satisfying `test(x, y)`. */
function share({ width, height }, test) {
  let hits = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (test(x, y)) hits += 1
  return hits / (width * height)
}

const corners = (image) => [
  [0, 0],
  [image.width - 1, 0],
  [0, image.height - 1],
  [image.width - 1, image.height - 1],
]

/** What a file is, as far as Android's two uses are concerned. */
function asBadge(path) {
  const image = decodePng(path)
  return { image, inked: share(image, (x, y) => image.alpha(x, y) > 128) }
}

describe('the notification badge (small icon: status bar and card header)', () => {
  const { image, inked } = asBadge('public/notif-badge-96.png')

  it('is a square a status bar can downscale', () => {
    assert.equal(image.width, image.height)
    assert.ok(image.width >= 72 && image.width <= 192, `unexpected size ${image.width}`)
  })

  it('is a glyph on transparency, not a plate: Android keeps only the alpha', () => {
    for (const [x, y] of corners(image)) assert.equal(image.alpha(x, y), 0)
    // The app icon's plate inks ~95% of its pixels and renders as a solid
    // square; a clock outline inks a small fraction.
    assert.ok(inked > 0.05 && inked < 0.35, `inked share ${inked.toFixed(2)} — a solid shape would be a white square`)
  })

  it('actually contains the clock: a ring and hands, with an empty face between them', () => {
    const c = image.width / 2
    const ringRadius = Math.round(image.width * 0.39) // outer ring sits ~39% from centre
    assert.ok(image.alpha(Math.round(c + ringRadius), Math.round(c)) > 128 || image.alpha(Math.round(c), Math.round(c - ringRadius)) > 128, 'no ring where the ring should be')
    // Midway between the centre and the ring, away from both hands, is open face.
    assert.equal(image.alpha(Math.round(c + image.width * 0.25), Math.round(c - image.width * 0.1)), 0)
  })

  it('is NOT the app icon, which would render as a solid square', () => {
    const appIcon = asBadge('public/icon-192.png')
    assert.ok(appIcon.inked > 0.8, 'sanity: the app icon really is a mostly opaque plate')
  })
})

describe('the notification icon (large picture on the card)', () => {
  const image = decodePng('public/notif-icon-256.png')

  it('is a complete opaque picture, since Android shows it as given', () => {
    assert.equal(image.width, image.height)
    assert.equal(share(image, (x, y) => image.alpha(x, y) === 255), 1)
  })

  it('is a light clock on the brand ink, so it reads on dark AND light shades', () => {
    for (const [x, y] of corners(image)) assert.ok(image.luma(x, y) < 40, 'the tile should be near-black')
    const light = share(image, (x, y) => image.luma(x, y) > 200)
    assert.ok(light > 0.08 && light < 0.4, `clock covers ${(light * 100).toFixed(0)}% — should be a bold mark, not a speck`)
  })
})

describe('what the code points at', () => {
  const sources = {
    'public/sw.js': read('public/sw.js').toString('utf8'),
    'packages/shared/src/notifications.js': read('packages/shared/src/notifications.js').toString('utf8'),
  }
  const pick = (text, key) => [...text.matchAll(new RegExp(`${key}:\\s*'([^']+)'`, 'g'))].map((m) => m[1])

  for (const [file, text] of Object.entries(sources)) {
    it(`${file} names a badge and an icon that exist`, () => {
      const badges = pick(text, 'badge')
      const icons = pick(text, 'icon')
      assert.ok(badges.length > 0 && icons.length > 0, 'no badge/icon reference found')
      for (const path of [...badges, ...icons]) {
        assert.ok(existsSync(new URL(`public${path}`, root)), `${file} points at ${path}, which does not exist`)
      }
    })

    it(`${file} uses a real badge (transparent) and a real icon (opaque)`, () => {
      for (const path of pick(text, 'badge')) {
        const { inked } = asBadge(`public${path}`)
        assert.ok(inked < 0.35, `${file}: badge ${path} is ${(inked * 100).toFixed(0)}% opaque — Android would draw a solid square`)
      }
      for (const path of pick(text, 'icon')) {
        const icon = decodePng(`public${path}`)
        assert.equal(share(icon, (x, y) => icon.alpha(x, y) === 255), 1, `${file}: icon ${path} should be fully opaque`)
      }
    })
  }

  it('the service worker and the in-app alerts use the same pair', () => {
    const [swBadge] = pick(sources['public/sw.js'], 'badge')
    const [swIcon] = pick(sources['public/sw.js'], 'icon')
    const shared = sources['packages/shared/src/notifications.js']
    assert.equal(pick(shared, 'badge')[0], swBadge)
    assert.equal(pick(shared, 'icon')[0], swIcon)
  })
})
