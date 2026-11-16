/* Read-only context an AI client can load without calling a tool.
 *
 *   cadence://tags            the tag list, so create_task's `tag` is never a guess
 *   cadence://day/{date}      one day as a readable sheet: events, tasks, free
 *                             time, and the Journal note written for that day
 */

import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'
import { OUTLINE_MAX } from '@cadence/shared/journal.js'
import { addDays } from '@cadence/shared/date.js'
import { agendaForDays, isRealDay, tagPaths, todayIn } from './schedule.js'

const TAGS_URI = 'cadence://tags'

/** One day as markdown — the form a model reads best, and what the user would
    paste into a chat themselves. Task ids are included so the assistant can
    act on what it just read. */
export function renderDaySheet({ day, timeZone, note, window }) {
  const lines = [`# ${day.weekday} ${day.date}`, `Time zone: ${timeZone}`, '']

  lines.push('## Events')
  if (day.events.length === 0) lines.push('(none)')
  for (const e of day.events) {
    const when = e.allDay ? 'all day' : `${e.start}${e.end ? `–${e.end}` : ''}`
    const span = e.startDate !== e.endDate ? ` (${e.startDate} → ${e.endDate})` : ''
    lines.push(`- ${when} · ${e.title}${span}${e.tag ? ` [${e.tag}]` : ''}`)
  }

  lines.push('', '## Tasks')
  if (day.tasks.length === 0) lines.push('(none)')
  for (const t of day.tasks) {
    const parts = [t.start ?? 'any time', `${t.durationMin} min`, t.title]
    if (t.tag) parts.push(`[${t.tag}]`)
    if (t.priority !== 'normal') parts.push(`(${t.priority})`)
    lines.push(`- [${t.done ? 'x' : ' '}] ${parts.join(' · ')} — id: ${t.id}`)
  }

  lines.push('', `## Free time (${window.start}–${window.end})`)
  if (day.freeWindows.length === 0) lines.push('(none)')
  for (const w of day.freeWindows) lines.push(`- ${w.start}–${w.end} (${w.lengthMin} min)`)

  if (note) {
    lines.push('', `## Journal note: ${note.title || 'Untitled'}`)
    if (!note.readable) lines.push('(This note could not be read.)')
    else if (!note.text) lines.push('(empty)')
    else lines.push(note.text.length >= OUTLINE_MAX ? `${note.text} …(truncated)` : note.text)
  }
  return `${lines.join('\n')}\n`
}

/**
 * @param ctx  `{ store, timeZone, now: () => Date }`
 */
export function registerResources(server, ctx) {
  const clock = () => todayIn(ctx.timeZone, ctx.now())

  server.registerResource(
    'tags',
    TAGS_URI,
    {
      title: 'Tags',
      description: 'Every tag with its full path (e.g. "Work / Deep work"), icon and weekly goal.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const tags = await ctx.store.listTags()
      const paths = tagPaths(tags)
      const body = {
        tags: tags.map((tag) => ({
          id: tag.id,
          name: tag.name,
          path: paths.get(tag.id),
          parentId: tag.parentId,
          icon: tag.icon,
          weeklyGoalHours: tag.goalMinutes === null ? null : Math.round((tag.goalMinutes / 60) * 10) / 10,
        })),
      }
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(body, null, 2) }] }
    },
  )

  server.registerResource(
    'day',
    new ResourceTemplate('cadence://day/{date}', {
      list: async () => {
        const today = clock().key
        return {
          resources: [today, addDays(today, 1)].map((key) => ({
            uri: `cadence://day/${key}`,
            name: `day-${key}`,
            title: key === today ? `Today (${key})` : `Tomorrow (${key})`,
            mimeType: 'text/markdown',
          })),
        }
      },
    }),
    {
      title: 'Day sheet',
      description:
        'One day (cadence://day/YYYY-MM-DD): events, tasks with ids and done state, free time, and the ' +
        'Journal note written for that day.',
      mimeType: 'text/markdown',
    },
    async (uri, variables) => {
      const raw = Array.isArray(variables.date) ? variables.date[0] : variables.date
      if (!isRealDay(raw)) {
        throw new McpError(ErrorCode.InvalidParams, 'The date must be a real day, YYYY-MM-DD.')
      }

      const { key: today, min: nowMin } = clock()
      const [{ tasks, events, tags }, note] = await Promise.all([
        ctx.store.loadSchedule(),
        ctx.store.getDayNote(raw),
      ])
      const dayStartMin = 8 * 60
      const dayEndMin = 20 * 60
      const [day] = agendaForDays({
        tasks,
        events,
        tags,
        startDate: raw,
        days: 1,
        includeDone: true,
        dayStartMin,
        dayEndMin,
        today,
        nowMin,
      })
      const text = renderDaySheet({
        day,
        timeZone: ctx.timeZone,
        note,
        window: { start: '08:00', end: '20:00' },
      })
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] }
    },
  )
}
