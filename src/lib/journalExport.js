/* Getting a note out of the Journal: as a standalone web page or as plain text.
 *
 * The editor's own HTML stores a drawing as a <figure> holding its strokes as
 * data — right for copying between notes, but a browser shows nothing for it.
 * An exported page needs the drawing as something a browser can draw, so each
 * one is replaced here with the inline SVG the drawing engine produces.
 */

import { drawingSvg } from './ink.js'

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** Editor HTML -> the same HTML with every drawing as an inline SVG. `ink` is
    the colour of a stroke that follows the paper (black, for a printed page). */
export function inlineDrawings(html, { ink = '#000000' } = {}) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  for (const figure of doc.querySelectorAll('figure[data-type="drawing"]')) {
    let strokes = []
    try {
      strokes = JSON.parse(figure.getAttribute('data-strokes') ?? '[]')
    } catch {
      /* an unreadable drawing exports as an empty one */
    }
    const svg = drawingSvg(
      {
        strokes,
        height: Number(figure.getAttribute('data-height')),
        label: figure.getAttribute('data-label') ?? '',
      },
      { ink },
    )
    for (const name of ['data-strokes', 'data-height', 'data-label']) figure.removeAttribute(name)
    figure.innerHTML = svg
  }
  return doc.body.innerHTML
}

// Plain and readable anywhere: no app fonts, nothing to load, nothing to run.
const PAGE_CSS = `
body{margin:0;padding:32px 20px;background:#fff;color:#111;font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:760px;margin:0 auto}
h1.note-title{font-size:28px;margin:0 0 24px}
h1,h2,h3{line-height:1.25}
p{margin:0 0 .7em}
ul,ol{padding-left:1.6em}
ul[data-type="taskList"]{list-style:none;padding-left:.2em}
ul[data-type="taskList"] li{display:flex;gap:.5em}
ul[data-type="taskList"] li>div{flex:1;min-width:0}
blockquote{margin:0 0 .7em;padding-left:1em;border-left:3px solid #c3c2b7;color:#52514e}
code,pre{font-family:ui-monospace,"Cascadia Code",monospace;background:#f2f1ed;border-radius:4px}
code{padding:.1em .3em}pre{padding:.7em .9em;overflow:auto}pre code{padding:0;background:none}
table{border-collapse:collapse;width:100%;margin:0 0 .7em}
th,td{border:1px solid #c3c2b7;padding:.35em .6em;text-align:left;vertical-align:top}
th{background:#f2f1ed}
img,svg{max-width:100%;height:auto}
figure{margin:1em 0}
mark{border-radius:2px;color:inherit}
hr{border:0;border-top:1px solid #c3c2b7;margin:1em 0}
`

/** A complete, self-contained HTML page for a note. */
export function noteToHtmlDocument({ title, html }) {
  const heading = title.trim() || 'Untitled'
  return (
    `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<title>${escapeHtml(heading)}</title>\n<style>${PAGE_CSS}</style>\n</head>\n<body>\n<main>\n` +
    `<h1 class="note-title">${escapeHtml(heading)}</h1>\n${inlineDrawings(html)}\n</main>\n</body>\n</html>\n`
  )
}

/** A note as plain text: its title, an underline, then the body. */
export function noteToText({ title, text }) {
  const heading = title.trim() || 'Untitled'
  return `${heading}\n${'='.repeat(Math.min(heading.length, 72))}\n\n${text.trim()}\n`
}

/** "Trip to Cebu" -> "trip-to-cebu-2026-11-07.html" — safe on every filesystem. */
export function exportFilename(title, extension, now = new Date()) {
  const slug =
    title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/g, '') || 'note'
  const pad = (n) => String(n).padStart(2, '0')
  return `${slug}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.${extension}`
}
