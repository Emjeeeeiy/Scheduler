import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizeLinkUrl } from '../src/lib/journalLinks.js'

const ok = (input) => {
  const result = normalizeLinkUrl(input)
  assert.equal(result.ok, true, `${input} should be accepted: ${result.reason}`)
  return result.href
}
const refused = (input) => {
  const result = normalizeLinkUrl(input)
  assert.equal(result.ok, false, `${input} should be refused`)
  assert.ok(result.reason, 'a refusal always says why')
}

describe('normalizeLinkUrl', () => {
  it('adds https:// to a bare address', () => {
    assert.equal(ok('example.com'), 'https://example.com')
    assert.equal(ok('  www.example.com/path?q=1  '), 'https://www.example.com/path?q=1')
  })

  it('keeps an allowed scheme as typed', () => {
    assert.equal(ok('https://example.com'), 'https://example.com')
    assert.equal(ok('http://example.com'), 'http://example.com')
    assert.equal(ok('HTTPS://Example.com'), 'HTTPS://Example.com')
    assert.equal(ok('mailto:ana@example.com'), 'mailto:ana@example.com')
    assert.equal(ok('tel:+639171234567'), 'tel:+639171234567')
  })

  it('turns a bare email address into a mailto link', () => {
    assert.equal(ok('ana@example.com'), 'mailto:ana@example.com')
  })

  it('reads host:port as a web address, not as a scheme', () => {
    assert.equal(ok('localhost:3000'), 'https://localhost:3000')
    assert.equal(ok('example.com:8080/app'), 'https://example.com:8080/app')
  })

  it('refuses every scheme outside the allow-list, however it is cased or padded', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      '  javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'ftp://example.com',
      'blob:https://example.com/x',
      'chrome://settings',
    ]) {
      refused(bad)
    }
  })

  it('refuses empty input, spaces and non-addresses', () => {
    for (const bad of ['', '   ', null, undefined, 'two words', '/relative/path', '#anchor', '//cdn.example.com/x']) {
      refused(bad)
    }
  })

  it('does not let a scheme hide behind whitespace or control characters', () => {
    refused('java script:alert(1)')
    refused('javascript\t:alert(1)')
    refused('javascript\n:alert(1)')
  })
})
