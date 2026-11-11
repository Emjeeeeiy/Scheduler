/* POST /api/enrich-task
 *
 * Backs TaskEditor's unified AI enrichment: given just a title (plus the
 * account's tags, today's real free time, and a slice of recent history),
 * suggest a time, a tag, a checklist and notes together in one call — the
 * single-field routes (/api/suggest-tag, /api/parse-task) each answered one
 * narrow question; this one reasons over the whole form the way a person
 * filling it in would. See src/components/editors/TaskEditor.jsx for how
 * the result is offered (a review panel, never applied silently) and
 * src/lib/autoSchedule.js's isValidAiPlan for the "never trust a model's
 * arithmetic about time" principle this route applies to its own startMin.
 */

import { verifyRequest } from './_lib/auth.js'
import { generateJson } from './_lib/gemini.js'
import { ApiError, readJsonBody, route } from './_lib/pushRoute.js'
import { enforceAiLimits } from './_lib/rateLimit.js'
import { CAPS, ISO_DATE, readHistory, readSlots, readTags, readText } from './_lib/aiInput.js'

// Started on GEMINI_MODEL_PLAN (the reasoning-tier model plan-day.js also
// uses) on the theory that this call reasons rather than just classifies.
// Live testing said otherwise: this is one task, not a whole day of them,
// and the multi-second-plus latency was the actual, reported problem — a
// debounced "while you type a title" suggestion has to feel fast far more
// than it has to be clever. GEMINI_MODEL_FAST trades a little reasoning
// depth for real latency, which is the right trade here: every field it
// returns is already validated (or discarded) server-side and re-checked
// against live data before ever being applied, so a slightly weaker guess
// costs nothing a stronger one wasn't already being fact-checked against.
const MODEL = process.env.GEMINI_MODEL_FAST ?? 'gemini-3.5-flash-lite'

// The form fields the client may say it already filled in.
const FILLABLE = ['tagId', 'durationMin', 'startMin', 'subtasks', 'notes']

const MAX_SUBTASKS = 8
const MAX_SUBTASK_LEN = 100
const MAX_NOTES_LEN = 500


const SYSTEM_INSTRUCTION = `You help fill in the rest of a task someone is creating, from just its title, their own recent task history, and today's real free time.
Some fields already have a value the person chose themselves — the request tells you which. Still return your best answer for those too (it will be ignored), but never let "it's already set" make you guess wildly for the fields that are NOT already set — give an honest best guess, or null/empty when you truly have none.
tagId: the id of the single best-fitting tag from the ones offered, or null if none confidently fits or none exist. Never invent a tag id.
durationMin: how long this specific task will likely take in minutes, based on similar tasks in the history if any exist, or a reasonable generic guess otherwise. Null only if you truly cannot guess.
startMin: minutes after local midnight for a good time to do this today, chosen from the free windows given, considering when similar tasks were done before. Null if nothing in the free windows fits well, or there are no free windows.
subtasks: up to 5 short, concrete checklist steps for this task, in the order they'd be done. An empty array is correct when the task is already a single simple action that doesn't benefit from being broken down — never pad with trivial or generic steps.
notes: one short, genuinely useful sentence of context or a tip specific to this task, or null if there is nothing worth adding — never generic filler like "get started" or "stay focused".`

const SCHEMA = {
  type: 'object',
  properties: {
    tagId: { type: ['string', 'null'] },
    durationMin: { type: ['integer', 'null'] },
    startMin: { type: ['integer', 'null'] },
    subtasks: { type: 'array', items: { type: 'string' } },
    notes: { type: ['string', 'null'] },
  },
  required: ['tagId', 'durationMin', 'startMin', 'subtasks', 'notes'],
}

/** Every field here came out of the model, so none of it is trusted until
    re-checked against the same real data the request itself supplied — see
    normalize.js's stance on any data crossing a network boundary, and
    isValidAiPlan's stance on a model's arithmetic about time specifically. */
function sanitize(result, { tags, slots }) {
  const known = new Set(tags.map((tag) => tag.id))
  const tagId = known.has(result?.tagId) ? result.tagId : null

  const durationMin =
    Number.isInteger(result?.durationMin) && result.durationMin >= 5 && result.durationMin <= 24 * 60
      ? result.durationMin
      : null

  // A start time is only trustworthy alongside a real duration, and only
  // when the two together fit ENTIRELY inside one of the real free windows
  // this request supplied — never trust the model's arithmetic about time,
  // the same rule isValidAiPlan already applies to /api/plan-day.
  let startMin = null
  if (Number.isInteger(result?.startMin) && durationMin) {
    const start = result.startMin
    const end = start + durationMin
    if (slots.some((slot) => start >= slot.startMin && end <= slot.endMin)) startMin = start
  }

  const subtasks = Array.isArray(result?.subtasks)
    ? result.subtasks
        .filter((item) => typeof item === 'string' && item.trim())
        .slice(0, MAX_SUBTASKS)
        .map((item) => item.trim().slice(0, MAX_SUBTASK_LEN))
    : []

  const notes =
    typeof result?.notes === 'string' && result.notes.trim() ? result.notes.trim().slice(0, MAX_NOTES_LEN) : null

  return { tagId, durationMin, startMin, subtasks, notes }
}

export default route('enrich-task', ['POST'], async (req, res) => {
  const uid = await verifyRequest(req)
  const body = readJsonBody(req)

  const title = readText(body.title, CAPS.title)
  if (!title) throw new ApiError(400, 'title is required.')
  if (typeof body.today !== 'string' || !ISO_DATE.test(body.today)) {
    throw new ApiError(400, 'today must be a YYYY-MM-DD date key.')
  }

  const safeTags = readTags(body.tags)
  const safeSlots = readSlots(body.slots)
  const safeHistory = readHistory(body.history)
  // Purely descriptive text for the prompt — telling Gemini which fields
  // not to bother re-suggesting. Only the five known field names are ever
  // echoed into the prompt. The client re-checks emptiness itself before
  // ever applying anything, so this being briefly stale costs nothing beyond
  // a wasted suggestion for that one field.
  const filled = body.filled && typeof body.filled === 'object' ? body.filled : {}
  const filledKeys = FILLABLE.filter((key) => filled[key] === true)

  await enforceAiLimits('enrichTask', uid)

  const prompt = [
    `today: ${body.today}`,
    `task title: ${JSON.stringify(title)}`,
    `already set, do not re-suggest: ${filledKeys.length ? filledKeys.join(', ') : '(nothing yet)'}`,
    '',
    'available tags:',
    ...(safeTags.length
      ? safeTags.map((t) => `- id ${JSON.stringify(t.id)}: ${JSON.stringify(t.name)}`)
      : ['(none created yet)']),
    '',
    "today's free time windows (minutes since local midnight):",
    ...(safeSlots.length ? safeSlots.map((s) => `- ${s.startMin}-${s.endMin}`) : ['(none left today)']),
    '',
    "recent tasks, most recent first (this person's own patterns):",
    ...(safeHistory.length
      ? safeHistory.map((h) => {
          const bits = [JSON.stringify(h.title)]
          if (h.tagId) bits.push(`tag ${JSON.stringify(h.tagId)}`)
          if (Number.isFinite(h.durationMin)) bits.push(`${h.durationMin} min`)
          if (Number.isFinite(h.startMin)) bits.push(`started at minute ${h.startMin}`)
          return `- ${bits.join(', ')}`
        })
      : ['(no history yet)']),
  ].join('\n')

  const result = await generateJson({
    model: MODEL,
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    schema: SCHEMA,
    // Matches (with a little margin) parse-task.js's own budget now that
    // both share GEMINI_MODEL_FAST — this route still sends more content
    // than that one (history + tags + slots, not just one sentence), so
    // it keeps a bit more room, but a debounced while-you-type suggestion
    // has no business waiting anywhere near as long as it used to.
    timeoutMs: 10000,
  })

  return res.status(200).json(sanitize(result, { tags: safeTags, slots: safeSlots }))
})
