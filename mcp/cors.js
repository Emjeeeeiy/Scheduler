/* CORS for /mcp, so a browser-based client (claude.ai, ChatGPT, an Inspector
 * running in a tab) is not stopped by a failed preflight.
 *
 * Credentials are deliberately NOT allowed (no Access-Control-Allow-Credentials):
 * authentication here is a bearer header or a secret URL, never a cookie, so a
 * wildcard origin cannot be used to ride a signed-in browser session. With
 * MCP_ALLOWED_ORIGINS set, only those origins get an Allow-Origin at all.
 */

const ALLOW_METHODS = 'GET, POST, DELETE, OPTIONS'

// What an MCP Streamable HTTP client may send. Mcp-Protocol-Version and
// Mcp-Session-Id are the spec's own headers; without them in this list a
// browser client's preflight fails on the second request of a session.
const ALLOW_HEADERS =
  'Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID'

// Without this, browser code cannot read the session id or the auth challenge.
const EXPOSE_HEADERS = 'Mcp-Session-Id, WWW-Authenticate'

const DAY_SECONDS = 86_400

export function applyCors(req, res, allowedOrigins = ['*']) {
  const origin = req.headers?.origin

  if (allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*')
  } else if (typeof origin === 'string' && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    // The answer now depends on the request's Origin, so caches must key on it.
    res.setHeader('Vary', 'Origin')
  }

  res.setHeader('Access-Control-Allow-Methods', ALLOW_METHODS)
  res.setHeader('Access-Control-Allow-Headers', ALLOW_HEADERS)
  res.setHeader('Access-Control-Expose-Headers', EXPOSE_HEADERS)
  res.setHeader('Access-Control-Max-Age', String(DAY_SECONDS))
}
