/* POST /api/ai-schedule
 *
 * Backs the command palette's "AI" action (src/components/shell/AiChatModal.jsx):
 * a small chat, not a form. Someone describes what they want in plain
 * language — create, change, or remove one or several tasks, in one message
 * or a few back and forth — and this route either acts directly or asks
 * exactly one follow-up question when the request is too vague to act on at
 * all, or refers to a task ambiguously (more than one real task plausibly
 * matches and there is no honest way to tell which).
 *
 * Tasks only, deliberately — no events. Every item is a task, which can
 * honestly stay undated ("sometime, no rush"), so creating one never hits a
 * "cannot invent a date" situation the way an event would (addEvent throws
 * without a startDate — see src/state/ScheduleContext.js).
 *
 * A slice of the account's own recent task history (titles, tags,
 * durations — the same fields enrich-task.js already sends) is included so
 * tagId in particular reflects how this person actually tags things, not
 * just a guess from the tag list's names. A separate list of the account's
 * current OPEN tasks (with real ids) is also included so an update/remove
 * has something real to target — the model may never invent a task id.
 *
 * Every item that comes back is re-validated against the real tags, real
 * free time, and real open tasks this request supplied before ever reaching
 * the client — the same "never trust a model's arithmetic about time"
 * principle src/lib/autoSchedule.js's isValidAiPlan and api/enrich-task.js's
 * own sanitize already apply, just per-item instead of whole-batch: one bad
 * item (an unknown tag, a time that doesn't fit a real slot, an id that
 * isn't a real open task) is dropped on its own rather than invalidating
 * the whole reply, since these items are independent of each other in a
 * way a single day's plan is not.
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
// returns is already re-validated against real tags/free-time/open-tasks
// regardless of which model produced it, so a slightly less clever guess
// costs nothing a stronger one wasn't already being fact-checked against.
const MODEL = process.env.GEMINI_MODEL_FAST ?? 'gemini-3.5-flash-lite'

const MAX_MESSAGES = 12
const MAX_ITEMS = 10
const MAX_QUESTION_LEN = 300
const MAX_NOTES_LEN = 500
// Same cap and same reasoning as enrich-task.js's MAX_HISTORY: enough of
// this account's own tagging pattern to be useful, without letting it
// become the dominant part of the prompt.
const MAX_HISTORY = 15
// How many of the account's current open tasks are offered as real
// update/remove targets. Generous relative to MAX_HISTORY (which is about
// a *pattern*, not a lookup table) since a task genuinely missing from this
// list is one "cancel the dentist thing" can never reach.
const MAX_EXISTING = 40

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ROLES = new Set(['user', 'assistant'])
const PRIORITIES = new Set(['low', 'normal', 'high'])

const SYSTEM_INSTRUCTION = `You manage someone's real task list from a short, conversational request. Every item is a TASK — something to get done, tickable off a list. This system has no separate notion of an event; do not treat anything as one.
You are given: the conversation so far, today's date, the current time of day, their existing tags, their REAL free time for the next 7 days, a sample of their own recent tasks with how each was actually tagged and timed (to learn their patterns from), and their current OPEN tasks, each with a real id, which you may update or remove.

Decide, for THIS turn only, one of two things:
- status "act": you have enough to create, update, or remove at least one task. Return the items.
- status "ask": the request is too vague to act on — not merely missing a date or time, since a task can honestly stay undated when someone means "sometime, no rush" — or it refers to an existing task ambiguously (more than one open task plausibly matches and you cannot honestly tell which they mean). Ask exactly one short, specific question and return no items.

Per item, action is exactly one of:
- "create": a brand-new task. taskId must be null.
- "update": change an EXISTING task. taskId must be the real id of one of the current open tasks given to you — never invent one. Set ONLY the fields that are actually changing; leave every other field null, meaning "leave it as it is."
- "remove": delete an EXISTING task entirely. taskId must be a real id from the current open tasks. Every other field should be null.

To find which existing task someone means, match on title and, if given, day or time, against the current open tasks list. If it's genuinely ambiguous, ask rather than guess.

Per item's other fields — for "create" they describe the new task; for "update" only the ones actually changing are non-null; for "remove" all of them are null:
title: short, the thing itself, with date/time words removed.
date: an ISO date (YYYY-MM-DD), already resolved from any relative phrase ("tomorrow", "next Tuesday") against today's date — null when genuinely undated, or when not being changed.
startMin: minutes after local midnight, chosen from that date's real free windows given below, only when a specific time was actually stated or clearly implied — null otherwise, or when not being changed.
durationMin: a reasonable length in minutes for the thing itself, or null if you truly cannot guess, or it isn't changing.
tagId: the id of the single best-fitting tag from the ones offered, or null if none fits or it isn't changing. Favor how this person has actually tagged similar tasks before over a guess from the title's wording alone. Never invent a tag id.
notes: one short, genuinely useful sentence of context, or null if there is nothing worth adding, or it isn't changing.
priority: "low", "normal", or "high" for a genuinely new or changing priority — null otherwise. Defaults to "normal" for a brand-new task if you have no reason to pick otherwise.

A single message can describe several actions at once — return all of them. Use the whole conversation, not just the latest message: once you have asked a question, the next user message is very likely just the missing answer to it, about the same item(s) discussed before.`

const SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ask', 'act'] },
    question: { type: ['string', 'null'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'update', 'remove'] },
          taskId: { type: ['string', 'null'] },
          title: { type: ['string', 'null'] },
          date: { type: ['string', 'null'] },
          startMin: { type: ['integer', 'null'] },
          durationMin: { type: ['integer', 'null'] },
          tagId: { type: ['string', 'null'] },
          notes: { type: ['string', 'null'] },
          // Not a schema-level enum (unlike the original create-only
          // version of this route) — it has to allow null too now ("not
          // changing" on an update), and Gemini's structured output
          // handles a plain nullable string more reliably than mixing
          // enum with null. The three real values are still enforced by
          // sanitizePriority below regardless of what the schema allows.
          priority: { type: ['string', 'null'] },
        },
        required: ['action', 'taskId', 'title', 'date', 'startMin', 'durationMin', 'tagId', 'notes', 'priority'],
      },
    },
  },
  required: ['status', 'question', 'items'],
}

function sanitizeDate(raw) {
  return typeof raw === 'string' && ISO_DATE.test(raw) ? raw : null
}

function sanitizeDuration(raw) {
  return Number.isInteger(raw) && raw >= 5 && raw <= 24 * 60 ? raw : null
}

/** A start time is only trustworthy alongside a real duration, on a real
    date, and only when the two together fit ENTIRELY inside one of that
    date's actual free windows — never trust the model's arithmetic about
    time, the same rule isValidAiPlan and enrich-task's own sanitize apply.
    Note this checks against free time that already treats the task's OWN
    current slot (for an update) as busy — moving a task to a time that
    overlaps where it already sits can therefore be rejected even though
    it's actually fine. A known limitation, not a silent miscalculation. */
function sanitizeStart(raw, date, durationMin, slotsByDate) {
  if (!date || !Number.isInteger(raw) || !durationMin) return null
  const end = raw + durationMin
  const daySlots = slotsByDate.get(date) ?? []
  return daySlots.some((slot) => raw >= slot.startMin && end <= slot.endMin) ? raw : null
}

function sanitizeTagId(raw, knownTagIds) {
  return knownTagIds.has(raw) ? raw : null
}

function sanitizeNotes(raw) {
  return typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, MAX_NOTES_LEN) : null
}

function sanitizePriority(raw) {
  return PRIORITIES.has(raw) ? raw : null
}

/** A brand-new task — the only action where a missing title means there is
    nothing legitimately creatable at all; every other field here has a
    safe fallback (null date, "normal" priority, etc). */
function sanitizeCreate(raw, ctx) {
  const title = typeof raw?.title === 'string' ? raw.title.trim() : ''
  if (!title) return null

  const date = sanitizeDate(raw?.date)
  const durationMin = sanitizeDuration(raw?.durationMin)
  const startMin = sanitizeStart(raw?.startMin, date, durationMin, ctx.slotsByDate)
  const tagId = sanitizeTagId(raw?.tagId, ctx.knownTagIds)
  const notes = sanitizeNotes(raw?.notes)
  const priority = sanitizePriority(raw?.priority) ?? 'normal'

  // Built field-by-field rather than spread from `raw` — addTask does not
  // strip a stray deletedAt (ScheduleContext.jsx), so passing model JSON
  // through unfiltered could create a pre-trashed task.
  return { action: 'create', title, date, startMin, durationMin, tagId, notes, priority }
}

/** taskId must be one of the real open tasks this request offered — the
    model may never act on an id it invented, or one belonging to a
    different account. Only fields the model actually set survive into the
    patch; everything else is left out entirely (not set to null), matching
    updateTask's own partial-patch contract (ScheduleContext.jsx) — a
    field set to null here would CLEAR it, not leave it alone. */
function sanitizeUpdate(raw, ctx) {
  const taskId = typeof raw?.taskId === 'string' && ctx.existingById.has(raw.taskId) ? raw.taskId : null
  if (!taskId) return null

  const existing = ctx.existingById.get(taskId)
  const patch = {}

  const title = typeof raw?.title === 'string' ? raw.title.trim() : ''
  if (title) patch.title = title

  const date = sanitizeDate(raw?.date)
  if (date) patch.date = date

  const durationMin = sanitizeDuration(raw?.durationMin)
  if (durationMin) patch.durationMin = durationMin

  // Falls back to the task's own current date/duration when this update
  // doesn't touch them — moving just the time of a task whose date isn't
  // changing still needs to know which day's free time to check against.
  const effectiveDate = date ?? existing?.date ?? null
  const effectiveDuration = durationMin ?? existing?.durationMin ?? null
  const startMin = sanitizeStart(raw?.startMin, effectiveDate, effectiveDuration, ctx.slotsByDate)
  if (startMin !== null) patch.startMin = startMin

  const tagId = sanitizeTagId(raw?.tagId, ctx.knownTagIds)
  if (tagId) patch.tagId = tagId

  const notes = sanitizeNotes(raw?.notes)
  if (notes) patch.notes = notes

  const priority = sanitizePriority(raw?.priority)
  if (priority) patch.priority = priority

  // Nothing survived validation — a "change nothing" update is not a real
  // action, so this item is dropped exactly as if it had never been sent.
  if (Object.keys(patch).length === 0) return null

  return { action: 'update', taskId, patch }
}

function sanitizeRemove(raw, ctx) {
  const taskId = typeof raw?.taskId === 'string' && ctx.existingById.has(raw.taskId) ? raw.taskId : null
  if (!taskId) return null
  return { action: 'remove', taskId }
}

/** One item's worth of the same untrusted-input treatment every AI response
    gets in this codebase — see normalize.js's stance on anything crossing a
    network boundary. Dispatches on the model's own claimed action, but an
    unrecognised one falls back to "create" rather than being dropped
    outright — the safest reading of a garbled action for content that
    otherwise still looks like a real new task. */
function sanitizeItem(raw, ctx) {
  if (raw?.action === 'update') return sanitizeUpdate(raw, ctx)
  if (raw?.action === 'remove') return sanitizeRemove(raw, ctx)
  return sanitizeCreate(raw, ctx)
}

/** Not exported, matching enrich-task.js's own sanitize — every route here
    is tested through its handler with generateJson mocked (see
    tests/apiHandlers.test.jsx), never by calling a sanitizer directly, so
    there is no reason for this to be part of the module's public shape. */
function sanitize(result, { tags, slots, existingTasks }) {
  const safeTags = Array.isArray(tags) ? tags : []
  const knownTagIds = new Set(safeTags.map((tag) => tag.id))

  const slotsByDate = new Map()
  for (const slot of Array.isArray(slots) ? slots : []) {
    if (!slotsByDate.has(slot.date)) slotsByDate.set(slot.date, [])
    slotsByDate.get(slot.date).push(slot)
  }

  const existingById = new Map(
    (Array.isArray(existingTasks) ? existingTasks : []).map((task) => [task.id, task]),
  )

  const status = result?.status === 'ask' || result?.status === 'act' ? result.status : 'ask'

  if (status === 'ask') {
    const question =
      typeof result?.question === 'string' && result.question.trim()
        ? result.question.trim().slice(0, MAX_QUESTION_LEN)
        : "Sorry, I didn't catch that — could you say more?"
    return { status: 'ask', question, items: [] }
  }

  const ctx = { knownTagIds, slotsByDate, existingById }
  const items = Array.isArray(result?.items)
    ? result.items
        .map((item) => sanitizeItem(item, ctx))
        .filter(Boolean)
        .slice(0, MAX_ITEMS)
    : []

  // Nothing survived — every candidate item failed validation (a missing
  // title, an unrecognised task id, an update that changed nothing real).
  // Asking is more honest than silently "succeeding" at doing nothing and
  // leaving the person to wonder if it worked.
  if (items.length === 0) {
    return {
      status: 'ask',
      question: "I couldn't pin that down well enough to act on — could you be more specific about what and when?",
      items: [],
    }
  }

  return { status: 'act', question: null, items }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' })

  try {
    await verifyRequest(req)

    const { messages, today, nowMin, tags, slots, history, existingTasks } =
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

    const safeExisting = Array.isArray(existingTasks)
      ? existingTasks
          .filter(
            (t) =>
              typeof t?.id === 'string' &&
              typeof t?.title === 'string' &&
              (t.date === null || (typeof t.date === 'string' && ISO_DATE.test(t.date))),
          )
          .slice(0, MAX_EXISTING)
      : []

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
      'current open tasks (real ids — update/remove must use one of these, never invent one):',
      ...(safeExisting.length
        ? safeExisting.map((t) => {
            const bits = [`id ${JSON.stringify(t.id)}`, `"${t.title}"`]
            if (t.date) bits.push(t.date)
            if (Number.isFinite(t.startMin)) bits.push(`started at minute ${t.startMin}`)
            if (t.tagId) bits.push(`tag ${JSON.stringify(t.tagId)}`)
            return `- ${bits.join(', ')}`
          })
        : ['(no open tasks right now)']),
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

    return res.status(200).json(sanitize(result, { tags: safeTags, slots: safeSlots, existingTasks: safeExisting }))
  } catch (caught) {
    if (caught instanceof AuthError) return res.status(caught.status).json({ error: caught.message })
    if (caught instanceof GeminiError) return res.status(caught.status).json({ error: caught.message })
    console.error('ai-schedule failed', caught)
    return res.status(500).json({ error: 'Internal error.' })
  }
}
