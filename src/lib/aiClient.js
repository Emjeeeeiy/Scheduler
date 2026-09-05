/* The one place that talks to /api/* — every caller (TaskEditor's tag
 * suggestion, TodayView's "Plan my day", the command palette's "Parse with
 * AI") gets the identical contract: authenticate, ask, and on ANYTHING
 * short of a clean answer — offline, a timeout, a 429 from Gemini's
 * unpublished and unraisable free-tier rate limit, a signed-out session —
 * resolve to `null` rather than throw.
 *
 * That contract is deliberate, not an oversight: every one of these calls
 * is an ENHANCEMENT over a heuristic that already answered (or, for
 * quick-add, a title the person can still save as-is). A network error
 * here is never the caller's problem to handle — it's this module's job to
 * make sure it never has to.
 */

import { auth } from '../firebase.js'

const DEFAULT_TIMEOUT_MS = 8000

async function callApi(path, body, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!auth?.currentUser) return null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const token = await auth.currentUser.getIdToken()
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) return null
    return await response.json()
  } catch (caught) {
    // Covers a rejected getIdToken(), AbortError from the timeout, a
    // network failure, and a response body that wasn't valid JSON — all
    // the same outcome from every caller's point of view.
    console.warn(`AI call to ${path} did not complete.`, caught)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** @return a tagId, or null when nothing was confidently suggested OR the
    call didn't complete — the caller cannot and should not tell the two
    apart. */
export async function suggestTagAi({ title, tags }) {
  const result = await callApi('/api/suggest-tag', { title, tags })
  return result?.tagId ?? null
}

/** @return `{ title, date, startMin, durationMin }` (parseQuickAdd's own
    shape) or null if the call didn't complete. */
export async function parseTaskAi({ text, today }) {
  return callApi('/api/parse-task', { text, today }, { timeoutMs: 12000 })
}

/** @return `[{ taskId, startMin }]`, already validated server-side, or null.
    The caller (TodayView) re-validates against its own live free slots
    with isValidAiPlan before ever showing this — see autoSchedule.js for
    why a second check on the client's own current data still matters. */
export async function planDayAi({ tasks, slots }) {
  const result = await callApi('/api/plan-day', { tasks, slots }, { timeoutMs: 15000 })
  return result?.placements ?? null
}

/** @return `{ tagId, durationMin, startMin, subtasks, notes }`, every field
    independently nullable (a partial answer is still useful), already
    validated server-side against the real tags/slots this request sent —
    or null if the call didn't complete. Runs on GEMINI_MODEL_FAST now (see
    api/enrich-task.js) after live testing showed the reasoning-tier model
    taking long enough that a debounced while-you-type suggestion felt
    broken rather than merely slow — a shorter timeout to match. */
export async function enrichTaskAi(payload) {
  return callApi('/api/enrich-task', payload, { timeoutMs: 12000 })
}
