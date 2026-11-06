/* Getting a note out of the Journal, and shrinking images on the way in. */

import { describe, expect, it } from 'vitest'
import { buildStroke } from '../src/lib/ink.js'
import { exportFilename, inlineDrawings, noteToHtmlDocument, noteToText } from '../src/lib/journalExport.js'
import { NOTE_IMAGE_MAX_CHARS, fitWithin } from '../src/lib/image.js'

const points = [
  { x: 10, y: 10 },
  { x: 200, y: 40 },
  { x: 400, y: 20 },
  { x: 600, y: 90 },
]

const stroke = (color) => buildStroke({ tool: 'pen', color, size: 6, points })

const figure = (strokes, { height = 300, label = 'A map' } = {}) =>
  `<figure data-type="drawing" data-strokes='${JSON.stringify(strokes)}' data-height="${height}" data-label="${label}"></figure>`

const parse = (html) => new DOMParser().parseFromString(html, 'text/html')

describe('inlineDrawings', () => {
  it('replaces a drawing figure with a real SVG a browser can draw', () => {
    const out = inlineDrawings(`<p>before</p>${figure([stroke('#1971c2')])}<p>after</p>`)
    const svg = parse(out).querySelector('figure svg')
    expect(svg).not.toBeNull()
    expect(svg.getAttribute('aria-label')).toBe('A map')
    expect(svg.querySelectorAll('path').length).toBe(1)
    expect(svg.querySelector('path').getAttribute('fill')).toBe('#1971c2')
  })

  it('keeps the text around a drawing', () => {
    const doc = parse(inlineDrawings(`<p>before</p>${figure([stroke('#1971c2')])}<p>after</p>`))
    expect([...doc.querySelectorAll('p')].map((p) => p.textContent)).toEqual(['before', 'after'])
  })

  it('removes the editor-only data attributes from the figure', () => {
    const out = inlineDrawings(figure([stroke('#1971c2')]))
    expect(out).not.toContain('data-strokes')
    expect(out).not.toContain('data-height')
  })

  it('uses the given ink for strokes that follow the paper', () => {
    const out = inlineDrawings(figure([stroke(null)]), { ink: '#222222' })
    expect(out).toContain('fill="#222222"')
  })

  it('exports an unreadable drawing as an empty one instead of failing', () => {
    const broken = '<figure data-type="drawing" data-strokes="{not json" data-height="200"></figure>'
    const svg = parse(inlineDrawings(broken)).querySelector('figure svg')
    expect(svg).not.toBeNull()
    expect(svg.querySelectorAll('path')).toHaveLength(0)
  })

  it('leaves text without drawings as it was', () => {
    expect(inlineDrawings('<p>just <strong>text</strong></p>')).toBe('<p>just <strong>text</strong></p>')
  })
})

describe('noteToHtmlDocument', () => {
  it('is a complete page with the title as heading and tab name', () => {
    const page = noteToHtmlDocument({ title: 'Trip to Cebu', html: '<p>hello</p>' })
    expect(page.startsWith('<!doctype html>')).toBe(true)
    expect(page).toContain('<title>Trip to Cebu</title>')
    expect(page).toContain('<h1 class="note-title">Trip to Cebu</h1>')
    expect(page).toContain('<p>hello</p>')
  })

  it('escapes a title that contains markup', () => {
    const page = noteToHtmlDocument({ title: '<script>alert(1)</script> & "q"', html: '<p>x</p>' })
    expect(page).not.toContain('<script>')
    expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot;')
  })

  it('falls back to Untitled', () => {
    expect(noteToHtmlDocument({ title: '   ', html: '' })).toContain('<title>Untitled</title>')
  })

  it('carries no script and loads nothing from the network', () => {
    const page = noteToHtmlDocument({ title: 'x', html: figure([stroke('#1971c2')]) })
    expect(page).not.toMatch(/<script/i)
    expect(page.replaceAll('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:\/\//)
  })
})

describe('noteToText', () => {
  it('puts the title, an underline of its length, then the text', () => {
    expect(noteToText({ title: 'Plan', text: 'one\n\ntwo\n' })).toBe('Plan\n====\n\none\n\ntwo\n')
  })

  it('falls back to Untitled', () => {
    expect(noteToText({ title: '', text: 'x' })).toBe('Untitled\n========\n\nx\n')
  })

  it('caps the underline for a very long title', () => {
    const long = 'a'.repeat(200)
    expect(noteToText({ title: long, text: 'x' }).split('\n')[1]).toHaveLength(72)
  })
})

describe('exportFilename', () => {
  const day = new Date(2026, 10, 7)

  it('makes a safe slug with the date', () => {
    expect(exportFilename('Trip to Cebu', 'html', day)).toBe('trip-to-cebu-2026-11-07.html')
  })

  it('strips accents and characters a filesystem would reject', () => {
    expect(exportFilename('Café: 50% / plan?', 'txt', day)).toBe('cafe-50-plan-2026-11-07.txt')
  })

  it('falls back to "note" when nothing usable is left', () => {
    expect(exportFilename('   ', 'txt', day)).toBe('note-2026-11-07.txt')
    expect(exportFilename('日本語', 'txt', day)).toBe('note-2026-11-07.txt')
  })

  it('bounds the length', () => {
    expect(exportFilename('word '.repeat(40), 'txt', day).length).toBeLessThan(80)
  })
})

describe('fitWithin', () => {
  it('shrinks the longer side to the limit, keeping the proportions', () => {
    expect(fitWithin(4000, 2000, 1000)).toEqual({ width: 1000, height: 500 })
    expect(fitWithin(1500, 3000, 1500)).toEqual({ width: 750, height: 1500 })
  })

  it('never enlarges a small image', () => {
    expect(fitWithin(320, 200, 1400)).toEqual({ width: 320, height: 200 })
  })

  it('never returns a zero side', () => {
    expect(fitWithin(5000, 1, 100)).toEqual({ width: 100, height: 1 })
  })

  it('keeps the per-image budget well under the note limit, so several images fit', () => {
    expect(NOTE_IMAGE_MAX_CHARS).toBeLessThan(950_000 / 2)
  })
})
