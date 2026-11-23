/* The sign-in legal copy is data, so its promises can be checked without a
   DOM: every section has real prose, the two documents cover the things this
   app actually does (Firestore storage, Gemini, push, digest, MCP, export and
   deletion), and the one unresolved fact is visibly marked rather than
   quietly invented. */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CONTACT_LINE,
  LAST_UPDATED,
  PRIVACY_SECTIONS,
  TERMS_SECTIONS,
  TERMS_VERSION,
} from '../src/lib/legalContent.js'

const allSections = [...TERMS_SECTIONS, ...PRIVACY_SECTIONS]
const allText = allSections
  .flatMap((section) => [section.heading, ...section.paragraphs])
  .join('\n')
  .toLowerCase()

describe('the legal documents', () => {
  it('carry a date-shaped version and an updated date', () => {
    assert.match(TERMS_VERSION, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(LAST_UPDATED.trim().length > 0)
  })

  it('have complete sections in both documents', () => {
    for (const sections of [TERMS_SECTIONS, PRIVACY_SECTIONS]) {
      assert.ok(sections.length > 0)
      const ids = sections.map((section) => section.id)
      assert.equal(new Set(ids).size, ids.length)
      for (const section of sections) {
        assert.ok(section.heading.trim().length > 0)
        assert.ok(Array.isArray(section.paragraphs) && section.paragraphs.length > 0)
        for (const paragraph of section.paragraphs) {
          assert.ok(typeof paragraph === 'string' && paragraph.trim().length > 40)
        }
      }
    }
  })

  it('say what this build actually does with data', () => {
    for (const word of [
      'firestore',
      'firebase',
      'gemini',
      '8,000',
      'push',
      'sendgrid',
      'mcp',
      'export',
      'delete your account',
      'analytics',
    ]) {
      assert.ok(allText.includes(word), `missing ${word}`)
    }
  })

  it('separates the agreement from the privacy notice', () => {
    assert.ok(TERMS_SECTIONS.some((section) => section.id === 'account'))
    assert.ok(TERMS_SECTIONS.some((section) => section.id === 'ai'))
    assert.ok(PRIVACY_SECTIONS.some((section) => section.id === 'where'))
    assert.ok(PRIVACY_SECTIONS.some((section) => section.id === 'ai-data'))
    assert.ok(PRIVACY_SECTIONS.some((section) => section.id === 'choices'))
  })

  it('has no unfinished prose and uses the published contact address', () => {
    for (const paragraph of allSections.flatMap((section) => section.paragraphs)) {
      assert.doesNotMatch(paragraph, /\b(TODO|FIXME|lorem ipsum)\b/i)
    }
    assert.equal(CONTACT_LINE, 'Questions about these documents: mangamj471@gmail.com.')
    assert.ok(allText.includes(CONTACT_LINE.toLowerCase()))
  })
  it('has a Contact section in both documents', () => {
    for (const sections of [TERMS_SECTIONS, PRIVACY_SECTIONS]) {
      assert.ok(sections.some((section) => section.id === 'contact' && /contact/i.test(section.heading)))
    }
  })
})
