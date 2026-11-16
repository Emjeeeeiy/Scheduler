/* POST /mcp  (also /mcp/k/<key>, and /api/mcp directly)
 *
 * A Model Context Protocol server over Streamable HTTP, so an AI client — Claude,
 * ChatGPT, Cursor, Gemini CLI — can read and update this account's schedule by
 * URL. Everything of substance lives in mcp/; this file only wires the real
 * Firestore store and the shared rate limiter into the handler.
 *
 * Unlike the other /api routes it does NOT use verifyRequest: its caller is an
 * AI client holding a shared secret (MCP_API_KEY), not a signed-in browser with a
 * Firebase ID token. See README-mcp.md.
 */

import { createAdminStore } from '../mcp/firestore.js'
import { createMcpHandler } from '../mcp/handler.js'
import { enforceLimit } from './_lib/rateLimit.js'

export default createMcpHandler({
  createStore: createAdminStore,
  limit: (uid) => enforceLimit('mcp', uid),
})
