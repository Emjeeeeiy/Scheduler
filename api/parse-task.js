/* POST /api/parse-task
 *
 * Backs the command palette's explicit "Parse with AI" action — never a
 * per-keystroke call (see the client wiring in App.jsx/CommandPalette.jsx
 * for why: this runs in a box that re-filters on every keystroke, and a
 * network round trip there would make a fast UI feel slow). Someone typed
 * a sentence src/lib/parseQuickAdd.js's regex rules found no date/time in,
 * clicked one explicit button, and is waiting for exactly this one answer.
 *
 * Response shape mirrors parseQuickAdd's own return value on purpose —
 * `{ title, date, startMin, durationMin }`, each field null when not
 * confidently found — so the client can treat both sources identically.
 */

import { verifyRequest, AuthError } from './_lib/auth.js'
import { generateJson, GeminiError } from './_lib/gemini.js'

const MODEL = process.env.GEMINI_MODEL_FAST ?? 'gemini-3.5-flash-lite'

const SYSTEM_INSTRUCTION = `You turn a short, informally typed sentence into a calendar task.
"today" is the date given to you as the reference point — resolve every relative date ("tomorrow", "next Tuesday", "in 3 days") against it.
date must be an ISO calendar date in the exact form YYYY-MM-DD, or null if no day was stated or implied.
startMin is the number of minutes after local midnight (0-1439), or null if no time of day was stated.
durationMin is the task's length in minutes, or null if no length was stated or impliable from a stated time range.
title is the task itself with the date/time words removed, keeping the person's original wording and capitalisation — never invent a title from nothing.
Never guess a field you are not reasonably confident about; null is the honest answer far more often than a wrong guess is a helpful one.`

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    date: { type: ['string', 'null'] },
    startMin: { type: ['integer', 'null'] },
    durationMin: { type: ['integer', 'null'] },
  },
  required: ['title', 'date', 'startMin', 'durationMin'],
}

// One pattern for both checks below — the request's own `today` and
// whatever date the model hands back must be the identical shape.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Every field here came out of the model, so none of it is trusted until
    it's re-checked against the same shape parseQuickAdd's own output
    already has to satisfy — see normalize.js's stance on any data crossing
    a network boundary. A malformed date or an out-of-range minute becomes
    null rather than reaching the create form looking legitimate. */
function sanitize(result) {
  const title = typeof result?.title === 'string' ? result.title.trim() : ''
  const date = typeof result?.date === 'string' && ISO_DATE.test(result.date) ? result.date : null
  const startMin =
    Number.isInteger(result?.startMin) && result.startMin >= 0 && result.startMin <= 1439
      ? result.startMin
      : null
  const durationMin =
    Number.isInteger(result?.durationMin) && result.durationMin > 0 && result.durationMin <= 24 * 60
      ? result.durationMin
      : null
  // A start time with no date to belong to is meaningless — the same rule
  // normalizeTask enforces for every task in this app.
  return { title, date, startMin: date ? startMin : null, durationMin }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' })

  try {
    await verifyRequest(req)

    const { text, today } = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {})
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'text is required.' })
    }
    if (typeof today !== 'string' || !ISO_DATE.test(today)) {
      return res.status(400).json({ error: 'today must be a YYYY-MM-DD date key.' })
    }

    const prompt = `today: ${today}\nsentence: ${JSON.stringify(text.trim())}`

    const result = await generateJson({
      model: MODEL,
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt,
      schema: SCHEMA,
      // Matches (with a little margin) parseTaskAi's own 12000ms client
      // budget — generateJson's 8000ms default was never actually enough
      // room for that, a latent mismatch that happened not to matter until
      // a slow response actually occurred. See enrich-task.js's identical
      // fix for the full reasoning.
      timeoutMs: 11000,
    })

    return res.status(200).json(sanitize(result))
  } catch (caught) {
    if (caught instanceof AuthError) return res.status(caught.status).json({ error: caught.message })
    if (caught instanceof GeminiError) return res.status(caught.status).json({ error: caught.message })
    console.error('parse-task failed', caught)
    return res.status(500).json({ error: 'Internal error.' })
  }
}
