/* Who may call /mcp. Two ways in, both a constant-time check against a secret
 * the server holds:
 *
 *   Authorization: Bearer <MCP_API_KEY>      every client that can set a header
 *   /mcp/k/<MCP_URL_KEY>                     only when MCP_URL_KEY is configured,
 *                                            for web clients that cannot
 *
 * The URL form is a capability URL: anyone holding it has full access, and the
 * path is visible to anything that logs request URLs (Vercel's own logs
 * included). That is why it is opt-in, has its own rotatable secret, and is
 * documented as a tradeoff in README-mcp.md.
 *
 * Neither secret is ever logged or echoed in a response.
 */

import { createHash, timingSafeEqual } from 'node:crypto'

/* Both sides are hashed first so timingSafeEqual always gets equal-length
   buffers, and so the comparison time says nothing about the secret's length. */
const digest = (value) => createHash('sha256').update(value).digest()
const safeEqual = (a, b) => timingSafeEqual(digest(a), digest(b))

function bearerToken(req) {
  const header = req.headers?.authorization ?? req.headers?.Authorization
  if (typeof header !== 'string') return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1].trim() : null
}

/** The key carried by the URL: `/mcp/k/<key>` directly (the local dev server,
    or a direct hit), or `?key=<key>` (what vercel.json's rewrite produces). */
function urlKey(req) {
  let url
  try {
    url = new URL(req.url ?? '/', 'http://localhost')
  } catch {
    return null
  }
  const fromPath = /^\/mcp\/k\/([^/]+)\/?$/.exec(url.pathname)
  if (fromPath) {
    try {
      return decodeURIComponent(fromPath[1])
    } catch {
      return null
    }
  }
  return url.searchParams.get('key')
}

/**
 * @return {{ ok: true, via: 'header' | 'url' } | { ok: false }}
 */
export function authenticate(req, config) {
  if (!config.apiKey) return { ok: false }

  const token = bearerToken(req)
  if (token !== null && safeEqual(token, config.apiKey)) return { ok: true, via: 'header' }

  if (config.urlKey) {
    const candidate = urlKey(req)
    if (candidate && safeEqual(candidate, config.urlKey)) return { ok: true, via: 'url' }
  }
  return { ok: false }
}
