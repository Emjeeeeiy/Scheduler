/* POST /api/ai-schedule
 *
 * Backs the command palette's "AI" action (src/components/shell/AiChatModal.jsx):
 * a small chat, not a form, and a friendly one. Someone can just talk (a hello,
 * a question about their day, "I'm stuck"), or describe what they want in plain
 * language — create, change, or remove one or several tasks, in one message or a
 * few back and forth. Each turn the route does exactly one of three things:
 * REPLY in words (including one clarifying question when a request is too vague
 * to act on, or names a task ambiguously), ACT on the tasks they asked for, or
 * SUGGEST a few ideas that only become tasks when the person taps Add.
 *
 * What leaves the device: the conversation, the account's first name (the first
 * word of its display name, to greet someone by), tag names, the next week's free
 * windows, a sample of recent task titles and the open tasks.
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
 *
 * TIMES. A time someone states is kept. This route used to throw it away
 * unless the whole block fit inside one of the free windows sent with the
 * request, so any overlap with something already that day — or a time in a day's
 * third gap, which was never sent — quietly became an "All day" task. The model
 * is also no longer asked to do minute arithmetic: it copies the time as "HH:MM"
 * (`startTime`) and `parseClock` converts it, and every time in the prompt is
 * printed the same way. A stated time with no length gets the default length,
 * one with no day gets today (or tomorrow once it has passed), and a value that
 * cannot be used is reported in the item's `issues` rather than vanishing. The
 * free windows only guide a time chosen for a vague phrase ("tomorrow
 * afternoon"); an overlap is the person's business, and the chat warns about it.
 *
 * RESPONSE: always { status, reply, items, skipped }.
 *   'reply'   { reply, items: [], skipped: 0 } — words only, nothing changes.
 *   'act'     { reply, items, skipped } — apply the items now. `reply` is one
 *             friendly sentence, or null when the model gave none usable.
 *   'suggest' { reply, items, skipped: 0 } — ideas, never applied until tapped.
 *             Only 'create' items, at most MAX_SUGGESTIONS.
 * `reply` is plain text (no markdown), at most MAX_REPLY_LEN characters, and is
 * never empty for 'reply' or 'suggest'. An item is
 * { action: 'create', title, date, startMin, durationMin, tagId, notes,
 *   priority, issues } | { action: 'update', taskId, patch, issues } |
 * { action: 'remove', taskId, issues }; `issues` lists any of 'date' | 'time' |
 * 'duration' | 'tag' the model supplied but that could not be used, and
 * `skipped` counts items it proposed that were dropped.
 */

import { addDays, DAY_SHORT, fromKey, toKey, weekdayOf } from '@cadence/shared/date.js'
import { DEFAULT_DURATION_MIN } from '@cadence/shared/normalize.js'
import { verifyRequest } from './_lib/auth.js'
import { generateJson } from './_lib/gemini.js'
import { ApiError, readJsonBody, route } from './_lib/pushRoute.js'
import { enforceAiLimits } from './_lib/rateLimit.js'
import {
  ISO_DATE,
  readExistingTasks,
  readFirstName,
  readHistory,
  readMessages,
  readSlots,
  readTags,
  readText,
} from './_lib/aiInput.js'

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

// Raised from 10: a long message that lists a week of tasks used to lose
// everything past the tenth without a word. `skipped` now says so if even this
// is exceeded.
const MAX_ITEMS = 20
// A chat reply is a few sentences; a list of ideas can run to a short paragraph.
const MAX_REPLY_LEN = 1200
// "Here are a few ideas" is three to five; more is a wall of choices.
const MAX_SUGGESTIONS = 5
// A ceiling, not a target: the longest honest answer (five ideas and a sentence)
// is well under a thousand tokens. Free text has no other bound, so a model that
// rambles is cut off here instead of running into the timeout.
const MAX_OUTPUT_TOKENS = 4096
// The calendar line in the prompt (see calendarLine): enough to resolve "next
// Tuesday" or "the 28th" without the model working a weekday out from a date.
const CALENDAR_DAYS = 14
const MAX_NOTES_LEN = 500
// How much history and how many open tasks are offered is capped in
// _lib/aiInput.js (CAPS), shared with enrich-task.js.

const PRIORITIES = new Set(['low', 'normal', 'high'])

const SYSTEM_INSTRUCTION = `You are Cadence's planning companion: a warm, upbeat assistant inside someone's personal planner. You talk like a friendly person, not a form, and you can also manage their real task list. Every item you create, change or remove is a TASK — something to get done, tickable off a list. This system has no separate notion of an event; do not treat anything as one.
You are given: the conversation so far, their first name (when known), today's date and weekday, a calendar of the next two weeks, the current time of day, their existing tags, their REAL free time for the next 7 days, a sample of their own recent tasks with how each was actually tagged and timed (to learn their patterns from), and their current OPEN tasks, each with a real id, which you may update or remove. You are NOT given their events, so you cannot say what is in their calendar beyond their tasks and free time; if they ask about events, say so plainly.

Every time of day, in what you are given and in what you return in startTime, is a 24-hour "HH:MM" clock time (07:00 is 7 in the morning, 19:30 is half past seven in the evening). In the words you say to the person (the reply), write times the way people say them: "7 PM", "7:30 AM" — never "19:00".

HOW TO TALK (the "reply" field, which is always present):
- Sound like a kind, relaxed friend who is good at planning. Usually one to three short sentences. Plain text only: no markdown, no asterisks, no headings, no emoji. A short list is allowed only for tasks or ideas, one per line, each line starting with "- ".
- Use their first name now and then, such as in a greeting or when encouraging them — not in every message, and never when no first name was given.
- Answer in the language they write in.
- Vary your wording. Never repeat a sentence you already said earlier in this conversation; if you are offering ideas again, say it differently and make the ideas different.
- Use only what you were given. Never invent a task, a time or a fact about their day, and never say you did something that is not in "items".
- Never create, change or remove anything they did not ask for. "Actually nothing", "no thanks", "never mind" and "I'm good" are not requests: answer kindly with status "reply" and say you are here if they want help.
- Stay on their day, their tasks and planning. For anything else (a poem, trivia, code), give one short friendly line and steer back to their day. No essays.

Decide, for THIS turn only, exactly one status:
- "reply": just talk. A greeting, thanks, a question about their tasks or free time, planning advice, light chat — or, only when a request to change something is too vague to act on (not merely missing a date or time, since a task can honestly stay undated when someone means "sometime, no rush"), or refers to an existing task ambiguously (more than one open task plausibly matches and you cannot honestly tell which they mean), ONE short, specific question. Return no items.
- "act": they clearly asked to create, update or remove at least one task. Return those items, and a reply of one short, friendly sentence about what you did. The app lists every detail underneath, so do not repeat titles and times in a list.
- "suggest": they want ideas or are stuck — "what should I do today", "give me suggestions", "anything you suggest", "you choose", "give me a list", or a shrug in answer to your own offer of ideas. NEVER answer such a message with a question: they are asking you to decide. Return 3 to 5 distinct, concrete "create" items (never update or remove), and a reply of one short sentence introducing them. Base them on how they actually spend their time (their recent tasks), the time of day, and their free time: put each one inside a free window of today — or of tomorrow, when little of today is left — with a realistic length, a fitting tag if one clearly fits, and a few words on why in notes. Do not suggest what is already among their open tasks; if an open task has no day, you may name it in the reply and offer to schedule it. Nothing is created until they tap Add, so never say anything was added.

Per item, action is exactly one of:
- "create": a brand-new task. taskId must be null.
- "update": change an EXISTING task. taskId must be the real id of one of the current open tasks given to you — never invent one. Set ONLY the fields that are actually changing; leave every other field null, meaning "leave it as it is."
- "remove": delete an EXISTING task entirely. taskId must be a real id from the current open tasks. Every other field should be null.

To find which existing task someone means, match on title and, if given, day or time, against the current open tasks list. If it's genuinely ambiguous, ask rather than guess.

Per item's other fields — for "create" they describe the new task; for "update" only the ones actually changing are non-null; for "remove" all of them are null:
title: short, the thing itself, with date/time words removed.
date: an ISO date (YYYY-MM-DD), already resolved from any relative phrase ("tomorrow", "next Tuesday", "the 28th") against today's date and the calendar given — null when no day is stated or implied, or when not being changed.
startTime: the time of day the person gave, as 24-hour "HH:MM", copied from what they said and never moved: "7pm" is "19:00", "7:30 in the evening" is "19:30", "noon" is "12:00", "half past 6am" is "06:30", "9 to 10:30" starts at "09:00". A bare hour with no am/pm means what people mean by it: 1 to 6 is the afternoon or evening ("at 3" is "15:00"), 7 to 11 is the morning, 12 is noon. NEVER drop, round, or replace a time the person stated because it looks busy or is not in the free time listed — the system keeps it and tells them if it overlaps something. Only when they give a vague part of the day with no clock time ("tomorrow afternoon", "after work") choose a sensible time inside that date's free windows listed below. null when no time was stated or implied at all, or when not being changed.
durationMin: the length the person gave ("for 2 hours", or "9 to 10:30" which is 90), otherwise a reasonable length in minutes for the thing itself, or null if you truly cannot guess, or it isn't changing.
tagId: the id of the single best-fitting tag from the ones offered, or null if none fits or it isn't changing. Favor how this person has actually tagged similar tasks before over a guess from the title's wording alone. Never invent a tag id.
notes: one short, genuinely useful sentence of context, or null if there is nothing worth adding, or it isn't changing.
priority: "low", "normal", or "high" for a genuinely new or changing priority — null otherwise. Defaults to "normal" for a brand-new task if you have no reason to pick otherwise.

A single message can describe many actions at once, and it can be long. Read it to the END and return one item for EACH distinct task it mentions, each with its own day and time — never merge two tasks into one, never stop early, and never leave a task out because it comes late in the message. Use the whole conversation, not just the latest message: once you have asked a question, the next user message is very likely just the missing answer to it, about the same item(s) discussed before. Earlier assistant turns describe what was already created, changed or removed, with its day and time: a follow-up like "make that 8pm instead" refers to one of those, so match it to the open task with the same title.

Examples of the voice and the status to pick — they show the tone, not words to copy (the name here is only an example):
They say "Hi!" and their first name is Alex: status "reply", reply "Hi Alex! Good to see you. Want to plan something, or just look at what is on your list?"
They say "Actually nothing": status "reply", reply "No problem! If something comes up, or you would like a few ideas for today, just say so."
They say "I don't know what to do today, any suggestions?": status "suggest", reply "Here are a few ideas that fit the free time you have today. Tap Add on any you like.", and three to five create items.
You offered ideas and they say "anything you suggest": status "suggest" again, with ideas — never another question.`

const SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['reply', 'act', 'suggest'] },
    // What the assistant says, always. For 'act' it is one friendly sentence about
    // what it did; for 'reply' and 'suggest' it is the message itself.
    reply: { type: 'string' },
    // No maxItems here: the SDK types it as a string (an int64), which this
    // schema style does not otherwise use, and a wrongly typed keyword fails the
    // whole request. MAX_ITEMS / MAX_SUGGESTIONS cap it in sanitize, and the
    // prompt asks for three to five ideas.
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'update', 'remove'] },
          taskId: { type: ['string', 'null'] },
          title: { type: ['string', 'null'] },
          date: { type: ['string', 'null'] },
          // "HH:MM", not minutes since midnight: copying a time the person said
          // is something a small model does reliably, and converting it to a
          // minute count while comparing it with other minute counts in a long
          // prompt is where it slipped. parseClock does the arithmetic.
          startTime: { type: ['string', 'null'] },
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
        required: ['action', 'taskId', 'title', 'date', 'startTime', 'durationMin', 'tagId', 'notes', 'priority'],
      },
    },
  },
  required: ['status', 'reply', 'items'],
}

/** A real calendar day, not just something shaped like one: "2026-02-31" matches
    ISO_DATE and rolls over to March in a Date, so it is checked by round trip. */
function sanitizeDate(raw) {
  if (typeof raw !== 'string' || !ISO_DATE.test(raw)) return null
  return toKey(fromKey(raw)) === raw ? raw : null
}

const CLOCK = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m?\.?\s*$/i
const CLOCK_24 = /^\s*(\d{1,2}):(\d{2})\s*$/

/** The model is asked for "HH:MM", but a small model still sometimes writes
    "7:30 pm" or "7pm", and a time someone clearly said should not be lost over
    punctuation. A bare number ("5") is refused: it could be a length, and a
    guess here becomes a task at the wrong hour. Minutes after midnight, or null. */
function parseClock(raw) {
  if (typeof raw !== 'string') return null
  const plain = CLOCK_24.exec(raw)
  if (plain) {
    const hour = Number(plain[1])
    const minute = Number(plain[2])
    return hour <= 23 && minute <= 59 ? hour * 60 + minute : null
  }
  const spoken = CLOCK.exec(raw)
  if (!spoken) return null
  const hour = Number(spoken[1])
  const minute = spoken[2] === undefined ? 0 : Number(spoken[2])
  if (hour < 1 || hour > 12 || minute > 59) return null
  return (hour % 12) * 60 + (spoken[3].toLowerCase() === 'p' ? 12 * 60 : 0) + minute
}

/** 540 -> "09:00". The prompt prints every time this way, so the model reads and
    writes one notation and never has to convert between two. 1440 (the end of a
    free window that runs to midnight) is "24:00". */
function clockLabel(min) {
  if (min >= 24 * 60) return '24:00'
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

/** The day a time with no day means: today if it is still ahead, else tomorrow —
    "dentist at 7pm" said at 9pm is tomorrow's, not a task in the past. With the
    clock unknown it is today, which is also where the person was looking. */
function defaultDay(startMin, ctx) {
  return Number.isInteger(ctx.nowMin) && startMin <= ctx.nowMin ? addDays(ctx.today, 1) : ctx.today
}

/** Today's weekday and the next two weeks, one line: "Fri 2026-11-20 (today),
    Sat 2026-11-21, …". Models are poor at the weekday of a date, and "next
    Tuesday" is only as good as that. */
function calendarLine(today) {
  const days = []
  for (let i = 0; i < CALENDAR_DAYS; i += 1) {
    const key = addDays(today, i)
    days.push(`${DAY_SHORT[weekdayOf(key)]} ${key}${i === 0 ? ' (today)' : ''}`)
  }
  return days.join(', ')
}

function sanitizeDuration(raw) {
  return Number.isInteger(raw) && raw >= 5 && raw <= 24 * 60 ? raw : null
}

/* A time someone states is their decision: it is NOT checked against free time.
   Overlapping something already booked is allowed (the calendar draws
   overlapping blocks side by side), and the chat tells them when it happens. The
   old rule — keep the time only if the whole block fits inside one free window
   sent with the request — turned any clash, and any time in a day's unsent third
   gap, into a task with no time, and rejected moving a task to a time that
   overlapped its own old slot. What a start time still needs is the rest of a
   block: a length (the default, if none was given) and a day. */

function sanitizeTagId(raw, knownTagIds) {
  return knownTagIds.has(raw) ? raw : null
}

function sanitizeNotes(raw) {
  return typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, MAX_NOTES_LEN) : null
}

function sanitizePriority(raw) {
  return PRIORITIES.has(raw) ? raw : null
}

/** Whether the model supplied a value at all, as opposed to leaving a field null
    on purpose ("not changing", "no time said"). Only a supplied value that then
    fails validation is an issue worth telling the person about. */
function given(raw) {
  return raw !== null && raw !== undefined && raw !== ''
}

/** A brand-new task — the only action where a missing title means there is
    nothing legitimately creatable at all; every other field here has a
    safe fallback (null date, "normal" priority, etc). */
function sanitizeCreate(raw, ctx) {
  const title = typeof raw?.title === 'string' ? raw.title.trim() : ''
  if (!title) return null

  const issues = []
  let date = sanitizeDate(raw?.date)
  if (given(raw?.date) && !date) issues.push('date')
  let durationMin = sanitizeDuration(raw?.durationMin)
  if (given(raw?.durationMin) && !durationMin) issues.push('duration')
  const startMin = parseClock(raw?.startTime)
  if (given(raw?.startTime) && startMin === null) issues.push('time')
  const tagId = sanitizeTagId(raw?.tagId, ctx.knownTagIds)
  if (given(raw?.tagId) && !tagId) issues.push('tag')
  const notes = sanitizeNotes(raw?.notes)
  const priority = sanitizePriority(raw?.priority) ?? 'normal'

  // A time makes a block, and a block needs a length and a day. Filling them in
  // is what keeps a stated time: the alternative was to discard it.
  if (startMin !== null) {
    if (!durationMin) durationMin = DEFAULT_DURATION_MIN
    if (!date) date = defaultDay(startMin, ctx)
  }

  // Built field-by-field rather than spread from `raw` — addTask does not
  // strip a stray deletedAt (ScheduleContext.jsx), so passing model JSON
  // through unfiltered could create a pre-trashed task.
  return { action: 'create', title, date, startMin, durationMin, tagId, notes, priority, issues }
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
  const issues = []

  const title = typeof raw?.title === 'string' ? raw.title.trim() : ''
  if (title) patch.title = title

  const date = sanitizeDate(raw?.date)
  if (date) patch.date = date
  else if (given(raw?.date)) issues.push('date')

  const durationMin = sanitizeDuration(raw?.durationMin)
  if (durationMin) patch.durationMin = durationMin
  else if (given(raw?.durationMin)) issues.push('duration')

  const startMin = parseClock(raw?.startTime)
  if (given(raw?.startTime) && startMin === null) issues.push('time')
  if (startMin !== null) {
    patch.startMin = startMin
    // A time needs a day and a length. The task's own are used when this update
    // does not change them; an undated task given a time is being scheduled, so
    // it gets the day such a time means. (A stored task nearly always has a
    // length already; the default covers the one that arrives without.)
    if (!patch.date && !existing?.date) patch.date = defaultDay(startMin, ctx)
    if (!patch.durationMin && !existing?.durationMin) patch.durationMin = DEFAULT_DURATION_MIN
  }

  const tagId = sanitizeTagId(raw?.tagId, ctx.knownTagIds)
  if (tagId) patch.tagId = tagId
  else if (given(raw?.tagId)) issues.push('tag')

  const notes = sanitizeNotes(raw?.notes)
  if (notes) patch.notes = notes

  const priority = sanitizePriority(raw?.priority)
  if (priority) patch.priority = priority

  // Nothing survived validation — a "change nothing" update is not a real
  // action, so this item is dropped exactly as if it had never been sent.
  if (Object.keys(patch).length === 0) return null

  return { action: 'update', taskId, patch, issues }
}

function sanitizeRemove(raw, ctx) {
  const taskId = typeof raw?.taskId === 'string' && ctx.existingById.has(raw.taskId) ? raw.taskId : null
  if (!taskId) return null
  return { action: 'remove', taskId, issues: [] }
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

/* What the person reads when the model gave nothing usable. These are the route's
   own words, so they are written as the companion would say them — never a
   status line. */
const LOST_THREAD_REPLY = 'Sorry, I lost my train of thought — could you say that another way?'
const NO_ITEMS_REPLY = "Hmm, I couldn't tell which task you meant or what to change — could you tell me a bit more?"
const NO_IDEAS_REPLY = "I'm drawing a blank on ideas right now — tell me what you're in the mood for and I'll help you plan it."

/** Two titles are the same task when they differ only in case or spacing. */
const titleKey = (title) => String(title ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/** The model's own words, made safe to show: plain text (no markdown the chat
    would print as literal asterisks), clipped, or null when nothing is left. The
    chat shows replies as text and never as markup, so this is about how it reads,
    not about injection. */
function sanitizeReply(raw) {
  if (typeof raw !== 'string') return null
  const plain = raw
    .replace(/\*\*|__/g, '')
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*[*•][ \t]+/gm, '- ')
  return readText(plain, MAX_REPLY_LEN) || null
}

/** Not exported, matching enrich-task.js's own sanitize — every route here
    is tested through its handler with generateJson mocked (see
    tests/apiHandlers.test.jsx), never by calling a sanitizer directly, so
    there is no reason for this to be part of the module's public shape. */
function sanitize(result, { tags, existingTasks, today, nowMin }) {
  const safeTags = Array.isArray(tags) ? tags : []
  const knownTagIds = new Set(safeTags.map((tag) => tag.id))

  const existingById = new Map(
    (Array.isArray(existingTasks) ? existingTasks : []).map((task) => [task.id, task]),
  )

  const reply = sanitizeReply(result?.reply)
  const talk = (text) => ({ status: 'reply', reply: text, items: [], skipped: 0 })

  // Anything that is not clearly an action or a list of ideas is just talk: the
  // safest reading of a garbled status, since talking changes nothing.
  const status = result?.status === 'act' || result?.status === 'suggest' ? result.status : 'reply'
  if (status === 'reply') return talk(reply ?? LOST_THREAD_REPLY)

  const ctx = { knownTagIds, existingById, today, nowMin }
  const proposed = Array.isArray(result?.items) ? result.items : []

  if (status === 'suggest') {
    // Ideas are only ever new tasks. An update or a removal slipped in among them
    // must not reach a button that says Add.
    // Nor may one repeat a task they already have open: tapping Add would make a
    // duplicate, and the prompt only asks the model not to suggest it.
    const openTitles = new Set([...existingById.values()].map((task) => titleKey(task.title)))
    const ideas = proposed
      .filter((item) => item?.action === 'create')
      .map((item) => sanitizeCreate(item, ctx))
      .filter((item) => item && !openTitles.has(titleKey(item.title)))
      .slice(0, MAX_SUGGESTIONS)
    if (ideas.length === 0) return talk(reply ?? NO_IDEAS_REPLY)
    return { status: 'suggest', reply: reply ?? 'Here are a few ideas for you.', items: ideas, skipped: 0 }
  }

  const items = proposed
    .map((item) => sanitizeItem(item, ctx))
    .filter(Boolean)
    .slice(0, MAX_ITEMS)

  // Nothing survived — every candidate item failed validation (a missing
  // title, an unrecognised task id, an update that changed nothing real).
  // Saying so, and asking for more, is more honest than silently "succeeding" at
  // doing nothing and leaving the person to wonder if it worked. The model's own
  // sentence is NOT used here: it was written for a change that did not happen.
  if (items.length === 0) return talk(NO_ITEMS_REPLY)

  // What the model proposed and this route dropped (a missing title, an id that
  // was never offered, an update that changed nothing, or past MAX_ITEMS). Said
  // out loud by the chat, so a long list that lost a few is never "all done".
  return { status: 'act', reply, items, skipped: proposed.length - items.length }
}

export default route('ai-schedule', ['POST'], async (req, res) => {
  const uid = await verifyRequest(req)
  const body = readJsonBody(req)

  const safeMessages = readMessages(body.messages)
  if (safeMessages.length === 0) {
    throw new ApiError(400, 'messages must include at least one message with content.')
  }
  const { today, nowMin: rawNowMin } = body
  if (!sanitizeDate(today)) {
    throw new ApiError(400, 'today must be a YYYY-MM-DD date key.')
  }

  const firstName = readFirstName(body.firstName)
  const safeTags = readTags(body.tags)
  const safeSlots = readSlots(body.slots, { dated: true })
  // Titles, tags and durations only — same privacy stance enrich-task.js
  // already takes with this account's own history: notes and checklists
  // never leave the device just to improve a tag/duration guess.
  const safeHistory = readHistory(body.history)
  const safeExisting = readExistingTasks(body.existingTasks)

  await enforceAiLimits('aiSchedule', uid)

  const slotsByDate = new Map()
  for (const slot of safeSlots) {
    if (!slotsByDate.has(slot.date)) slotsByDate.set(slot.date, [])
    slotsByDate.get(slot.date).push(slot)
  }

  const nowMin = Number.isInteger(rawNowMin) && rawNowMin >= 0 && rawNowMin < 24 * 60 ? rawNowMin : null

  // Every time of day below is "HH:MM", the notation the model is asked to
  // answer in — see parseClock.
  const prompt = [
    `today: ${today} (${DAY_SHORT[weekdayOf(today)]})`,
    `the next ${CALENDAR_DAYS} days: ${calendarLine(today)}`,
    `current time: ${nowMin === null ? '(not given)' : clockLabel(nowMin)}`,
    `their first name: ${firstName ? JSON.stringify(firstName) : '(not given)'}`,
    '',
    'available tags:',
    ...(safeTags.length
      ? safeTags.map((t) => `- id ${JSON.stringify(t.id)}: ${JSON.stringify(t.name)}`)
      : ['(none created yet)']),
    '',
    'real free time over the next 7 days (a guide for choosing a time when none was stated — never a limit on a time that was):',
    ...(slotsByDate.size
      ? [...slotsByDate.entries()].map(
          ([date, daySlots]) =>
            `- ${date}: ${daySlots.map((s) => `${clockLabel(s.startMin)}-${clockLabel(s.endMin)}`).join(', ')}`,
        )
      : ['(no free time found)']),
    '',
    "recent tasks, most recent first (this person's own patterns):",
    ...(safeHistory.length
      ? safeHistory.map((h) => {
          const bits = [JSON.stringify(h.title)]
          if (h.tagId) bits.push(`tag ${JSON.stringify(h.tagId)}`)
          if (Number.isFinite(h.durationMin)) bits.push(`${h.durationMin} min`)
          if (Number.isFinite(h.startMin)) bits.push(`started at ${clockLabel(h.startMin)}`)
          return `- ${bits.join(', ')}`
        })
      : ['(no history yet)']),
    '',
    'current open tasks (real ids — update/remove must use one of these, never invent one):',
    ...(safeExisting.length
      ? safeExisting.map((t) => {
          const bits = [`id ${JSON.stringify(t.id)}`, JSON.stringify(t.title)]
          if (t.date) bits.push(t.date)
          if (Number.isFinite(t.startMin)) bits.push(`starts at ${clockLabel(t.startMin)}`)
          if (t.tagId) bits.push(`tag ${JSON.stringify(t.tagId)}`)
          return `- ${bits.join(', ')}`
        })
      : ['(no open tasks right now)']),
    '',
    'conversation so far:',
    ...safeMessages.map((m) => `${m.role}: ${m.content}`),
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
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  })

  return res
    .status(200)
    .json(sanitize(result, { tags: safeTags, existingTasks: safeExisting, today, nowMin }))
})
