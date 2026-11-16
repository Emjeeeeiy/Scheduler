/* Builds one Cadence MCP server. The HTTP handler makes a fresh one per request
 * (stateless Streamable HTTP — the SDK's documented pattern for serverless,
 * where no instance is guaranteed to see a client's next call), so everything
 * here must be cheap to construct and hold no state of its own.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { DEFAULT_ACCESS, allows } from './config.js'
import { registerResources } from './resources.js'
import { registerTools } from './tools/index.js'

export const SERVER_INFO = { name: 'cadence', version: '0.1.0' }

/** Shown to the model on connect. Short on purpose: it is read on every
    session, and the tool descriptions carry the per-tool detail. What it says
    about changing things follows the access level, so the model is never told
    it can do something its tool list cannot. */
export function instructionsFor(access) {
  const lines = [
    "Cadence is the user's personal planner.",
    '- A task is work to get through (optionally dated, timed, tagged); an event is a commitment on the calendar. A repeating task or event is one rule, shown per day as an occurrence with id "seriesId~YYYY-MM-DD".',
    "- Dates are YYYY-MM-DD and times are 24-hour HH:MM, in the user's own time zone (get_schedule reports it).",
    '- Read before you write: use get_schedule / find_tasks to avoid duplicating an item, and the cadence://tags resource for valid tag names.',
    "- The Journal is the user's private writing. Read a note only when the user asks, and when adding to one, add only what they asked for.",
  ]
  if (allows(access, 'full')) {
    lines.push(
      "- Deleting moves an item to the app's Trash, where the user can restore it; deleting one day of a repeating item only skips that day. Confirm with the user before you delete anything.",
    )
  } else if (allows(access, 'write')) {
    lines.push('- Nothing can be deleted through this connection.')
  } else {
    lines.push('- This connection is read-only: you can look at the schedule and the Journal, but not change anything.')
  }
  return lines.join('\n')
}

/**
 * @param ctx  `{ store, timeZone: string, access?: 'read'|'write'|'full', now?: () => Date }`
 */
export function createCadenceMcpServer(ctx) {
  const context = {
    ...ctx,
    access: ctx.access ?? DEFAULT_ACCESS,
    now: ctx.now ?? (() => new Date()),
  }
  const server = new McpServer(SERVER_INFO, { instructions: instructionsFor(context.access) })
  registerTools(server, context)
  registerResources(server, context)
  return server
}
