/* Schedule tools: read the calendar and the task list, add a task, tick one off,
 * and (at full access) delete one. */

import { addDays } from '@cadence/shared/date.js'
import { z } from 'zod'
import { allows } from '../config.js'
import { McpToolError } from '../errors.js'
import {
  agendaForDays,
  findTasks,
  formatTime,
  parseTime,
  resolveTag,
  tagPaths,
  taskView,
  todayIn,
} from '../schedule.js'
import { ADDS, CHANGES, DELETES, READ_ONLY, date, describeDelete, guarded, time } from './shared.js'

/**
 * @param ctx  `{ store, timeZone, access, now: () => Date }`
 */
export function registerTaskTools(server, ctx) {
  const clock = () => todayIn(ctx.timeZone, ctx.now())

  server.registerTool(
    'get_schedule',
    {
      title: 'Get schedule',
      description:
        "Read the user's calendar for one day or a range: each day's events, tasks (with done state) " +
        "and free time windows. Repeating tasks and events appear as that day's occurrence; its `id` " +
        '(seriesId~date) is what set_task_done, delete_task and delete_event need. Use this for ' +
        '"what\'s on today/this week" and "when am I free".',
      inputSchema: {
        startDate: date
          .optional()
          .describe("First day, YYYY-MM-DD. Defaults to today in the user's time zone."),
        days: z.number().int().min(1).max(31).default(1).describe('How many days to return, from startDate.'),
        includeDone: z.boolean().default(true).describe('Include tasks that are already done.'),
        dayStart: time.default('08:00').describe('Earliest time to offer as free, HH:MM.'),
        dayEnd: time.default('20:00').describe('Latest time to offer as free, HH:MM.'),
      },
      annotations: READ_ONLY,
    },
    guarded('get_schedule', async (args) => {
      const dayStartMin = parseTime(args.dayStart ?? '08:00')
      const dayEndMin = parseTime(args.dayEnd ?? '20:00')
      if (dayEndMin <= dayStartMin) throw new McpToolError('dayEnd must be later than dayStart.')

      const { key: today, min: nowMin } = clock()
      const startDate = args.startDate ?? today
      const days = args.days ?? 1
      const { tasks, events, tags } = await ctx.store.loadSchedule()

      return {
        timeZone: ctx.timeZone,
        today,
        now: formatTime(nowMin),
        from: startDate,
        to: addDays(startDate, days - 1),
        days: agendaForDays({
          tasks,
          events,
          tags,
          startDate,
          days,
          includeDone: args.includeDone ?? true,
          dayStartMin,
          dayEndMin,
          today,
          nowMin,
        }),
      }
    }),
  )

  server.registerTool(
    'find_tasks',
    {
      title: 'Find tasks',
      description:
        'List or search tasks. view: "upcoming" = the next 14 days (repeats expanded), "overdue" = open ' +
        'tasks whose day has passed, "inbox" = tasks with no date yet, "all" = every task (repeating ' +
        'tasks appear once, as the rule). Open tasks only unless includeDone is true.',
      inputSchema: {
        view: z.enum(['upcoming', 'overdue', 'inbox', 'all']).default('upcoming'),
        query: z
          .string()
          .trim()
          .max(200)
          .optional()
          .describe('Words that must all appear in the title or notes (any order, any case).'),
        tag: z
          .string()
          .trim()
          .max(200)
          .optional()
          .describe('Tag name, "Parent / Child" path or id. Includes tags filed beneath it.'),
        includeDone: z.boolean().default(false),
        limit: z.number().int().min(1).max(100).default(25),
      },
      annotations: READ_ONLY,
    },
    guarded('find_tasks', async (args) => {
      const { key: today } = clock()
      const { tasks, tags } = await ctx.store.loadSchedule()
      const found = findTasks({
        tasks,
        tags,
        today,
        view: args.view ?? 'upcoming',
        query: args.query,
        tag: args.tag,
        includeDone: args.includeDone ?? false,
        limit: args.limit ?? 25,
      })
      if (found.error) throw new McpToolError(found.error)
      return { view: args.view ?? 'upcoming', today, ...found }
    }),
  )

  if (allows(ctx.access, 'write')) {
    server.registerTool(
      'create_task',
      {
        title: 'Create task',
        description:
          'Add a task. With no date it goes to the inbox to be scheduled later. With a date it lands on that ' +
          'day; add startTime to give it a time block. Always creates a new task — it never edits or merges ' +
          'with an existing one, so check find_tasks first to avoid duplicates. The tag must already exist.',
        inputSchema: {
          title: z.string().trim().min(1).max(200),
          notes: z.string().max(5000).optional(),
          date: date.optional().describe('Day to do it, YYYY-MM-DD. Omit for the inbox.'),
          startTime: time.optional().describe('Start time HH:MM. Requires date.'),
          durationMin: z
            .number()
            .int()
            .min(5)
            .max(1440)
            .optional()
            .describe('Length in minutes. Defaults to 30.'),
          priority: z.enum(['low', 'normal', 'high']).optional(),
          tag: z
            .string()
            .trim()
            .max(200)
            .optional()
            .describe('An existing tag: name, "Parent / Child" path or id (see the cadence://tags resource).'),
        },
        annotations: ADDS,
      },
      guarded('create_task', async (args) => {
        if (args.startTime && !args.date) {
          throw new McpToolError(
            'startTime needs a date. Pass date too, or leave both out to put the task in the inbox.',
          )
        }
        const tags = await ctx.store.listTags()
        let tagId = null
        if (args.tag) {
          const resolved = resolveTag(args.tag, tags)
          if (resolved.error) throw new McpToolError(resolved.error)
          tagId = resolved.tag.id
        }

        const created = await ctx.store.addTask({
          title: args.title,
          notes: args.notes ?? '',
          date: args.date ?? null,
          startMin: args.startTime ? parseTime(args.startTime) : null,
          durationMin: args.durationMin,
          priority: args.priority,
          tagId,
        })
        return { id: created.id, task: taskView(created, tagPaths(tags)) }
      }),
    )

    server.registerTool(
      'set_task_done',
      {
        title: 'Mark task done',
        description:
          'Mark a task done, or reopen it with done:false. Safe to repeat. For a repeating task pass the ' +
          'occurrence id for one day (seriesId~YYYY-MM-DD) exactly as get_schedule reports it; the series ' +
          'rule itself has no done state. Reports changed:false if it was already in that state.',
        inputSchema: {
          taskId: z.string().trim().min(1).max(160).describe('A task id, or seriesId~YYYY-MM-DD for one repeat.'),
          done: z.boolean().default(true),
        },
        annotations: CHANGES,
      },
      guarded('set_task_done', async (args) => ctx.store.setTaskDone(args.taskId, args.done ?? true)),
    )
  }

  if (allows(ctx.access, 'full')) {
    server.registerTool(
      'delete_task',
      {
        title: 'Delete task',
        description:
          "Delete a task. It moves to Cadence's Trash and can be restored there; it is never permanently " +
          'erased. For one day of a repeating task pass that day\'s occurrence id (seriesId~YYYY-MM-DD) to ' +
          'skip only that day; the plain id of a repeating task moves the WHOLE series to the Trash. ' +
          'Confirm with the user before deleting. Safe to repeat.',
        inputSchema: {
          taskId: z.string().trim().min(1).max(160).describe('A task id, or seriesId~YYYY-MM-DD for one repeat.'),
        },
        annotations: DELETES,
      },
      guarded('delete_task', async (args) => describeDelete(await ctx.store.deleteTask(args.taskId))),
    )
  }
}
