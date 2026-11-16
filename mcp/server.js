/* Builds one Cadence MCP server. The HTTP handler makes a fresh one per request
 * (stateless Streamable HTTP — the SDK's documented pattern for serverless,
 * where no instance is guaranteed to see a client's next call), so everything
 * here must be cheap to construct and hold no state of its own.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerResources } from './resources.js'
import { registerTools } from './tools.js'

export const SERVER_INFO = { name: 'cadence', version: '0.1.0' }

// Shown to the model on connect. Short on purpose: it is read on every
// session, and the tool descriptions carry the per-tool detail.
const INSTRUCTIONS = `Cadence is the user's personal planner.
- A task is work to get through (optionally dated, timed, tagged); an event is a commitment on the calendar. A repeating task is one rule, shown per day as an occurrence with id "seriesId~YYYY-MM-DD".
- Dates are YYYY-MM-DD and times are 24-hour HH:MM, in the user's own time zone (get_schedule reports it).
- Read before you write: use get_schedule / find_tasks to avoid duplicating a task, and the cadence://tags resource for valid tag names.
- Nothing can be deleted through this server.`

/**
 * @param ctx  `{ store, timeZone: string, now?: () => Date }`
 */
export function createCadenceMcpServer(ctx) {
  const context = { ...ctx, now: ctx.now ?? (() => new Date()) }
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS })
  registerTools(server, context)
  registerResources(server, context)
  return server
}
