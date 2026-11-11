/* POST /api/suggest-tag
 *
 * Called only when src/lib/suggestTag.js's own heuristic already came back
 * empty — a fresh account, or a title with no word history yet. Gemini
 * gets a task title and the account's real tag list, and answers with
 * which tag (if any) fits, or says it isn't confident. The heuristic model
 * stays the fast, offline, free path; this is strictly an enhancement on
 * top of it — see the client wiring in TaskEditor.jsx for how the two
 * combine and what happens when this route is unreachable.
 */

import { verifyRequest } from './_lib/auth.js'
import { generateJson } from './_lib/gemini.js'
import { ApiError, readJsonBody, route } from './_lib/pushRoute.js'
import { enforceAiLimits } from './_lib/rateLimit.js'
import { CAPS, readTags, readText } from './_lib/aiInput.js'

const MODEL = process.env.GEMINI_MODEL_FAST ?? 'gemini-3.5-flash-lite'

const SYSTEM_INSTRUCTION = `You file a single task title under one of a person's own existing tags.
Only ever choose from the tag ids you are given — never invent one.
If the title is too generic or ambiguous to confidently belong to one specific tag over the others, say so rather than guessing.`

const SCHEMA = {
  type: 'object',
  properties: {
    tagId: {
      type: ['string', 'null'],
      description: 'The id of the best-fitting tag, or null if none confidently fits.',
    },
  },
  required: ['tagId'],
}

export default route('suggest-tag', ['POST'], async (req, res) => {
  const uid = await verifyRequest(req)
  const body = readJsonBody(req)

  const title = readText(body.title, CAPS.title)
  if (!title) throw new ApiError(400, 'title is required.')
  const tags = readTags(body.tags)
  if (tags.length === 0) {
    // Nothing to file under — same as "no suggestion," not an error.
    return res.status(200).json({ tagId: null })
  }

  await enforceAiLimits('suggestTag', uid)

  const prompt = [
    `Task title: ${JSON.stringify(title)}`,
    'Available tags:',
    ...tags.map((tag) => `- id ${JSON.stringify(tag.id)}: ${JSON.stringify(tag.name)}`),
  ].join('\n')

  const result = await generateJson({
    model: MODEL,
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    schema: SCHEMA,
    // Was relying on generateJson's 8000ms default exactly equalling
    // suggestTagAi's own 8000ms client budget — a dead heat, not a real
    // margin. Given a fair margin like the other three routes now have;
    // see enrich-task.js for the full reasoning.
    timeoutMs: 7000,
  })

  // The one rule the client CANNOT be trusted to skip re-checking on its
  // own: never hand back a tagId the caller didn't offer. Gemini is asked
  // not to invent one, but the response is still untrusted input, exactly
  // like anything else this app reads off the network — see
  // normalize.js's own stance on Firestore documents for the same
  // principle applied elsewhere in this codebase.
  const known = new Set(tags.map((tag) => tag.id))
  const tagId = known.has(result?.tagId) ? result.tagId : null

  return res.status(200).json({ tagId })
})
