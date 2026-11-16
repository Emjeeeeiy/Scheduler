/* Runs the /mcp endpoint locally, without `vercel dev`, so the official MCP
 * Inspector (or curl) can talk to it:
 *
 *   npm run mcp:dev            # reads .env.local, listens on :8787
 *   npx @modelcontextprotocol/inspector
 *
 * It serves the SAME handler Vercel does (mcp/handler.js). The only thing this
 * file adds is what the platform normally does for a function: read and parse
 * the JSON body, and route /mcp and /mcp/k/<key> to it.
 *
 * Talks to your REAL Firestore project (via FIREBASE_SERVICE_ACCOUNT), as the
 * account MCP_USER_UID — a task created through it appears in the running app.
 * Binds to 127.0.0.1 only.
 */

import { createServer } from 'node:http'
import { createAdminStore } from '../mcp/firestore.js'
import { createMcpHandler } from '../mcp/handler.js'

const PORT = Number(process.env.MCP_DEV_PORT) || 8787
const MAX_BODY_BYTES = 1_000_000

const handler = createMcpHandler({ createStore: createAdminStore })

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Body too large.'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost')
  if (pathname !== '/mcp' && !pathname.startsWith('/mcp/k/')) {
    res.statusCode = 404
    return res.end('Not found. The MCP endpoint is /mcp.\n')
  }

  if (req.method === 'POST') {
    try {
      // Left as a string: the handler parses it and answers 400 if it isn't JSON.
      req.body = await readBody(req)
    } catch {
      res.statusCode = 413
      return res.end('Body too large.\n')
    }
  }
  return handler(req, res)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Cadence MCP dev server: http://localhost:${PORT}/mcp`)
  console.log('Authenticate with:  Authorization: Bearer <MCP_API_KEY from .env.local>')
})
