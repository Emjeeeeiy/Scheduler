# New AI route: template

Adapted from `api/parse-task.js`. Replace `my-task`/`myTask`, fill the three constants, keep the order.

## `api/my-task.js`

```js
/* POST /api/my-task
 *
 * <What it is for and when the client calls it (an explicit press? a debounce?).>
 * <Response shape, and why it mirrors a heuristic's shape if it does.>
 * <What leaves the device: which fields, and that nothing else does.>
 */

import { verifyRequest } from './_lib/auth.js'
import { generateJson } from './_lib/gemini.js'
import { ApiError, readJsonBody, route } from './_lib/pushRoute.js'
import { enforceAiLimits } from './_lib/rateLimit.js'
import { CAPS, ISO_DATE, readText } from './_lib/aiInput.js'

// Env-configurable because model names churn (one was already retired for new keys).
const MODEL = process.env.GEMINI_MODEL_FAST ?? 'gemini-3.5-flash-lite'

const SYSTEM_INSTRUCTION = `<What the model does. Say what null means. Say what "today" is.
Never guess a field you are not reasonably confident about; null is the honest answer.>`

// Every field required; nullable via a type array.
const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    date: { type: ['string', 'null'] },
    startMin: { type: ['integer', 'null'] },
  },
  required: ['title', 'date', 'startMin'],
}

/** Everything the model returned is untrusted: rebuild it, field by field. */
function sanitize(result /*, ctxFromThisRequest: supplied ids, slots, today */) {
  const title = typeof result?.title === 'string' ? result.title.trim().slice(0, CAPS.title) : ''
  const date = typeof result?.date === 'string' && ISO_DATE.test(result.date) ? result.date : null
  const startMin =
    Number.isInteger(result?.startMin) && result.startMin >= 0 && result.startMin <= 1439 ? result.startMin : null
  // A start time with no date is meaningless: the same rule normalizeTask enforces.
  return { title, date, startMin: date ? startMin : null }
}

export default route('my-task', ['POST'], async (req, res) => {
  const uid = await verifyRequest(req)                       // 1. who, verified email, App Check
  const body = readJsonBody(req)                             // 2. parse

  const text = readText(body.text, CAPS.quickAddText)        // 3. validate + cap (clip, don't reject)
  if (!text) throw new ApiError(400, 'text is required.')
  if (typeof body.today !== 'string' || !ISO_DATE.test(body.today)) {
    throw new ApiError(400, 'today must be a YYYY-MM-DD date key.')
  }
  // (An empty-but-valid request returns a cheap 200 here, before any budget is spent.)

  await enforceAiLimits('myTask', uid)                       // 4. budget: own limit + shared aiDaily

  const prompt = `today: ${body.today}\nsentence: ${JSON.stringify(text)}` // 5. user text is JSON-quoted

  const result = await generateJson({                        // 6. the only model call
    model: MODEL,
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    schema: SCHEMA,
    timeoutMs: 11000, // a little under the client's 12000
  })

  return res.status(200).json(sanitize(result))              // 7-8. rebuilt answer only
})
```

## Register it

1. **Budget:** add `myTask: { limit: 60, windowSec: HOUR }` to `LIMITS` in `api/_lib/rateLimit.js`, with a comment saying why that number. Foreground button presses get tens per hour; "while you type" helpers get ~120; a model on the reasoning tier gets ~20.
2. **Input shape:** a new kind of input needs a `CAPS` entry and a `readX()` in `api/_lib/aiInput.js` (clip, filter, slice; return `[]`/`''` for junk), not ad-hoc checks in the route.
3. **Duration:** only if the route can exceed the platform default, add `"api/my-task.js": { "maxDuration": N }` under `functions` in `vercel.json`.
4. **Env:** a new variable goes in `.env.example` (server-only, no `VITE_`) with a comment, and the README deploy steps if required.

## The client half

`src/lib/aiClient.js`:

```js
/** @return {Promise<{title:string,date:string|null,startMin:number|null}|null>} null = AI could not be reached */
export async function myTaskAi({ text, today }) {
  return callApi('/api/my-task', { text, today }, { timeoutMs: 12000 }) // matches the route's 11000 + margin
}
```

Caller:

```jsx
const { emailVerified } = useAuth()
// disabled + hint "Confirm your email to use" + <VerifyNotice/> when !emailVerified
const id = push('Asking AI…', { tone: 'success', durationMs: 15000 })
const answer = await myTaskAi({ text, today: todayKey() })
dismiss(id)
if (!answer) {
  pushError('AI could not read that. You can fill it in yourself.')   // and fall back: open the plain form
  return
}
// apply `answer` over the heuristic's result; discard it if the person dismissed or pressed again meanwhile
```

## Tests

`tests/apiHandlers.test.jsx`: add `['my-task', myTaskHandler, { text: 'lunch tomorrow', today: '2026-08-24' }]` to each of the three `it.each` tables (405, 401, `GeminiError(429)` propagates), then a `describe('my-task')` with: 400 on a missing field, the clip at `CAPS`, the empty early return not calling `generateJson`, a rogue field dropped, a bad date nulled, and the prompt containing the JSON-quoted text (`generateJson.mock.calls.at(-1)[0].prompt`). Client: `tests/aiClient.test.jsx`. See `cadence-tests` for the mocking set-up.

## Checklist

- [ ] order is auth → body → validate/cap → budget → model → sanitize
- [ ] budget added to `LIMITS`; caps and reader in `aiInput.js`
- [ ] answer rebuilt field by field; ids and times checked against *this request*
- [ ] error text is user-safe; config problems logged, not returned
- [ ] `timeoutMs` below the client's; client returns `null` on failure and has a fallback
- [ ] `aiDisclosure.js` and README Security updated if a new kind of data leaves the device
- [ ] `tests/apiHandlers.test.jsx` tables + cases; new test file listed in `apiTests`
- [ ] `cadence-verify`
