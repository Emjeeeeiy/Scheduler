import Image from '@tiptap/extension-image'

/* Images in a note are stored inside the note, as data URIs, and nowhere else.
 *
 * Never a remote URL. A note pasted from a web page arrives full of <img
 * src="https://…">, and honouring those would make opening a note fetch things
 * from other people's servers — a tracking pixel, or a page that changes after
 * you saved it. Only a raster data URI is accepted from pasted or stored
 * content; anything else is dropped at parse time.
 *
 * (Inside the note, rather than as separate files, because the whole note is one
 * document that saves atomically and works offline. The price is that every
 * image counts toward the note's size limit — see lib/image.js, which shrinks an
 * image before it is ever inserted.)
 */

const DATA_IMAGE = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/

export const isDataImage = (src) => typeof src === 'string' && DATA_IMAGE.test(src)

export const JournalImage = Image.extend({
  parseHTML() {
    return [
      {
        tag: 'img[src]',
        getAttrs: (element) => (isDataImage(element.getAttribute('src')) ? null : false),
      },
    ]
  },
}).configure({
  inline: false,
  allowBase64: true,
  resize: {
    enabled: true,
    directions: ['bottom-right', 'bottom-left', 'top-right', 'top-left'],
    minWidth: 48,
    minHeight: 48,
    alwaysPreserveAspectRatio: true,
  },
})
