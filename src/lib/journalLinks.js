/* What a typed or pasted link is allowed to become.
 *
 * A note is opened by its owner, but notes can be pasted in from anywhere, and a
 * link is the one piece of a note that does something when clicked. So the rule
 * is an allow-list, applied to whatever the scheme turns out to be: http(s),
 * mailto and tel pass; every other scheme — javascript:, data:, vbscript:,
 * file: — is refused outright rather than recognised-as-bad. The editor's own
 * link extension enforces the same list (see extensions/index.js); this is the
 * friendly layer in front of it, turning "example.com" into a real URL and
 * saying why a link was refused instead of silently ignoring it.
 */

export const ALLOWED_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:']

const SCHEME = /^([a-z][a-z0-9+.-]*):/i
const EMAIL = /^[^@\s/:]+@[^@\s/:]+\.[^@\s/:]+$/
const HOST_PORT = /^[^:/\s]+:\d+(\/|$|\?|#)/

/** -> { ok: true, href } or { ok: false, reason } with a reason fit to show. */
export function normalizeLinkUrl(input) {
  const raw = String(input ?? '').trim()
  if (!raw) return { ok: false, reason: 'Enter a web address.' }
  if (/\s/.test(raw)) return { ok: false, reason: 'A link can’t contain spaces.' }

  const scheme = raw.match(SCHEME)
  // "localhost:3000" and "example.com:8080" read as a scheme but are a host and
  // a port — those are web addresses with the scheme left off.
  if (scheme && !HOST_PORT.test(raw)) {
    if (!ALLOWED_SCHEMES.includes(`${scheme[1].toLowerCase()}:`)) {
      return { ok: false, reason: 'Only web, email and phone links are allowed.' }
    }
    return { ok: true, href: raw }
  }

  if (EMAIL.test(raw)) return { ok: true, href: `mailto:${raw}` }
  if (raw.startsWith('//') || raw.startsWith('/') || raw.startsWith('#')) {
    return { ok: false, reason: 'Enter a full web address.' }
  }

  const href = `https://${raw}`
  try {
    // eslint-disable-next-line no-new
    new URL(href)
  } catch {
    return { ok: false, reason: 'That doesn’t look like a web address.' }
  }
  return { ok: true, href }
}
