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
import enrichTaskHandler from '../api/enrich-task.js'

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
  const enrichBody = { title: 'Deep clean kitchen', today: '2026-08-24' }

  it.each([
    ['suggest-tag', suggestTagHandler, { title: 'Standup', tags: [{ id: 'work', name: 'Work' }] }],
    ['parse-task', parseTaskHandler, { text: 'lunch tomorrow', today: '2026-08-24' }],
    ['plan-day', planDayHandler, { tasks: [{ id: 't1' }], slots: [{ startMin: 0, endMin: 60 }] }],
    ['enrich-task', enrichTaskHandler, enrichBody],
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
    ['enrich-task', enrichTaskHandler, enrichBody],
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
    ['enrich-task', enrichTaskHandler],
  ])('%s propagates a GeminiError\'s real status (e.g. 429) rather than masking it as 500', async (_name, handler) => {
    generateJson.mockRejectedValue(new GeminiError(429, 'Rate limited.'))
    const body =
      handler === suggestTagHandler
        ? { title: 'Standup', tags: [{ id: 'work', name: 'Work' }] }
        : handler === parseTaskHandler
          ? { text: 'lunch tomorrow', today: '2026-08-24' }
          : handler === planDayHandler
            ? { tasks: [{ id: 't1', title: 'x', durationMin: 30, priority: 'normal' }], slots: [{ startMin: 0, endMin: 60 }] }
            : enrichBody
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

describe('enrich-task', () => {
  const tags = [{ id: 'home', name: 'Home' }]
  const slots = [{ startMin: 9 * 60, endMin: 11 * 60 }]
  const base = { title: 'Deep clean kitchen', today: '2026-08-24', tags, slots }

  it('400s when title is missing', async () => {
    const res = fakeRes()
    await enrichTaskHandler(fakeReq({ body: { today: '2026-08-24' } }), res)
    expect(res.statusCode).toBe(400)
  })

  it("400s when today isn't a YYYY-MM-DD key", async () => {
    const res = fakeRes()
    await enrichTaskHandler(fakeReq({ body: { title: 'Deep clean kitchen', today: 'not-a-date' } }), res)
    expect(res.statusCode).toBe(400)
  })

  it('never hands back a tagId that was not in the offered set — even if Gemini invents one', async () => {
    generateJson.mockResolvedValue({
      tagId: 'made-up-id',
      durationMin: null,
      startMin: null,
      subtasks: [],
      notes: null,
    })
    const res = fakeRes()
    await enrichTaskHandler(fakeReq({ body: base }), res)
    expect(res.body.tagId).toBe(null)
  })

  it('sanitizes an out-of-range durationMin to null', async () => {
    generateJson.mockResolvedValue({ tagId: null, durationMin: 5000, startMin: null, subtasks: [], notes: null })
    const res = fakeRes()
    await enrichTaskHandler(fakeReq({ body: base }), res)
    expect(res.body.durationMin).toBe(null)
  })

  it('drops startMin when it would run past the end of every real slot given', async () => {
    // The only slot given is 9-11 (120 min); this starts at 10:30 and needs
    // 60, ending at 11:30 — never trust the model's arithmetic about time.
    generateJson.mockResolvedValue({
      tagId: null,
      durationMin: 60,
      startMin: 10 * 60 + 30,
      subtasks: [],
      notes: null,
    })
    const res = fakeRes()
    await enrichTaskHandler(fakeReq({ body: base }), res)
    expect(res.body.startMin).toBe(null)
  })

  it('keeps a startMin that fits entirely inside a real slot alongside its duration', async () => {
    generateJson.mockResolvedValue({ tagId: null, durationMin: 60, startMin: 9 * 60, subtasks: [], notes: null })
    const res = fakeRes()
    await enrichTaskHandler(fakeReq({ body: base }), res)
    expect(res.body.startMin).toBe(9 * 60)
    expect(res.body.durationMin).toBe(60)
  })

  it('drops blank checklist items and caps the list at 8', async () => {
    const subtasks = ['  ', 'Real step', ...Array.from({ length: 10 }, (_, i) => `Step ${i}`)]
    generateJson.mockResolvedValue({ tagId: null, durationMin: null, startMin: null, subtasks, notes: null })
    const res = fakeRes()
    await enrichTaskHandler(fakeReq({ body: base }), res)
    expect(res.body.subtasks.length).toBe(8)
    expect(res.body.subtasks).not.toContain('  ')
    expect(res.body.subtasks[0]).toBe('Real step')
  })

  it('turns a blank notes string into null rather than passing whitespace through', async () => {
    generateJson.mockResolvedValue({ tagId: null, durationMin: null, startMin: null, subtasks: [], notes: '   ' })
    const res = fakeRes()
    await enrichTaskHandler(fakeReq({ body: base }), res)
    expect(res.body.notes).toBe(null)
  })

  it('forwards a genuinely valid, fully-populated answer', async () => {
    const shape = { tagId: 'home', durationMin: 60, startMin: 9 * 60, subtasks: ['Step one'], notes: 'A tip.' }
    generateJson.mockResolvedValue(shape)
    const res = fakeRes()
    await enrichTaskHandler(fakeReq({ body: base }), res)
    expect(res.body).toEqual(shape)
  })
})
