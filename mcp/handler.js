/* The HTTP side of /mcp, written against plain Node (req, res) — only
 * res.statusCode / setHeader / end — so the same function runs under Vercel
 * (api/mcp.js), under the local dev server (scripts/mcp-dev.mjs) and under a
 * bare http.createServer in tests.
 *
 * Order matters, and each step can end the request:
 *   1. CORS headers go on EVERY response, including errors — a browser client
 *      cannot read a 401 that lacks them, and would report a network failure.
 *   2. OPTIONS preflight -> 204. Never needs auth (browsers send none).
 *   3. Anything but POST -> 405. Stateless mode has no SSE stream to offer, and
 *      the spec lets a server say so.
 *   4. Authenticate -> 401. Before the database, the limiter, or the SDK.
 *   5. Not configured -> 500 (generic; the reasons are logged, never sent).
 *   6. Rate limit -> 429.
 *   7. A fresh McpServer + transport for this one request.
 */

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { authenticate } from './auth.js'
import { readMcpConfig } from './config.js'
import { applyCors } from './cors.js'
import { createCadenceMcpServer } from './server.js'

const PARSE_ERROR = -32700
const SERVER_ERROR = -32000

function reply(res, status, message, { code = SERVER_ERROR, headers = {} } = {}) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value)
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }))
}

/** The parsed JSON body Vercel (or the dev server) already read, if any.
    `undefined` means "not read yet" and lets the transport read the stream. */
function parsedBody(req) {
  const raw = req.body
  if (raw === undefined || raw === null) return { body: undefined }
  if (typeof raw === 'string' || Buffer.isBuffer(raw)) {
    try {
      return { body: JSON.parse(raw.toString('utf8')) }
    } catch {
      return { error: true }
    }
  }
  return { body: raw }
}

/**
 * @param env          process.env, or a stand-in in tests
 * @param createStore  `(config) => store` — the real Admin-SDK store in production
 * @param limit        `(uid) => Promise<void>`, throws an error with status 429 when spent
 * @param now          `() => Date`, for tests
 */
export function createMcpHandler({ env = process.env, createStore, limit = async () => {}, now }) {
  let warned = false

  return async function mcpHandler(req, res) {
    const config = readMcpConfig(env)
    // Logged once per instance, whether or not it turns the endpoint off: a bad
    // time zone, an unknown MCP_ACCESS or a weak URL key leave it running but
    // not as configured, and the log is the only place that is ever said.
    if (config.problems.length > 0 && !warned) {
      warned = true
      const off = config.ready ? '' : ' The endpoint stays off until this is fixed.'
      console.warn(`MCP configuration: ${config.problems.join(' ')}${off}`)
    }

    applyCors(req, res, config.allowedOrigins)
    // Responses carry private schedule data and per-request auth results.
    res.setHeader('Cache-Control', 'no-store')

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      return res.end()
    }
    if (req.method !== 'POST') {
      return reply(res, 405, 'Method not allowed — send MCP requests with POST.', {
        headers: { Allow: 'POST, OPTIONS' },
      })
    }

    if (!authenticate(req, config).ok) {
      return reply(res, 401, 'Unauthorized.', {
        headers: { 'WWW-Authenticate': 'Bearer realm="cadence-mcp"' },
      })
    }
    if (!config.ready) return reply(res, 500, 'The MCP server is not configured.')

    try {
      await limit(config.uid)
    } catch (caught) {
      if (caught?.status === 429) {
        return reply(res, 429, 'Too many requests — try again later.', {
          headers: { 'Retry-After': '60' },
        })
      }
      console.error('mcp: rate limiter failed', caught)
      return reply(res, 500, 'Internal error.')
    }

    const { body, error } = parsedBody(req)
    if (error) return reply(res, 400, 'Body must be JSON.', { code: PARSE_ERROR })

    let server
    let transport
    try {
      server = createCadenceMcpServer({
        store: createStore(config),
        timeZone: config.timeZone,
        access: config.access,
        now,
      })
      transport = new StreamableHTTPServerTransport({
        // Stateless: no session id, no state kept between calls.
        sessionIdGenerator: undefined,
        // Plain JSON responses rather than an SSE stream — nothing here is
        // long-running, and a serverless function should answer and finish.
        enableJsonResponse: true,
      })
      res.on('close', () => {
        transport.close().catch(() => {})
        server.close().catch(() => {})
      })
      await server.connect(transport)
      await transport.handleRequest(req, res, body)
    } catch (caught) {
      console.error('mcp: request failed', caught)
      if (!res.headersSent) reply(res, 500, 'Internal error.')
    }
  }
}
