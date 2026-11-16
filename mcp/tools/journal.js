/* Journal tools: find and read notes, create one, add to one, and (at full
 * access) move one to the Trash.
 *
 * A note is private writing. Reading is allowed because the account's owner
 * connected this server, but the server instructions and the descriptions below
 * tell the assistant to read notes only when asked. Editing is deliberately
 * narrow: create a note, or add text to the END of one. Nothing here rewrites or
 * removes text inside a note. */

import { matchesQuery, noteDisplayTitle } from '@cadence/shared/journal.js'
import { z } from 'zod'
import { allows } from '../config.js'
import { McpToolError } from '../errors.js'
import { ADDS, DELETES, READ_ONLY, date, guarded, isoOrNull } from './shared.js'

const NOTE_ID = z.string().trim().min(1).max(128)
const NOTE_TEXT_HELP =
  'Plain text. Supported formatting: "# Heading" (levels 1-3), "- item" bullets, "- [ ] item" and ' +
  '"- [x] item" checklist items; any other line is a paragraph. Nothing else is formatted.'

/** Exactly one way to name a note: its id, or the day it was written for. */
function pickNote({ noteId, date: day }) {
  if (noteId && day) throw new McpToolError('Give either noteId or date, not both.')
  if (!noteId && !day) throw new McpToolError('Give noteId (from find_journal_notes) or date.')
  return noteId ? { id: noteId } : { dayKey: day }
}

/**
 * @param ctx  `{ store, timeZone, access, now: () => Date }`
 */
export function registerJournalTools(server, ctx) {
  server.registerTool(
    'find_journal_notes',
    {
      title: 'Find journal notes',
      description:
        "List or search the user's Journal notes (private writing; only look when the user asks). Matches " +
        'every word of the query against titles and the start of each note. Returns ids, titles, the ' +
        'day each note belongs to, and a short excerpt — use read_journal_note for the full text.',
      inputSchema: {
        query: z.string().trim().max(200).optional().describe('Words that must all appear (any order, any case).'),
        from: date.optional().describe('Only notes written for this day or later, YYYY-MM-DD.'),
        to: date.optional().describe('Only notes written for this day or earlier, YYYY-MM-DD.'),
        limit: z.number().int().min(1).max(50).default(20),
      },
      annotations: READ_ONLY,
    },
    guarded('find_journal_notes', async (args) => {
      if (args.from && args.to && args.from > args.to) throw new McpToolError('from is later than to.')
      const limit = args.limit ?? 20
      const notes = (await ctx.store.listNotes()).filter(
        (note) =>
          matchesQuery(note, args.query) &&
          (!args.from || (note.dayKey !== null && note.dayKey >= args.from)) &&
          (!args.to || (note.dayKey !== null && note.dayKey <= args.to)),
      )
      return {
        total: notes.length,
        truncated: notes.length > limit,
        notes: notes.slice(0, limit).map((note) => ({
          id: note.id,
          title: noteDisplayTitle(note),
          date: note.dayKey,
          excerpt: note.excerpt.slice(0, 200),
          pinned: note.pinned,
          edited: isoOrNull(note.updatedAt),
        })),
      }
    }),
  )

  server.registerTool(
    'read_journal_note',
    {
      title: 'Read journal note',
      description:
        "Read one Journal note's text, by id (from find_journal_notes) or by the day it was written for. " +
        'Private writing — only read a note when the user asks. Returns the text as plain text with the ' +
        'same formatting rules create_journal_note accepts (ticked checklist items included).',
      inputSchema: {
        noteId: NOTE_ID.optional().describe('A note id from find_journal_notes.'),
        date: date.optional().describe("Read the note written for this day, YYYY-MM-DD."),
      },
      annotations: READ_ONLY,
    },
    guarded('read_journal_note', async (args) => {
      const note = await ctx.store.getNote(pickNote(args))
      return {
        id: note.id,
        title: noteDisplayTitle(note),
        date: note.dayKey,
        pinned: note.pinned,
        hasDrawing: note.hasDrawing,
        edited: isoOrNull(note.updatedAt),
        readable: note.readable,
        truncated: note.truncated,
        text: note.text,
        ...(note.readable ? {} : { message: "This note's text is in a form this version of Cadence cannot read." }),
      }
    }),
  )

  if (allows(ctx.access, 'write')) {
    server.registerTool(
      'create_journal_note',
      {
        title: 'Create journal note',
        description:
          'Create a NEW Journal note. Give a title and, optionally, its text. If you give date it becomes ' +
          "that day's note (shown on that day in the app); a day that already has a note is refused — use " +
          `append_to_journal_note instead. ${NOTE_TEXT_HELP}`,
        inputSchema: {
          title: z.string().trim().max(200).optional().describe('A title. Defaults to the day for a day note.'),
          text: z.string().max(20_000).optional().describe(`The note's text. ${NOTE_TEXT_HELP}`),
          date: date.optional().describe('Make this the note for that day, YYYY-MM-DD. Omit for a general note.'),
        },
        annotations: ADDS,
      },
      guarded('create_journal_note', async (args) => {
        const created = await ctx.store.createNote({
          title: args.title ?? '',
          text: args.text ?? '',
          dayKey: args.date ?? null,
        })
        return { id: created.id, title: noteDisplayTitle({ title: created.title }), date: created.dayKey }
      }),
    )

    server.registerTool(
      'append_to_journal_note',
      {
        title: 'Add to journal note',
        description:
          'Add text to the END of an existing Journal note, found by noteId or by date. Everything already ' +
          'in the note is kept exactly as it was; nothing is edited or removed. Use create_journal_note for ' +
          `a new note. ${NOTE_TEXT_HELP}`,
        inputSchema: {
          noteId: NOTE_ID.optional().describe('A note id from find_journal_notes.'),
          date: date.optional().describe('Add to the note written for this day, YYYY-MM-DD.'),
          text: z.string().min(1).max(20_000).describe(`The text to add. ${NOTE_TEXT_HELP}`),
        },
        annotations: ADDS,
      },
      guarded('append_to_journal_note', async (args) => {
        const target = pickNote(args)
        const added = await ctx.store.appendToNote({ id: target.id, dayKey: target.dayKey, text: args.text })
        return {
          id: added.id,
          title: noteDisplayTitle({ title: added.title }),
          date: added.dayKey,
          message: 'Added to the end of the note.',
        }
      }),
    )
  }

  if (allows(ctx.access, 'full')) {
    server.registerTool(
      'delete_journal_note',
      {
        title: 'Delete journal note',
        description:
          "Delete a whole Journal note. It moves to the Journal's Trash and can be restored there; it is " +
          'never permanently erased. Confirm with the user before deleting. Safe to repeat.',
        inputSchema: {
          noteId: NOTE_ID.describe('A note id from find_journal_notes.'),
        },
        annotations: DELETES,
      },
      guarded('delete_journal_note', async (args) => {
        const result = await ctx.store.trashNote(args.noteId)
        return {
          ...result,
          message: result.changed
            ? 'Moved the note to the Journal Trash. It can be restored from there in Cadence.'
            : 'It was already in the Trash. Nothing changed.',
        }
      }),
    )
  }
}
