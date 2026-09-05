/* POST /api/ai-schedule
 *
 * Backs the command palette's "AI" action (src/components/shell/AiChatModal.jsx):
 * a small chat, not a form. Someone describes what they want in plain
 * language — one or several tasks, in one message or a few back and forth —
 * and this route either creates them directly or asks exactly one follow-up
 * question when the request is too vague to turn into a real task at all.
 *
 * Tasks only, deliberately — no events. Every item is a task, which can
 * honestly stay undated ("sometime, no rush"), so there is never a "cannot
 * invent a date" situation the way there would be for an event (addEvent
 * throws without a startDate — see src/state/ScheduleContext.js). This was
 * the whole reason "ask" existed in an earlier version of this route that
 * also created events; removing events removed most of that need for it,
 * though it stays as a fallback for a request too vague to extract even a
 * task title from.
 *
 * A slice of the account's own recent task history (titles, tags,
 * durations — the same fields enrich-task.js already sends) is included so
 * tagId in particular reflects how this person actually tags things, not
 * just a guess from the tag list's names.
 *
 * Every item that comes back is re-validated against the real tags and real
 * free time this request supplied before ever reaching the client — the
 * same "never trust a model's arithmetic about time" principle
 * src/lib/autoSchedule.js's isValidAiPlan and api/enrich-task.js's own
 * sanitize already apply, just per-item instead of whole-batch: one bad
 * item (an unknown tag, a time that doesn't fit a real slot) is dropped on
 * its own rather than invalidating the whole reply, since these items are
 * independent of each other in a way a single day's plan is not.
 */

import { verifyRequest, AuthError } from './_lib/auth.js'
import { generateJson, GeminiError } from './_lib/gemini.js'

// Started on GEMINI_MODEL_PLAN (gemini-3.5-flash) since this route reasons
// over several items across a week, not just one — the same theory
// enrich-task.js started on before live testing overturned it. Live testing
// overturned it here too, and more decisively: a real 429 showed
// gemini-3.5-flash's free tier caps at 20 requests PER DAY, TOTAL, shared
// with plan-day.js (the only other route still on this model) — a genuinely
// unusable ceiling for anything actively tested, let alone actively used.
// GEMINI_MODEL_FAST has real headroom by comparison. Every item this route
// returns is already re-validated against real tags/free-time regardless of
// which model produced it, so a slightly less clever guess costs nothing a
// stronger one wasn't already being fact-checked against — see sanitizeItem.
const MODEL = process.env.GEMINI_MODEL_FAST ?? 'gemini-3.5-flash-lite'

const MAX_MESSAGES = 12
const MAX_ITEMS = 10
const MAX_QUESTION_LEN = 300
const MAX_NOTES_LEN = 500
// Same cap and same reasoning as enrich-task.js's MAX_HISTORY: enough of
// this account's own tagging pattern to be useful, without letting it
// become the dominant part of the prompt.
const MAX_HISTORY = 15

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ROLES = new Set(['user', 'assistant'])
const PRIORITIES = new Set(['low', 'normal', 'high'])

const SYSTEM_INSTRUCTION = `You turn a short, conversational request into scheduled tasks on someone's real calendar. Every item you create is a TASK — something to get done, tickable off a list. This system has no separate notion of an event; do not treat anything as one.
You are given the conversation so far, today's date, the current time of day, their existing tags, their REAL free time for the next 7 days, and a sample of their own recent tasks with how each was actually tagged and timed.

Decide, for THIS turn only, one of two things:
- status "create": you can make at least one real task from what's been said. Return the items.
- status "ask": the request is too vague to turn into any real task at all — not merely missing a date or time, since a task can honestly stay undated when someone means "sometime, no rush." Ask exactly one short, specific question and return no items.

Per item:
title: short, the thing itself, with date/time words removed.
date: an ISO date (YYYY-MM-DD), already resolved from any relative phrase ("tomorrow", "next Tuesday") against today's date — or null when genuinely undated (nothing about timing was said, or they said something like "sometime" with no day named).
startMin: minutes after local midnight, chosen from that date's real free windows given below, only when a specific time was actually stated or clearly implied — null otherwise.
durationMin: a reasonable length in minutes for the thing itself, or null if you truly cannot guess.
tagId: the id of the single best-fitting tag from the ones offered, or null if none fits. Favor how this person has actually tagged similar tasks before over a guess from the title's wording alone — their recent history is the strongest signal you have for this field specifically. Never invent a tag id.
notes: one short, genuinely useful sentence of context, or null if there is nothing worth adding.
priority: "low", "normal", or "high" — "normal" unless the phrasing clearly signals otherwise.

A single message can describe several tasks — return all of them. Use the whole conversation, not just the latest message: once you have asked a question, the next user message is very likely just the missing answer to it, about the same task(s) discussed before.`

const SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ask', 'create'] },
    question: { type: ['string', 'null'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          date: { type: ['string', 'null'] },
          startMin: { type: ['integer', 'null'] },
          durationMin: { type: ['integer', 'null'] },
          tagId: { type: ['string', 'null'] },
          notes: { type: ['string', 'null'] },
          priority: { type: 'string', enum: ['low', 'normal', 'high'] },
        },
        required: ['title', 'date', 'startMin', 'durationMin', 'tagId', 'notes', 'priority'],
      },
    },
  },
  required: ['status', 'question', 'items'],
}

/** One item's worth of the same untrusted-input treatment every AI response
    gets in this codebase — see normalize.js's stance on anything crossing a
    network boundary. Returns null (dropped, not defaulted) only when the
    item has no usable title at all — everything else here has a safe
    fallback (null date, "normal" priority, etc.), since a task, unlike an
    event, never has a field that must exist for it to be legitimately
    creatable. */
function sanitizeItem(raw, { tags, slotsByDate }) {
  const title = typeof raw?.title === 'string' ? raw.title.trim() : ''
  if (!title) return null

  const date = typeof raw?.date === 'string' && ISO_DATE.test(raw.date) ? raw.date : null

  const durationMin =
    Number.isInteger(raw?.durationMin) && raw.durationMin >= 5 && raw.durationMin <= 24 * 60
      ? raw.durationMin
      : null

  // A start time is only trustworthy alongside a real duration, on a real
  // date, and only when the two together fit ENTIRELY inside one of that
  // date's actual free windows — never trust the model's arithmetic about
  // time, the same rule isValidAiPlan and enrich-task's own sanitize apply.
  let startMin = null
  if (date && Number.isInteger(raw?.startMin) && durationMin) {
    const start = raw.startMin
    const end = start + durationMin
    const daySlots = slotsByDate.get(date) ?? []
    if (daySlots.some((slot) => start >= slot.startMin && end <= slot.endMin)) startMin = start
  }

  const known = new Set(tags.map((tag) => tag.id))
  const tagId = known.has(raw?.tagId) ? raw.tagId : null

  const notes =
    typeof raw?.notes === 'string' && raw.notes.trim() ? raw.notes.trim().slice(0, MAX_NOTES_LEN) : null

  const priority = PRIORITIES.has(raw?.priority) ? raw.priority : 'normal'

  // date/startMin/durationMin/tagId/notes/priority are built field-by-field
  // above rather than spread from `raw` — addTask does not strip a stray
  // deletedAt (ScheduleContext.jsx), so passing model JSON through
  // unfiltered could create a pre-trashed task. This object only ever
  // contains fields this route itself put there.
  return { title, date, startMin, durationMin, tagId, notes, priority }
}

/** Not exported, matching enrich-task.js's own sanitize — every route here
    is tested through its handler with generateJson mocked (see
    tests/apiHandlers.test.jsx), never by calling a sanitizer directly, so
    there is no reason for this to be part of the module's public shape. */
function sanitize(result, { tags, slots }) {
  const safeTags = Array.isArray(tags) ? tags : []
  const slotsByDate = new Map()
  for (const slot of Array.isArray(slots) ? slots : []) {
    if (!slotsByDate.has(slot.date)) slotsByDate.set(slot.date, [])
    slotsByDate.get(slot.date).push(slot)
  }

  const status = result?.status === 'ask' || result?.status === 'create' ? result.status : 'ask'

  if (status === 'ask') {
    const question =
      typeof result?.question === 'string' && result.question.trim()
        ? result.question.trim().slice(0, MAX_QUESTION_LEN)
        : "Sorry, I didn't catch that — could you say more?"
    return { status: 'ask', question, items: [] }
  }

  const items = Array.isArray(result?.items)
    ? result.items
        .map((item) => sanitizeItem(item, { tags: safeTags, slotsByDate }))
        .filter(Boolean)
        .slice(0, MAX_ITEMS)
    : []

  // Nothing survived — the only way a task-shaped item fails sanitizeItem
  // is a missing/blank title, so this means every candidate item had none.
  // Asking is more honest than silently "succeeding" at creating nothing
  // and leaving the person to wonder if it worked.
  if (items.length === 0) {
    return {
      status: 'ask',
      question: "I couldn't pin that down well enough to create — could you be more specific about what and when?",
      items: [],
    }
  }

  return { status: 'create', question: null, items }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' })

  try {
    await verifyRequest(req)

    const { messages, today, nowMin, tags, slots, history } =
      typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {})

    const safeMessages = Array.isArray(messages)
      ? messages
          .filter((m) => ROLES.has(m?.role) && typeof m?.content === 'string' && m.content.trim())
          .slice(-MAX_MESSAGES)
      : []
    if (safeMessages.length === 0) {
      return res.status(400).json({ error: 'messages must include at least one message with content.' })
    }
    if (typeof today !== 'string' || !ISO_DATE.test(today)) {
      return res.status(400).json({ error: 'today must be a YYYY-MM-DD date key.' })
    }

    const safeTags = Array.isArray(tags)
      ? tags.filter((t) => typeof t?.id === 'string' && typeof t?.name === 'string')
      : []
    const safeSlots = Array.isArray(slots)
      ? slots.filter(
          (s) =>
            typeof s?.date === 'string' &&
            ISO_DATE.test(s.date) &&
            Number.isInteger(s?.startMin) &&
            Number.isInteger(s?.endMin) &&
            s.endMin > s.startMin,
        )
      : []

    const slotsByDate = new Map()
    for (const slot of safeSlots) {
      if (!slotsByDate.has(slot.date)) slotsByDate.set(slot.date, [])
      slotsByDate.get(slot.date).push(slot)
    }

    // Titles, tags and durations only — same privacy stance enrich-task.js
    // already takes with this account's own history: notes and checklists
    // never leave the device just to improve a tag/duration guess.
    const safeHistory = Array.isArray(history) ? history.slice(0, MAX_HISTORY) : []

    const prompt = [
      `today: ${today}`,
      `current time: ${Number.isInteger(nowMin) ? `${String(Math.floor(nowMin / 60)).padStart(2, '0')}:${String(nowMin % 60).padStart(2, '0')}` : '(not given)'}`,
      '',
      'available tags:',
      ...(safeTags.length ? safeTags.map((t) => `- id ${JSON.stringify(t.id)}: ${t.name}`) : ['(none created yet)']),
      '',
      'real free time over the next 7 days (minutes since local midnight):',
      ...(slotsByDate.size
        ? [...slotsByDate.entries()].map(
            ([date, daySlots]) => `- ${date}: ${daySlots.map((s) => `${s.startMin}-${s.endMin}`).join(', ')}`,
          )
        : ['(no free time found)']),
      '',
      "recent tasks, most recent first (this person's own patterns):",
      ...(safeHistory.length
        ? safeHistory.map((h) => {
            const bits = [`"${h.title}"`]
            if (h.tagId) bits.push(`tag ${JSON.stringify(h.tagId)}`)
            if (Number.isFinite(h.durationMin)) bits.push(`${h.durationMin} min`)
            if (Number.isFinite(h.startMin)) bits.push(`started at minute ${h.startMin}`)
            return `- ${bits.join(', ')}`
          })
        : ['(no history yet)']),
      '',
      'conversation so far:',
      ...safeMessages.map((m) => `${m.role}: ${m.content.trim()}`),
    ].join('\n')

    const result = await generateJson({
      model: MODEL,
      systemInstruction: SYSTEM_INSTRUCTION,
      prompt,
      schema: SCHEMA,
      // A little under the client's own 30000ms budget (aiClient.js) so a
      // genuine timeout comes back as this route's own clear error instead
      // of the client's fetch aborting first with nothing to say why — the
      // same margin every other route here keeps. Bumped from an original
      // 18000/20000 pairing after live testing under vercel dev showed the
      // client aborting at almost exactly its own ceiling rather than
      // receiving this route's shorter internal timeout first — the same
      // local cold-start overhead (JWKS fetch, function cold start) already
      // seen adding real latency on top of Gemini's own response time for
      // every other route in this app.
      timeoutMs: 27000,
    })

    return res.status(200).json(sanitize(result, { tags: safeTags, slots: safeSlots }))
  } catch (caught) {
    if (caught instanceof AuthError) return res.status(caught.status).json({ error: caught.message })
    if (caught instanceof GeminiError) return res.status(caught.status).json({ error: caught.message })
    console.error('ai-schedule failed', caught)
    return res.status(500).json({ error: 'Internal error.' })
  }
}
