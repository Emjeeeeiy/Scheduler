/* The api/*.js route handlers' own request/response glue — auth ordering,
 * method/body validation, and how a Gemini answer gets turned into an HTTP
 * response — with verifyRequest and generateJson mocked out. What this
 * does NOT cover: JWKS verification against a real Firebase project, or a
 * real Gemini round trip. Those need a live key; see README's testing
 * notes. What it DOES cover is the exact class of bug fakeFirestore.js
 * caught in the Phase 6 digest work — wiring mistakes in the glue code
 * around a well-verified external call, not the call itself.
 *
 * Named .test.jsx to route through vitest (see vitest.config.js's own
 * comment on the split) — nothing here renders a component or touches the
 * DOM; these are plain Node request handlers.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api/_lib/auth.js', async () => {
  const actual = await vi.importActual('../api/_lib/auth.js')
  return { ...actual, verifyRequest: vi.fn() }
})
vi.mock('../api/_lib/gemini.js', async () => {
  const actual = await vi.importActual('../api/_lib/gemini.js')
  return { ...actual, generateJson: vi.fn() }
})

import { verifyRequest, AuthError } from '../api/_lib/auth.js'
import { generateJson, GeminiError } from '../api/_lib/gemini.js'
import suggestTagHandler from '../api/suggest-tag.js'
import parseTaskHandler from '../api/parse-task.js'
import planDayHandler from '../api/plan-day.js'

function fakeReq({ method = 'POST', body = {}, headers = { authorization: 'Bearer token' } } = {}) {
  return { method, body, headers }
}

/** A chainable res.status(x).json(y), recording exactly what was sent —
    real Vercel/Node response objects support this same chain. */
function fakeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      res.statusCode = code
      return res
    },
    json(payload) {
      res.body = payload
      return res
    },
  }
  return res
}

beforeEach(() => {
  vi.resetAllMocks()
  verifyRequest.mockResolvedValue('uid-1')
})

describe('every route — shared request handling', () => {
  it.each([
    ['suggest-tag', suggestTagHandler, { title: 'Standup', tags: [{ id: 'work', name: 'Work' }] }],
    ['parse-task', parseTaskHandler, { text: 'lunch tomorrow', today: '2026-08-24' }],
    ['plan-day', planDayHandler, { tasks: [{ id: 't1' }], slots: [{ startMin: 0, endMin: 60 }] }],
  ])('%s rejects a non-POST method with 405, before touching auth or Gemini', async (_name, handler, body) => {
    const res = fakeRes()
    await handler(fakeReq({ method: 'GET', body }), res)
    expect(res.statusCode).toBe(405)
    expect(verifyRequest).not.toHaveBeenCalled()
    expect(generateJson).not.toHaveBeenCalled()
  })

  it.each([
    ['suggest-tag', suggestTagHandler, { title: 'Standup', tags: [{ id: 'work', name: 'Work' }] }],
    ['parse-task', parseTaskHandler, { text: 'lunch tomorrow', today: '2026-08-24' }],
    ['plan-day', planDayHandler, { tasks: [{ id: 't1' }], slots: [{ startMin: 0, endMin: 60 }] }],
  ])('%s answers 401 and never calls Gemini when auth fails', async (_name, handler, body) => {
    verifyRequest.mockRejectedValue(new AuthError(401, 'Invalid or expired token.'))
    const res = fakeRes()
    await handler(fakeReq({ body }), res)
    expect(res.statusCode).toBe(401)
    expect(generateJson).not.toHaveBeenCalled()
  })

  it.each([
    ['suggest-tag', suggestTagHandler],
    ['parse-task', parseTaskHandler],
    ['plan-day', planDayHandler],
  ])('%s propagates a GeminiError\'s real status (e.g. 429) rather than masking it as 500', async (_name, handler) => {
    generateJson.mockRejectedValue(new GeminiError(429, 'Rate limited.'))
    const body =
      handler === suggestTagHandler
        ? { title: 'Standup', tags: [{ id: 'work', name: 'Work' }] }
        : handler === parseTaskHandler
          ? { text: 'lunch tomorrow', today: '2026-08-24' }
          : { tasks: [{ id: 't1', title: 'x', durationMin: 30, priority: 'normal' }], slots: [{ startMin: 0, endMin: 60 }] }
    const res = fakeRes()
    await handler(fakeReq({ body }), res)
    expect(res.statusCode).toBe(429)
  })
})

describe('suggest-tag', () => {
  it('400s when title is missing', async () => {
    const res = fakeRes()
    await suggestTagHandler(fakeReq({ body: { tags: [] } }), res)
    expect(res.statusCode).toBe(400)
  })

  it('returns tagId: null without calling Gemini when there are no tags to choose from', async () => {
    const res = fakeRes()
    await suggestTagHandler(fakeReq({ body: { title: 'Standup', tags: [] } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ tagId: null })
    expect(generateJson).not.toHaveBeenCalled()
  })

  it('never hands back a tagId that was not in the offered set — even if Gemini invents one', async () => {
    generateJson.mockResolvedValue({ tagId: 'made-up-id' })
    const res = fakeRes()
    await suggestTagHandler(fakeReq({ body: { title: 'Standup', tags: [{ id: 'work', name: 'Work' }] } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ tagId: null })
  })

  it('passes through a real, offered tagId', async () => {
    generateJson.mockResolvedValue({ tagId: 'work' })
    const res = fakeRes()
    await suggestTagHandler(fakeReq({ body: { title: 'Standup', tags: [{ id: 'work', name: 'Work' }] } }), res)
    expect(res.body).toEqual({ tagId: 'work' })
  })
})

describe('parse-task', () => {
  it('400s when text is missing', async () => {
    const res = fakeRes()
    await parseTaskHandler(fakeReq({ body: { today: '2026-08-24' } }), res)
    expect(res.statusCode).toBe(400)
  })

  it("400s when today isn't a YYYY-MM-DD key", async () => {
    const res = fakeRes()
    await parseTaskHandler(fakeReq({ body: { text: 'lunch tomorrow', today: 'not-a-date' } }), res)
    expect(res.statusCode).toBe(400)
  })

  it('sanitizes a malformed date from Gemini to null rather than passing it through', async () => {
    generateJson.mockResolvedValue({ title: 'Lunch', date: '2026/08/25', startMin: 780, durationMin: 60 })
    const res = fakeRes()
    await parseTaskHandler(fakeReq({ body: { text: 'lunch tomorrow at 1pm', today: '2026-08-24' } }), res)
    expect(res.body.date).toBe(null)
    // A start time with no valid date to belong to is dropped too — the
    // same rule normalizeTask enforces everywhere else in this app.
    expect(res.body.startMin).toBe(null)
  })

  it('sanitizes an out-of-range startMin to null', async () => {
    generateJson.mockResolvedValue({ title: 'Lunch', date: '2026-08-25', startMin: 9999, durationMin: 60 })
    const res = fakeRes()
    await parseTaskHandler(fakeReq({ body: { text: 'lunch tomorrow', today: '2026-08-24' } }), res)
    expect(res.body.startMin).toBe(null)
    expect(res.body.date).toBe('2026-08-25')
  })

  it('passes a fully valid response straight through', async () => {
    const shape = { title: 'Lunch', date: '2026-08-25', startMin: 780, durationMin: 60 }
    generateJson.mockResolvedValue(shape)
    const res = fakeRes()
    await parseTaskHandler(fakeReq({ body: { text: 'lunch tomorrow at 1pm', today: '2026-08-24' } }), res)
    expect(res.body).toEqual(shape)
  })
})

describe('plan-day', () => {
  const tasks = [{ id: 't1', title: 'Write report', durationMin: 60, priority: 'high' }]
  const slots = [{ startMin: 9 * 60, endMin: 11 * 60 }]

  it('returns an empty plan without calling Gemini when there are no tasks', async () => {
    const res = fakeRes()
    await planDayHandler(fakeReq({ body: { tasks: [], slots } }), res)
    expect(res.body).toEqual({ placements: [] })
    expect(generateJson).not.toHaveBeenCalled()
  })

  it('returns an empty plan without calling Gemini when there are no free slots', async () => {
    const res = fakeRes()
    await planDayHandler(fakeReq({ body: { tasks, slots: [] } }), res)
    expect(res.body).toEqual({ placements: [] })
    expect(generateJson).not.toHaveBeenCalled()
  })

  it('discards an invalid plan (overlapping/out-of-slot) rather than forwarding it', async () => {
    // Runs past the end of the only slot given (9-11, i.e. 120 min; this
    // starts at 10:30 and needs 60, ending at 11:30).
    generateJson.mockResolvedValue({ placements: [{ taskId: 't1', startMin: 10 * 60 + 30 }] })
    const res = fakeRes()
    await planDayHandler(fakeReq({ body: { tasks, slots } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ placements: [] })
  })

  it('forwards a genuinely valid plan', async () => {
    const placements = [{ taskId: 't1', startMin: 9 * 60 }]
    generateJson.mockResolvedValue({ placements })
    const res = fakeRes()
    await planDayHandler(fakeReq({ body: { tasks, slots } }), res)
    expect(res.body).toEqual({ placements })
  })
})
