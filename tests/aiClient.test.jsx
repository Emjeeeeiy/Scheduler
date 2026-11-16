/* aiClient.js's one job is never letting a network problem become the
 * caller's problem — every one of these functions backs a heuristic that
 * already has an answer on screen (or, for quick-add, a title someone can
 * still save as typed). This file exists to prove that contract holds for
 * every real failure mode: signed out, offline, a slow response, Gemini's
 * free-tier rate limit, and a response that isn't the JSON it claims to be.
 *
 * Named .test.jsx (not .js) purely to route through vitest — see
 * vitest.config.js's own comment on why that split exists. Nothing here
 * renders a component; `fetch` and firebase.js's `auth` are mocked instead.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { aiScheduleAi, enrichTaskAi, notePlanAi, parseTaskAi, planDayAi, suggestTagAi } from '../src/lib/aiClient.js'

// A mutable binding inside the mock factory, the same pattern used
// elsewhere in this suite (see itemDetail.test.jsx) for a module whose
// exported value needs to change between tests without vi.resetModules().
let mockCurrentUser = { getIdToken: () => Promise.resolve('a-fake-token') }

vi.mock('../src/firebase.js', () => ({
  get auth() {
    return { currentUser: mockCurrentUser }
  },
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  mockCurrentUser = { getIdToken: () => Promise.resolve('a-fake-token') }
})

function stubFetch(impl) {
  const fn = vi.fn(impl)
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('aiClient — the shared fall-back-to-null contract', () => {
  it('sends the bearer token and the request body it was given', async () => {
    const fetch = stubFetch(async () => new Response(JSON.stringify({ tagId: 'work' }), { status: 200 }))

    const tagId = await suggestTagAi({ title: 'Standup', tags: [{ id: 'work', name: 'Work' }] })

    expect(tagId).toBe('work')
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/suggest-tag')
    expect(init.headers.Authorization).toBe('Bearer a-fake-token')
    expect(JSON.parse(init.body)).toEqual({ title: 'Standup', tags: [{ id: 'work', name: 'Work' }] })
  })

  it('returns null without ever calling fetch when nobody is signed in', async () => {
    mockCurrentUser = null
    const fetch = stubFetch(async () => new Response('{}', { status: 200 }))

    const tagId = await suggestTagAi({ title: 'Standup', tags: [] })

    expect(tagId).toBe(null)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('falls back to null on a 429 — the free-tier rate limit is an expected outcome, not an error', async () => {
    stubFetch(async () => new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 }))
    const tagId = await suggestTagAi({ title: 'Standup', tags: [{ id: 'work', name: 'Work' }] })
    expect(tagId).toBe(null)
  })

  it('falls back to null on a 500', async () => {
    stubFetch(async () => new Response(JSON.stringify({ error: 'boom' }), { status: 500 }))
    const result = await parseTaskAi({ text: 'lunch tomorrow', today: '2026-08-24' })
    expect(result).toBe(null)
  })

  it('falls back to null when the response body is not valid JSON', async () => {
    stubFetch(async () => new Response('<html>not json</html>', { status: 200 }))
    const result = await planDayAi({ tasks: [], slots: [] })
    expect(result).toBe(null)
  })

  it('falls back to null when the network request itself rejects (offline)', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    const tagId = await suggestTagAi({ title: 'Standup', tags: [{ id: 'work', name: 'Work' }] })
    expect(tagId).toBe(null)
  })

  it('aborts and falls back to null when the server never responds in time', async () => {
    vi.useFakeTimers()
    stubFetch(
      (url, init) =>
        new Promise((resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )

    const pending = suggestTagAi({ title: 'Standup', tags: [{ id: 'work', name: 'Work' }] })
    await vi.advanceTimersByTimeAsync(9000)
    const result = await pending

    expect(result).toBe(null)
    vi.useRealTimers()
  })

  it('getIdToken() itself rejecting still resolves to null, not a thrown error', async () => {
    mockCurrentUser = {
      getIdToken: () => Promise.reject(new Error('token refresh failed')),
    }
    const fetch = stubFetch(async () => new Response('{}', { status: 200 }))

    const result = await parseTaskAi({ text: 'lunch tomorrow', today: '2026-08-24' })

    expect(result).toBe(null)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('suggestTagAi treats a response with no tagId field as null, not undefined leaking out', async () => {
    stubFetch(async () => new Response(JSON.stringify({}), { status: 200 }))
    const tagId = await suggestTagAi({ title: 'Standup', tags: [] })
    expect(tagId).toBe(null)
  })

  it('planDayAi treats a response with no placements field as null', async () => {
    stubFetch(async () => new Response(JSON.stringify({}), { status: 200 }))
    const result = await planDayAi({ tasks: [], slots: [] })
    expect(result).toBe(null)
  })

  it('parseTaskAi returns the parsed shape through untouched on success', async () => {
    const shape = { title: 'Lunch', date: '2026-08-25', startMin: 780, durationMin: null }
    stubFetch(async () => new Response(JSON.stringify(shape), { status: 200 }))
    const result = await parseTaskAi({ text: 'lunch tomorrow at 1pm', today: '2026-08-24' })
    expect(result).toEqual(shape)
  })

  it('enrichTaskAi posts the whole payload it was given and returns the shape through untouched', async () => {
    const shape = { tagId: 'home', durationMin: 45, startMin: 540, subtasks: ['Step one'], notes: 'A tip.' }
    const fetch = stubFetch(async () => new Response(JSON.stringify(shape), { status: 200 }))
    const payload = {
      title: 'Deep clean kitchen',
      today: '2026-08-24',
      tags: [{ id: 'home', name: 'Home' }],
      slots: [{ startMin: 480, endMin: 600 }],
      history: [],
      filled: { time: false, tagId: false, subtasks: false, notes: false },
    }

    const result = await enrichTaskAi(payload)

    expect(result).toEqual(shape)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(payload)
  })

  it('enrichTaskAi falls back to null on a 429, same as every other AI call', async () => {
    stubFetch(async () => new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 }))
    const result = await enrichTaskAi({ title: 'Deep clean kitchen', today: '2026-08-24' })
    expect(result).toBe(null)
  })

  it('aiScheduleAi posts the whole payload it was given and returns the shape through untouched', async () => {
    const shape = { status: 'create', question: null, items: [{ kind: 'task', title: 'Gym' }] }
    const fetch = stubFetch(async () => new Response(JSON.stringify(shape), { status: 200 }))
    const payload = {
      messages: [{ role: 'user', content: 'gym monday 7am' }],
      today: '2026-08-24',
      nowMin: 480,
      tags: [{ id: 'health', name: 'Health' }],
      slots: [{ date: '2026-08-25', startMin: 420, endMin: 600 }],
    }

    const result = await aiScheduleAi(payload)

    expect(result).toEqual(shape)
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(payload)
  })

  it('aiScheduleAi falls back to null on a malformed JSON body, same as every other AI call', async () => {
    stubFetch(async () => new Response('<html>not json</html>', { status: 200 }))
    const result = await aiScheduleAi({ messages: [{ role: 'user', content: 'gym monday' }], today: '2026-08-24' })
    expect(result).toBe(null)
  })

  it('aiScheduleAi falls back to null on a 429', async () => {
    stubFetch(async () => new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 }))
    const result = await aiScheduleAi({ messages: [{ role: 'user', content: 'gym monday' }], today: '2026-08-24' })
    expect(result).toBe(null)
  })

  it('notePlanAi posts the note, its day and today to /api/note-tasks and returns the tasks', async () => {
    const tasks = [{ title: 'Call Ana', date: '2026-08-25', startMin: 900, durationMin: null }]
    const fetch = stubFetch(async () => new Response(JSON.stringify({ tasks }), { status: 200 }))
    const payload = { text: '[ ] call Ana tomorrow at 3pm', day: '2026-08-24', today: '2026-08-24' }

    const result = await notePlanAi(payload)

    expect(result).toEqual(tasks)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('/api/note-tasks')
    expect(init.headers.Authorization).toBe('Bearer a-fake-token')
    expect(JSON.parse(init.body)).toEqual(payload)
  })

  it('notePlanAi tells "found nothing" ([]) apart from "could not reach AI" (null)', async () => {
    // The Journal says a different thing for each, so this is the one AI call
    // where an empty answer must not be collapsed into null.
    stubFetch(async () => new Response(JSON.stringify({ tasks: [] }), { status: 200 }))
    expect(await notePlanAi({ text: 'just prose', day: '2026-08-24', today: '2026-08-24' })).toEqual([])
  })

  it.each([
    ['a 429', () => new Response(JSON.stringify({ error: 'busy' }), { status: 429 })],
    ['a 403 (email not confirmed)', () => new Response(JSON.stringify({ error: 'verify' }), { status: 403 })],
    ['a body that is not JSON', () => new Response('<html>no</html>', { status: 200 })],
    ['a body with no tasks field', () => new Response(JSON.stringify({}), { status: 200 })],
    ['a tasks field that is not a list', () => new Response(JSON.stringify({ tasks: 'x' }), { status: 200 })],
  ])('notePlanAi falls back to null on %s', async (_label, respond) => {
    stubFetch(async () => respond())
    expect(await notePlanAi({ text: 'x', day: '2026-08-24', today: '2026-08-24' })).toBe(null)
  })

  it('notePlanAi falls back to null, without a request, when nobody is signed in', async () => {
    mockCurrentUser = null
    const fetch = stubFetch(async () => new Response('{}', { status: 200 }))
    expect(await notePlanAi({ text: 'x', day: '2026-08-24', today: '2026-08-24' })).toBe(null)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('notePlanAi aborts and falls back to null when the server never responds in time', async () => {
    vi.useFakeTimers()
    stubFetch(
      (url, init) =>
        new Promise((resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )

    const pending = notePlanAi({ text: 'x', day: '2026-08-24', today: '2026-08-24' })
    await vi.advanceTimersByTimeAsync(16000)
    expect(await pending).toBe(null)
    vi.useRealTimers()
  })

  it('aiScheduleAi aborts and falls back to null when the server never responds in time', async () => {
    vi.useFakeTimers()
    stubFetch(
      (url, init) =>
        new Promise((resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )

    const pending = aiScheduleAi({ messages: [{ role: 'user', content: 'gym monday' }], today: '2026-08-24' })
    await vi.advanceTimersByTimeAsync(30000)
    const result = await pending

    expect(result).toBe(null)
    vi.useRealTimers()
  })
})
