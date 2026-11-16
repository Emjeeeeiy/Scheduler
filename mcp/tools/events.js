/* Event tools: add a one-off event, and (at full access) delete one.
 *
 * Events are commitments on the calendar, not work to get through: no done
 * state, and they never count in stats. Reading them is get_schedule's job. */

import { z } from 'zod'
import { allows } from '../config.js'
import { McpToolError } from '../errors.js'
import { eventView, parseTime, resolveTag, tagPaths } from '../schedule.js'
import { ADDS, DELETES, date, describeDelete, guarded, time } from './shared.js'

/**
 * @param ctx  `{ store, timeZone, access, now: () => Date }`
 */
export function registerEventTools(server, ctx) {
  if (allows(ctx.access, 'write')) {
    server.registerTool(
      'create_event',
      {
        title: 'Create event',
        description:
          'Add an event to the calendar: a commitment such as a meeting or trip, not a task. One day by ' +
          'default; give endDate for one that runs across several days. With no startTime it is all-day. ' +
          'endTime only applies to a one-day event with a startTime. Always creates a new event, so check ' +
          'get_schedule first to avoid duplicates. The tag must already exist.',
        inputSchema: {
          title: z.string().trim().min(1).max(200),
          startDate: date.describe('First (or only) day, YYYY-MM-DD.'),
          endDate: date.optional().describe('Last day, for an event across several days. Omit for one day.'),
          startTime: time.optional().describe('Start time HH:MM. Omit for an all-day event.'),
          endTime: time.optional().describe('End time HH:MM. Needs startTime; one-day events only.'),
          notes: z.string().max(5000).optional(),
          tag: z
            .string()
            .trim()
            .max(200)
            .optional()
            .describe('An existing tag: name, "Parent / Child" path or id (see the cadence://tags resource).'),
        },
        annotations: ADDS,
      },
      guarded('create_event', async (args) => {
        const endDate = args.endDate ?? args.startDate
        if (endDate < args.startDate) throw new McpToolError('endDate is before startDate.')
        const multiDay = endDate > args.startDate

        if (args.endTime && !args.startTime) throw new McpToolError('endTime needs a startTime.')
        if (args.endTime && multiDay) {
          throw new McpToolError(
            'An end time only means something within a single day. Leave endTime out of an event that spans several days.',
          )
        }
        const startMin = parseTime(args.startTime)
        const endMin = parseTime(args.endTime)
        if (startMin !== null && endMin !== null && endMin <= startMin) {
          throw new McpToolError('endTime must be later than startTime.')
        }

        const tags = await ctx.store.listTags()
        let tagId = null
        if (args.tag) {
          const resolved = resolveTag(args.tag, tags)
          if (resolved.error) throw new McpToolError(resolved.error)
          tagId = resolved.tag.id
        }

        const created = await ctx.store.addEvent({
          title: args.title,
          notes: args.notes ?? '',
          startDate: args.startDate,
          endDate,
          startMin,
          endMin,
          tagId,
        })
        return { id: created.id, event: eventView(created, tagPaths(tags)) }
      }),
    )
  }

  if (allows(ctx.access, 'full')) {
    server.registerTool(
      'delete_event',
      {
        title: 'Delete event',
        description:
          "Delete an event. It moves to Cadence's Trash and can be restored there; it is never permanently " +
          "erased. For one day of a repeating event pass that day's occurrence id (seriesId~YYYY-MM-DD) to " +
          'skip only that day; the plain id of a repeating event moves the WHOLE series to the Trash. ' +
          'Confirm with the user before deleting. Safe to repeat.',
        inputSchema: {
          eventId: z.string().trim().min(1).max(160).describe('An event id, or seriesId~YYYY-MM-DD for one repeat.'),
        },
        annotations: DELETES,
      },
      guarded('delete_event', async (args) => describeDelete(await ctx.store.deleteEvent(args.eventId))),
    )
  }
}
