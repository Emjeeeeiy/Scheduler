/* What every tool file shares: input schemas, the result envelope, and the
 * wrapper that keeps an unexpected failure from reaching a client as raw text.
 *
 * Results go back twice — as `structuredContent` for clients that read it, and
 * as JSON text for the many that only read `content` (the MCP spec asks for
 * both). A known failure (McpToolError) becomes a normal tool error the model
 * can read and recover from; anything else is logged here and answered
 * generically, because what a database says about itself can carry project ids
 * and paths.
 */

import { z } from 'zod'
import { McpToolError } from '../errors.js'

/** A real calendar day. zod's own check rejects 2026-02-31 and shows up as
    `format: date` in the JSON Schema the client's model reads. */
export const date = z.iso.date()

export const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM, for example "09:30".')

export const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data })
export const fail = (message) => ({ isError: true, content: [{ type: 'text', text: message }] })

/** Wraps a handler so no thrown error ever reaches the client as raw text. */
export function guarded(name, handler) {
  return async (args) => {
    try {
      return ok(await handler(args))
    } catch (caught) {
      if (caught instanceof McpToolError) return fail(caught.message)
      console.error(`mcp tool ${name} failed`, caught)
      return fail('Something went wrong reading or writing your data. Try again in a moment.')
    }
  }
}

/* Annotations are hints a client uses to decide whether to ask the person first,
   so they have to be honest: a delete is destructive even though the app can
   restore it, because the client cannot know that. */
export const READ_ONLY = { readOnlyHint: true, openWorldHint: false }
export const ADDS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
export const CHANGES = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
export const DELETES = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }

const DELETE_MESSAGES = {
  'moved-to-trash': 'Moved to the Trash. It can be restored from the Trash in Cadence.',
  'skipped-day': 'Skipped this one day. The rest of the series is unchanged.',
  'already-in-trash': 'It was already in the Trash. Nothing changed.',
  'already-gone': 'That day was already skipped or moved. Nothing changed.',
}

/** A task or event delete's result for the model: what happened, and — because a
    delete is the one thing a person may regret — where it can be undone. */
export function describeDelete({ outcome, repeats, ...rest }) {
  return {
    ...rest,
    outcome,
    message:
      outcome === 'moved-to-trash' && repeats
        ? 'Moved the whole repeating series to the Trash. It can be restored from the Trash in Cadence.'
        : DELETE_MESSAGES[outcome],
  }
}

/** A timestamp as an ISO string, or null for one too large to be a real date. */
export function isoOrNull(ms) {
  const at = new Date(ms)
  return Number.isFinite(at.getTime()) ? at.toISOString() : null
}
