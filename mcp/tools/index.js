/* Registers the tools an AI client may use, gated by MCP_ACCESS:
 *
 *   read   get_schedule, find_tasks, find_journal_notes, read_journal_note        (4)
 *   write  + create_task, set_task_done, create_event,
 *            create_journal_note, append_to_journal_note                           (9)
 *   full   + delete_task, delete_event, delete_journal_note                       (12)
 *
 * A tool above the configured level is never registered, so the client's model
 * does not see it, cannot be talked into calling it, and a "tools/call" for it
 * is answered as an unknown tool. Every delete is a move to the app's Trash. */

import { registerEventTools } from './events.js'
import { registerJournalTools } from './journal.js'
import { registerTaskTools } from './tasks.js'

/**
 * @param ctx  `{ store, timeZone, access, now: () => Date }`
 */
export function registerTools(server, ctx) {
  registerTaskTools(server, ctx)
  registerEventTools(server, ctx)
  registerJournalTools(server, ctx)
}
