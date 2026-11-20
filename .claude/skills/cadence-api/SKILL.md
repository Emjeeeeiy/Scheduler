---
name: cadence-api
description: Use when adding or changing a Cadence serverless route under api/ — an AI route that calls Gemini (parse-task, plan-day, note-tasks and the like), a push/notification route, a rate limit, input caps, or the client code and UI that calls one. Carries the fixed order every route follows (method, auth, body, caps, rate limit, model, sanitize), the error rules, the env-var rules and the client half (callApi, fallbacks, disclosure). Not for Firestore data (cadence-data) or screen layout (cadence-ui).
user-invocable: true
argument-hint: "[new route | change route | client call | push] [name]"
allowed-tools:
  - Bash(npx vitest run *)
  - Bash(node .claude/skills/cadence-verify/scripts/*)
---

`api/` holds Vercel serverless functions. Registration is open, so "has a valid token" limits nothing: every route that costs money (a Gemini call, a push send, a Redis slot) needs a **verified email**, a **budget**, and **capped input**. The six AI routes and the push routes share one glue file and one order; keep to it. Copy `api/parse-task.js` for a new AI route (it is the shortest complete one), and read [references/route-template.md](references/route-template.md) for the annotated version and the client half. Push routes have their own rules in [references/push.md](references/push.md).

## The order inside a route (do not reorder)

Every route is `export default route('<name>', ['POST'], async (req, res) => { … })` from `api/_lib/pushRoute.js`, which checks the method first (405 with an `Allow` header) and turns thrown errors into responses. Inside the handler:

1. **`const uid = await verifyRequest(req)`** (`api/_lib/auth.js`). Verifies the Firebase ID token (RS256, issuer and audience are the project, `sub` 1–128 chars), then requires `email_verified === true` (403 otherwise), then App Check when `APPCHECK_ENFORCE=true`. Opt out of the verified-email check **only** for account deletion (`push/unsubscribe` with `{ all: true }`), so an unverified account can still delete itself.
2. **`const body = readJsonBody(req)`.** Handles a string body; bad JSON is a 400; a non-object becomes `{}`.
3. **Read every field through `api/_lib/aiInput.js`** (`readText`, `readTags`, `readSlots`, `readHistory`, `readPlanTasks`, `readExistingTasks`, `readMessages`, sized by `CAPS`). Oversized input is **clipped or dropped, never rejected**, because each route is an enhancement with a heuristic already on screen. A missing required field throws `new ApiError(400, '… is required.')`. An empty-but-valid request returns a cheap `200` **before** any budget is spent (see `suggest-tag`, `plan-day`, `note-tasks`).
4. **`await enforceAiLimits('<name>', uid)`** (`api/_lib/rateLimit.js`) spends from the route's own budget in `LIMITS` *and* the shared `aiDaily` budget (300/day). It is a fixed-window Redis `INCR` + `EXPIRE` and **fails open** when Redis is missing or down (logged once), so a Redis outage never takes the app down. It comes **after** validation on purpose, so a malformed request costs no budget. (README's Security section lists these in a different order; the code's order is the real one.)
5. **Build the prompt with user strings through `JSON.stringify(...)`** (`sentence: ${JSON.stringify(text)}`), so a quote or newline in user text cannot break out of its field.
6. **`generateJson({ model, systemInstruction, prompt, schema, timeoutMs })`** (`api/_lib/gemini.js`). Routes never import `@google/genai` themselves. Structured output is enforced by `responseSchema`: JSON-Schema style, **every field in `required`**, and a field that may be absent is nullable with a type array (`type: ['string', 'null']`). Set `timeoutMs` a little *below* the client's budget (the pairs: suggest-tag 7000/8000, enrich-task 10000/12000, parse-task 11000/12000, note-tasks 14000/16000, plan-day 14000/15000, ai-schedule 27000/30000, route/client; the 8000 ms default is too short for most).
7. **Sanitize the model's answer in a private `sanitize()`.** Treat it as untrusted input: rebuild the object field by field (never spread model output), accept ids only from the set *this request* supplied, check ranges (minute 0–1439, duration 5–1440, dates match `ISO_DATE`, and for a real calendar day also `toKey(fromKey(key)) === key`), require that a proposed time fits entirely inside a supplied free slot, and turn anything doubtful into `null`. The model only *finds* things; placement and arithmetic are done in code (`planDay`, `placeNoteTasks` in `packages/shared`).
8. **`return res.status(200).json(sanitized)`.**

## Errors

- `ApiError(status, message)` and `AuthError(status, message)` are **shown to the caller as written**: write them as user-safe sentences.
- An upstream failure (`GeminiError`, flagged `upstream = true`) is **logged** (`console.warn('<name>: upstream failure', { status, message })`) and the browser gets only a generic message: 429 "AI is busy right now…", 504 "AI took too long to answer.", otherwise 502 "AI request failed." What Gemini said about itself never reaches the client. A test pins this.
- Anything else is `console.error('<name> failed', caught)` and a 500 "Internal error." that leaks nothing.
- **Known gap, do not copy:** "server is missing X" errors (`FIREBASE_PROJECT_ID`, the Redis URL, `CRON_SECRET`) are thrown as `AuthError`/`ApiError` and so are shown to the caller with the variable's name; and a missing `GEMINI_API_KEY` surfaces as an upstream 502 logged only at *warn*, so it reads like a Gemini outage. For a new route, log configuration problems and return the generic 500.

## Environment

Server variables are **never `VITE_`-prefixed** and a server function never reads a `VITE_` one (`FIREBASE_PROJECT_ID` is deliberately duplicated for that reason). Server-only: `GEMINI_API_KEY`, `GEMINI_MODEL_FAST` / `GEMINI_MODEL_PLAN`, `FIREBASE_PROJECT_ID`, `FIREBASE_PROJECT_NUMBER`, `APPCHECK_ENFORCE`, `VAPID_*`, `CRON_SECRET`, `UPSTASH_REDIS_REST_*` (or `KV_REST_API_*`). Client-visible: `VITE_FIREBASE_*`, `VITE_APPCHECK_SITE_KEY`, `VITE_VAPID_PUBLIC_KEY`. The SendGrid secrets belong to the Firebase function, not to Vercel. A new variable goes in `.env.example` with a comment, and in the README's deploy steps if it is required.

## The client half

`src/lib/aiClient.js` has one wrapper per route around `callApi(path, body, { timeoutMs })` (`src/lib/apiClient.js`), the only `fetch` in `src/`. `callApi` **never throws**: signed out, offline, a timeout, a non-2xx status or a non-JSON body all resolve to `null`. Callers branch on "got an answer or not", and `null` means "AI could not be reached" while an empty list is a real answer. So:

- **Every AI feature has a heuristic fallback already on screen** (`parseQuickAdd`, `suggestTag`, `planDay`), and the AI result enhances it; a failure must leave the person where the heuristic had them, never at a dead end.
- **Call only on an explicit press or a debounce**, never per keystroke or in the background. Gate on `emailVerified` (from `useAuth()`) and show the "Confirm your email to use" hint with a `VerifyNotice` when it is false.
- **Send as little as possible**: titles, tag names and durations; never notes or checklists unless the feature exists to read them (Plan it sends note text, only on the button).
- **Update `src/lib/aiDisclosure.js`** (`AI_DISCLOSURE`, `NOTE_AI_DISCLOSURE`) and the README Security section whenever a *new kind* of data leaves the device, and show the disclosure where the feature is offered. (The current text understates what `enrich-task` and `ai-schedule` send: tag names, free-time windows and open tasks' dates as well as titles. Say what your route sends accurately.)
- A waiting state for an explicit request uses `push('Asking AI…', { tone: 'success', durationMs: 15000 })` and `dismiss(id)`; an answer that arrives after Dismiss or after a second press is discarded.

## Tests

- Add the route to the `it.each` tables in `tests/apiHandlers.test.jsx` (405 on a wrong method before auth or Gemini; 401 and no Gemini call on an auth failure; a `GeminiError` 429 propagates as 429), then add cases for required fields, caps, the empty-input early return, the rate limit, and `sanitize` (a rogue field dropped, an out-of-range value nulled, an id the request did not supply rejected).
- A **new test file** that imports `api/` must be added to `apiTests` in `vitest.config.js` (it needs vitest's `node` project because `@google/genai` needs Node's web globals).
- Run with `npx vitest run --project node`; then `cadence-verify`.

## Also remember

- A route that can take longer than the platform default needs a `functions` entry in `vercel.json` (`api/push/tick.js` has `maxDuration: 30`). The AI routes' own `timeoutMs` values run from 7 s (`suggest-tag`) to 27 s (`ai-schedule`), and only `api/push/tick.js`, `api/mcp.js` and `api/ai-schedule.js` have a `maxDuration` (30 s each, in `vercel.json`); confirm the Vercel project's default function limit is not lower than another route's timeout, or the platform will cut that route off before its own timeout fires. (`ai-schedule` was added while diagnosing intermittent "couldn't reach AI" replies. Replaying the real route against Gemini's free tier, one turn took anywhere from 1.1 s to 16 s over an afternoon, so a reply can cross a 10 s platform default. Whether that was the actual cause was not confirmed: it needs the project's real function limit and the production logs.)
- A Vercel route may import `@cadence/shared/*.js` directly (the bundler traces it): `plan-day.js` and `note-tasks.js` do.
- API file header comments should say what data leaves the device and what the response shape is. (Several still say `autoSchedule`, `parseQuickAdd` and `suggestTag` live under `src/lib/`; they moved to `packages/shared/src/`.)
