/* POST /api/note-tasks
 *
 * Backs the Journal's "Plan it": someone wrote freely in a note — "I should call
 * Ana tomorrow afternoon, and get the 2-hour workout in" — and pressed one
 * explicit button. This reads that text and returns the things the writer
 * actually means to do, as `{ title, date, startMin, durationMin }` (every field
 * but the title null when not stated) — parse-task's own shape, so the caller
 * places them with the same machinery either source feeds.
 *
 * This is the one route that is sent what someone WROTE rather than the title of
 * a task, so it is held to the same rules as the others and a few more:
 *   - only on a button press, never in the background (src/lib/aiClient.js);
 *   - plain text only — the client sends the note as lines (noteOutline in
 *     packages/shared), never an image or a drawing — and capped at
 *     CAPS.noteText, so a long note is read to a line and not billed in full;
 *   - nothing the model says is trusted: every field is rebuilt below, and the
 *     client then places it into free time itself (placeNoteTasks), so the model
 *     is never asked to do the arithmetic.
 */

import { verifyRequest } from './_lib/auth.js'
import { generateJson } from './_lib/gemini.js'
import { ApiError, readJsonBody, route } from './_lib/pushRoute.js'
import { enforceAiLimits } from './_lib/rateLimit.js'
import { CAPS, ISO_DATE, readText } from './_lib/aiInput.js'
import { NOTE_PLAN_LIMIT } from '@cadence/shared/autoSchedule.js'
import { addDays, fromKey, toKey } from '@cadence/shared/date.js'

const MODEL = process.env.GEMINI_MODEL_FAST ?? 'gemini-3.5-flash-lite'

const TITLE_MAX = 120
/* "Next year" is as far ahead as someone writing in a journal means; past it a
   date is far likelier a misreading than a plan. */
const HORIZON_DAYS = 365

const SYSTEM_INSTRUCTION = `You read a person's private journal note and pick out the things they actually intend to do.
The note is given as plain lines. "[ ] " marks an unchecked checklist item and "- " a bullet; most lines are ordinary writing.
Return only concrete actions the writer means to take: "call Ana", "send the report", "2-hour workout". Do not return reflections, feelings, things already done or in the past tense, vague wishes ("be healthier"), or things other people are going to do.
Keep the writer's own wording for each title, short and without the date or time words. Never invent a task that is not in the note, and never combine two into one.
"day" is the day the note belongs to and "today" is the real date; resolve every relative date ("tomorrow", "Friday", "next week") against "day". date must be an ISO date YYYY-MM-DD, or null if no day was stated or implied.
startMin is minutes after local midnight (0-1439), or null if no time of day was stated. durationMin is the length in minutes, or null if none was stated.
Never guess a field you are not reasonably confident about: null is the honest answer far more often than a wrong guess is a helpful one.
Return at most ${NOTE_PLAN_LIMIT} tasks, in the order they appear. An empty list is the right answer when the note holds nothing to do.`

const SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          date: { type: ['string', 'null'] },
          startMin: { type: ['integer', 'null'] },
          durationMin: { type: ['integer', 'null'] },
        },
        required: ['title', 'date', 'startMin', 'durationMin'],
      },
    },
  },
  required: ['tasks'],
}

/** The right shape is not enough for a date: "2026-13-45" has it. A real day
    survives being read and written back unchanged. */
const isRealDay = (key) => ISO_DATE.test(key) && toKey(fromKey(key)) === key

/** Everything here came out of the model, so none of it is used as given. Each
    task is rebuilt field by field — never spread — so nothing the model added
    (a `deletedAt`, say) can ride along into a write, and anything out of range
    becomes null rather than reaching the plan looking legitimate. */
function sanitize(result, { today }) {
  const horizon = addDays(today, HORIZON_DAYS)
  const seen = new Set()
  const tasks = []

  for (const raw of Array.isArray(result?.tasks) ? result.tasks : []) {
    if (tasks.length >= NOTE_PLAN_LIMIT) break
    const title = readText(raw?.title, TITLE_MAX)
    if (!title) continue
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const date = typeof raw.date === 'string' && isRealDay(raw.date) && raw.date >= today && raw.date <= horizon ? raw.date : null
    // Unlike parse-task, a time with no date is kept: in a note it means "that
    // time, on the note's day".
    const startMin = Number.isInteger(raw.startMin) && raw.startMin >= 0 && raw.startMin <= 1439 ? raw.startMin : null
    const durationMin =
      Number.isInteger(raw.durationMin) && raw.durationMin >= 5 && raw.durationMin <= 12 * 60 ? raw.durationMin : null
    tasks.push({ title, date, startMin, durationMin })
  }
  return { tasks }
}

export default route('note-tasks', ['POST'], async (req, res) => {
  const uid = await verifyRequest(req)
  const body = readJsonBody(req)

  for (const field of ['day', 'today']) {
    if (typeof body[field] !== 'string' || !isRealDay(body[field])) {
      throw new ApiError(400, `${field} must be a YYYY-MM-DD date key.`)
    }
  }

  // Nothing to read is a complete answer, and costs nothing.
  const text = readText(body.text, CAPS.noteText)
  if (!text) return res.status(200).json({ tasks: [] })

  await enforceAiLimits('noteTasks', uid)

  const prompt = `day: ${body.day}\ntoday: ${body.today}\nnote: ${JSON.stringify(text)}`

  const result = await generateJson({
    model: MODEL,
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    schema: SCHEMA,
    // A little under notePlanAi's 16000ms client budget, the convention every
    // route here follows.
    timeoutMs: 14000,
  })

  return res.status(200).json(sanitize(result, { today: body.today }))
})
