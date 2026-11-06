/** Reads an image file, crops it to a centered square, and downsizes it to a
    small JPEG data URI — small enough to sit as a plain field on a Firestore
    document (a few tens of KB) regardless of how large the source photo was,
    so there is no file-size limit to explain to the person picking one. */
export function fileToAvatarDataUri(file, { size = 256, quality = 0.85 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Choose an image file.'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('That file is not a readable image.'))
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        // Cover-crop: the shorter source dimension maps to the full square,
        // the longer one is centered and clipped, so a wide or tall photo
        // still fills the circle instead of letterboxing inside it.
        const side = Math.min(img.width, img.height)
        const sx = (img.width - side) / 2
        const sy = (img.height - side) / 2
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

/* ------------------------------------------------------- images in a note -- */

/** A note is one document of about a megabyte, and a data URI counts character
    for character against it. One image may use at most this much, so a note can
    hold several without one photo filling it. */
export const NOTE_IMAGE_MAX_CHARS = 450_000

// Tried in order until the result fits: big and good first, smaller and softer after.
const NOTE_IMAGE_ATTEMPTS = [
  { maxDim: 1400, quality: 0.8 },
  { maxDim: 1100, quality: 0.72 },
  { maxDim: 800, quality: 0.65 },
]

/** The size to draw an image at so its longer side is at most `maxDim` — and
    never larger than the original: shrinking loses detail, enlarging invents it. */
export function fitWithin(width, height, maxDim) {
  const scale = Math.min(1, maxDim / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('That file is not a readable image.'))
      img.onload = () => resolve(img)
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

function drawJpeg(img, maxDim, quality) {
  const { width, height } = fitWithin(img.width, img.height, maxDim)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  // JPEG has no transparency: a transparent PNG would otherwise come out black.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}

/** An image file -> a JPEG data URI small enough to live inside a note, shrunk
    as far as it takes. Rejects, with a reason fit to show, when even the
    smallest attempt does not fit. */
export async function fileToNoteImage(file, { limit = NOTE_IMAGE_MAX_CHARS } = {}) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
  const img = await loadImage(file)
  for (const { maxDim, quality } of NOTE_IMAGE_ATTEMPTS) {
    const uri = drawJpeg(img, maxDim, quality)
    if (uri.length <= limit) return uri
  }
  throw new Error('That image is too large for a note, even shrunk. Try a smaller one.')
}
