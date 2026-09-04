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

import { verifyRequest, AuthError } from './_lib/auth.js'
import { generateJson, GeminiError } from './_lib/gemini.js'

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' })

  try {
    await verifyRequest(req)

    const { title, tags } = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {})
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title is required.' })
    }
    if (!Array.isArray(tags) || tags.length === 0) {
      // Nothing to file under — same as "no suggestion," not an error.
      return res.status(200).json({ tagId: null })
    }

    const prompt = [
      `Task title: ${JSON.stringify(title.trim())}`,
      'Available tags:',
      ...tags.map((tag) => `- id ${JSON.stringify(tag.id)}: ${tag.name}`),
    ].join('\n')

    const result = await generateJson({
      model: MODEL,
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt,
      schema: SCHEMA,
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
  } catch (caught) {
    if (caught instanceof AuthError) return res.status(caught.status).json({ error: caught.message })
    if (caught instanceof GeminiError) return res.status(caught.status).json({ error: caught.message })
    console.error('suggest-tag failed', caught)
    return res.status(500).json({ error: 'Internal error.' })
  }
}
