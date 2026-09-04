/* One place that actually talks to Gemini, so every route shares the same
 * client, the same structured-output shape, and the same error handling —
 * a route file never touches @google/genai directly.
 *
 * API shape below is copied from this project's OWN installed
 * node_modules/@google/genai/dist/node/node.d.ts, not from memory or a
 * fetched doc page — an earlier pass here trusted a fetched example
 * (`client.interactions.create(...)`) that turned out not to exist on the
 * package actually installed; the real, exported class only has
 * `ai.models.generateContent(...)`. Re-check the installed types again if
 * this ever needs touching after a `@google/genai` upgrade.
 */

import { GoogleGenAI, ApiError } from '@google/genai'

let client = null
function getClient() {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new GeminiError(500, 'Server is missing GEMINI_API_KEY.')
    client = new GoogleGenAI({ apiKey })
  }
  return client
}

/**
 * Every caller here wants the identical shape: a system instruction, a
 * prompt, a JSON Schema the reply must match, and back a parsed JS value —
 * never a route hand-rolling `JSON.parse(response.text)` and its own
 * try/catch a fourth time.
 *
 * @param model             Gemini model id (see GEMINI_MODEL_FAST/_PLAN env vars)
 * @param systemInstruction fixed behavioural framing for this route
 * @param prompt            the actual per-request content
 * @param schema            JSON Schema the response must satisfy
 * @param timeoutMs         a genuinely dead network must not hang a request
 *                          forever — the caller (a route with a heuristic
 *                          already on screen) has a fallback ready and
 *                          would rather give up quickly than sit waiting
 */
export async function generateJson({ model, systemInstruction, prompt, schema, timeoutMs = 8000 }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await getClient().models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: schema,
        abortSignal: controller.signal,
      },
    })

    const text = response.text
    if (!text) throw new GeminiError(502, 'Gemini returned no text.')

    try {
      return JSON.parse(text)
    } catch (caught) {
      // A model asked for JSON can still occasionally hand back something
      // that isn't — treated as a normal, expected failure mode here
      // (mapped to the same 502 a caller already has to handle), not a
      // crash-worthy bug in this file.
      throw new GeminiError(502, 'Gemini returned malformed JSON.', caught)
    }
  } catch (caught) {
    if (caught instanceof GeminiError) throw caught
    if (caught instanceof ApiError) {
      // ApiError.status is the real HTTP status Gemini's API answered
      // with — 429 for the free tier's (unpublished, unraisable) rate
      // limit is exactly the case every calling route needs to
      // distinguish so it can fail silently rather than show an error.
      throw new GeminiError(caught.status, caught.message, caught)
    }
    if (caught.name === 'AbortError') {
      throw new GeminiError(504, `Gemini did not respond within ${timeoutMs}ms.`, caught)
    }
    throw new GeminiError(502, caught.message ?? 'Gemini request failed.', caught)
  } finally {
    clearTimeout(timer)
  }
}

export class GeminiError extends Error {
  constructor(status, message, cause) {
    super(message)
    this.status = status
    this.cause = cause
  }
}
