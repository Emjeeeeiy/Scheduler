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
