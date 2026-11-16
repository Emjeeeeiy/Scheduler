/* The whole /mcp endpoint, end to end: a real HTTP server running
 * mcp/handler.js, a store over an in-memory Firestore stand-in, and the
 * official MCP SDK client on the other side of the wire.
 *
 * What this does NOT cover: firebase-admin itself, a live Firestore, or
 * Vercel's runtime. Those need the real project — see README-mcp.md for the
 * manual check. What it DOES cover is the wiring: auth ordering, CORS on every
 * response, the stateless transport, tool and resource behaviour, and that
 * nothing outside the configured account's documents is ever touched.
 *
 * Named .test.jsx to route through vitest's node project (vitest.config.js).
 */
import http from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createMcpHandler } from '../mcp/handler.js'
import { createScheduleStore } from '../mcp/store.js'
import { FakeAdminFirestore, deleteField, fieldPath } from './fakeAdminFirestore.js'

const API_KEY = 'api-key-'.padEnd(48, 'a')
const URL_KEY = 'url-key-'.padEnd(48, 'b')
const UID = 'user123'
const OTHER = 'someoneElse'

// 2026-08-24 02:00 UTC is Monday 10:00 in Manila.
const NOW = new Date('2026-08-24T02:00:00Z')
const TODAY = '2026-08-24'
const TOMORROW = '2026-08-25'

/* The tool set at each MCP_ACCESS level; each includes the one before. */
const READ_TOOLS = ['find_journal_notes', 'find_tasks', 'get_schedule', 'read_journal_note']
const WRITE_TOOLS = [
  ...READ_TOOLS,
  'append_to_journal_note',
  'create_event',
  'create_journal_note',
  'create_task',
  'set_task_done',
].sort()
const DELETE_TOOLS = ['delete_event', 'delete_journal_note', 'delete_task']
const FULL_TOOLS = [...WRITE_TOOLS, ...DELETE_TOOLS].sort()

/* Note-body builders, in the document shapes the editor stores. */
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const heading = (text) => ({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text }] })
const taskList = (...items) => ({
  type: 'taskList',
  content: items.map(([checked, text]) => ({ type: 'taskItem', attrs: { checked }, content: [para(text)] })),
})
const noteBody = (...blocks) => JSON.stringify({ type: 'doc', content: blocks })

const baseEnv = (extra = {}) => ({
  MCP_API_KEY: API_KEY,
  MCP_USER_UID: UID,
  MCP_TIMEZONE: 'Asia/Manila',
  FIREBASE_SERVICE_ACCOUNT: 'present-but-unused-here',
  ...extra,
})

function seededDb() {
  const db = new FakeAdminFirestore()
  const u = `users/${UID}`
  db.seed(`${u}/tags/work`, { name: 'Work', slot: 'blue', order: 0 })
  db.seed(`${u}/tags/deep`, { name: 'Deep work', slot: 'violet', order: 1, parentId: 'work' })
  db.seed(`${u}/tasks/task1`, {
    title: 'Write report',
    date: TODAY,
    startMin: 9 * 60 + 30,
    durationMin: 60,
    tagId: 'work',
    priority: 'high',
    createdAt: 1,
    updatedAt: 1,
  })
  db.seed(`${u}/tasks/habit1`, {
    title: 'Stretch',
    date: '2026-08-17',
    recurrence: { freq: 'weekly', days: [1, 2, 3, 4, 5], anchor: '2026-08-17' },
    createdAt: 2,
    updatedAt: 2,
  })
  db.seed(`${u}/tasks/inbox1`, { title: 'Sort photos', createdAt: 3, updatedAt: 3 })
  db.seed(`${u}/tasks/gone`, { title: 'Trashed task', date: TODAY, deletedAt: 99, createdAt: 4 })
  db.seed(`${u}/events/ev1`, {
    title: 'Standup',
    startDate: TODAY,
    endDate: TODAY,
    startMin: 13 * 60,
    endMin: 13 * 60 + 30,
    createdAt: 1,
  })
  db.seed(`${u}/journal/n1`, { title: 'Monday', dayKey: TODAY, createdAt: 1, updatedAt: 2 })
  db.seed(`${u}/journal/n1/content/body`, {
    schemaVersion: 1,
    json: JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Remember the budget call' }] }],
    }),
  })
  // A repeating event (Tuesdays), for skipping one day of a series.
  db.seed(`${u}/events/ev2`, {
    title: 'Weekly sync',
    startDate: '2026-08-18',
    endDate: '2026-08-18',
    startMin: 16 * 60,
    endMin: 16 * 60 + 30,
    recurrence: { freq: 'weekly', days: [2], anchor: '2026-08-18' },
    createdAt: 2,
  })
  // More notes: a pinned general note with a ticked item, a trashed one, one a
  // newer build wrote (unreadable here), and one close to the size limit.
  db.seed(`${u}/journal/n2`, {
    title: 'Ideas',
    excerpt: 'Plan done thing open thing',
    dayKey: null,
    pinned: true,
    createdAt: 5,
    updatedAt: 50,
    deletedAt: null,
  })
  db.seed(`${u}/journal/n2/content/body`, {
    schemaVersion: 1,
    json: noteBody(heading('Plan'), taskList([true, 'done thing'], [false, 'open thing'])),
  })
  db.seed(`${u}/journal/n3`, { title: 'Old trashed note', dayKey: '2026-08-20', createdAt: 3, updatedAt: 3, deletedAt: 77 })
  db.seed(`${u}/journal/n3/content/body`, { schemaVersion: 1, json: noteBody(para('in the trash')) })
  db.seed(`${u}/journal/n4`, { title: 'From the future', dayKey: null, createdAt: 4, updatedAt: 4 })
  db.seed(`${u}/journal/n4/content/body`, { schemaVersion: 99, json: noteBody(para('written by a newer build')) })
  db.seed(`${u}/journal/n5`, { title: 'Huge', dayKey: null, createdAt: 6, updatedAt: 6 })
  db.seed(`${u}/journal/n5/content/body`, { schemaVersion: 1, json: noteBody(para('x'.repeat(940_000))) })
  // Another account's data — must never surface, whatever the assistant asks.
  db.seed(`users/${OTHER}/tasks/secret`, { title: 'Other persons secret', date: TODAY, createdAt: 1 })
  db.seed(`users/${OTHER}/journal/n9`, { title: 'Private', dayKey: TODAY, createdAt: 1 })
  return db
}

let open = []
afterEach(async () => {
  await Promise.all(open.map((close) => close()))
  open = []
  vi.restoreAllMocks()
})
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

async function start({ env = baseEnv(), limit, db = seededDb() } = {}) {
  let clock = NOW
  const handler = createMcpHandler({
    env,
    limit,
    now: () => clock,
    createStore: (config) =>
      createScheduleStore({ db, uid: config.uid, deleteField, fieldPath, now: () => clock.getTime() }),
  })
  const server = http.createServer(async (req, res) => {
    if (req.method === 'POST') {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      req.body = Buffer.concat(chunks).toString('utf8')
    }
    return handler(req, res)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  open.push(() => new Promise((resolve) => server.close(resolve)))
  return { base, db, tick: (ms) => (clock = new Date(clock.getTime() + ms)) }
}

const INITIALIZE = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'raw-test', version: '0.0.0' },
  },
}

const post = (base, { path = '/mcp', headers = {}, body = INITIALIZE, raw } = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: raw ?? JSON.stringify(body),
  })

const bearer = (key = API_KEY) => ({ Authorization: `Bearer ${key}` })

async function connect(base, { path = '/mcp', headers = bearer() } = {}) {
  const client = new Client({ name: 'test-client', version: '0.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(`${base}${path}`), { requestInit: { headers } })
  await client.connect(transport)
  open.push(() => client.close())
  return client
}

const textOf = (result) => result.content.map((c) => c.text).join('\n')

/** A tool call that must fail, whether the SDK reports it as an isError result
    or as a protocol error — both are a refusal; neither may write anything. */
async function refused(client, name, args) {
  try {
    const result = await client.callTool({ name, arguments: args })
    expect(result.isError, `${name} should have been refused`).toBe(true)
    return textOf(result)
  } catch (caught) {
    return String(caught.message)
  }
}

/* ------------------------------------------------------------------ http -- */

describe('the HTTP layer', () => {
  it('answers a CORS preflight with 204 and no credentials needed', async () => {
    const { base } = await start()
    const res = await fetch(`${base}/mcp`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://claude.ai',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type,mcp-protocol-version',
      },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-headers').toLowerCase()).toContain('authorization')
    expect(res.headers.get('access-control-allow-headers').toLowerCase()).toContain('mcp-protocol-version')
    expect(res.headers.get('access-control-allow-methods')).toContain('POST')
  })

  it('rejects a call with no key — with CORS headers, so a browser can read the 401', async () => {
    const { base } = await start()
    const res = await post(base, { headers: { Origin: 'https://claude.ai' } })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toMatch(/^Bearer/)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.json()
    expect(body.error.message).toBe('Unauthorized.')
  })

  it('rejects wrong keys of any length without erroring', async () => {
    const { base } = await start()
    for (const key of ['wrong', 'x'.repeat(500), `${API_KEY}!`, API_KEY.slice(0, -1)]) {
      expect((await post(base, { headers: bearer(key) })).status, key.slice(0, 12)).toBe(401)
    }
  })

  it('does not run the limiter or touch the store for an unauthenticated caller', async () => {
    const limit = vi.fn()
    const db = seededDb()
    const { base } = await start({ limit, db })
    await post(base)
    await post(base, { headers: bearer('nope') })
    expect(limit).not.toHaveBeenCalled()
    expect(db.writes).toEqual([])
  })

  it('refuses GET and DELETE (stateless: no stream to offer)', async () => {
    const { base } = await start()
    for (const method of ['GET', 'DELETE']) {
      const res = await fetch(`${base}/mcp`, { method, headers: bearer() })
      expect(res.status, method).toBe(405)
      expect(res.headers.get('allow')).toBe('POST, OPTIONS')
    }
  })

  it('answers 400 to a body that is not JSON', async () => {
    const { base } = await start()
    const res = await post(base, { headers: bearer(), raw: '{not json' })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe(-32700)
  })

  it('fails closed when not configured, without saying why', async () => {
    const { base } = await start({ env: baseEnv({ MCP_USER_UID: '' }) })
    const res = await post(base, { headers: bearer() })
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).toContain('not configured')
    expect(text).not.toContain('MCP_USER_UID')
    // ...and the reason did reach the server log.
    expect(console.warn.mock.calls.flat().join(' ')).toContain('MCP_USER_UID')
  })

  it('never lets anyone in when the key is too short, even by sending it', async () => {
    const { base } = await start({ env: baseEnv({ MCP_API_KEY: 'short' }) })
    expect((await post(base, { headers: bearer('short') })).status).toBe(401)
  })

  it('answers 429 once the limiter says the budget is spent', async () => {
    const limit = vi.fn().mockRejectedValue(Object.assign(new Error('spent'), { status: 429 }))
    const { base } = await start({ limit })
    const res = await post(base, { headers: bearer() })
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('60')
    expect(limit).toHaveBeenCalledWith(UID)
  })

  it('with an origin allow-list, only listed origins are answered', async () => {
    const { base } = await start({ env: baseEnv({ MCP_ALLOWED_ORIGINS: 'https://claude.ai' }) })
    const allowed = await post(base, { headers: { Origin: 'https://claude.ai' } })
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://claude.ai')
    const other = await post(base, { headers: { Origin: 'https://evil.example' } })
    expect(other.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('the secret-URL form', () => {
  it('is off unless MCP_URL_KEY is set', async () => {
    const { base } = await start()
    expect((await post(base, { path: `/mcp/k/${URL_KEY}` })).status).toBe(401)
    expect((await post(base, { path: `/mcp?key=${URL_KEY}` })).status).toBe(401)
  })

  it('works, with no header, when MCP_URL_KEY is set — and only for the right key', async () => {
    const { base } = await start({ env: baseEnv({ MCP_URL_KEY: URL_KEY }) })
    expect((await post(base, { path: `/mcp/k/${URL_KEY}` })).status).toBe(200)
    expect((await post(base, { path: `/mcp?key=${URL_KEY}` })).status).toBe(200)
    expect((await post(base, { path: `/mcp/k/${'z'.repeat(48)}` })).status).toBe(401)
    expect((await post(base, { path: `/mcp/k/${API_KEY}` })).status).toBe(401)
    expect((await post(base, { headers: bearer(URL_KEY) })).status).toBe(401)
    expect((await post(base, { headers: bearer() })).status).toBe(200)
  })

  it('carries a whole session, not just the first request', async () => {
    const { base } = await start({ env: baseEnv({ MCP_URL_KEY: URL_KEY }) })
    const client = await connect(base, { path: `/mcp/k/${URL_KEY}`, headers: {} })
    const { tools } = await client.listTools()
    expect(tools).toHaveLength(9) // the default access level, "write"
  })
})

/* -------------------------------------------------------------- protocol -- */

describe('an MCP session', () => {
  it('initializes and describes the server', async () => {
    const { base } = await start()
    const client = await connect(base)
    expect(client.getServerVersion().name).toBe('cadence')
    expect(client.getInstructions()).toMatch(/personal planner/)
  })

  it('by default lists nine tools and two resources, with honest annotations', async () => {
    const { base } = await start()
    const client = await connect(base)
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(WRITE_TOOLS)

    const by = Object.fromEntries(tools.map((t) => [t.name, t]))
    for (const name of READ_TOOLS) expect(by[name].annotations.readOnlyHint, name).toBe(true)
    for (const name of WRITE_TOOLS.filter((n) => !READ_TOOLS.includes(n))) {
      expect(by[name].annotations.readOnlyHint, name).toBe(false)
      expect(by[name].annotations.destructiveHint, name).toBe(false)
    }
    expect(by.set_task_done.annotations.idempotentHint).toBe(true)
    for (const tool of tools) {
      expect(tool.description.length, tool.name).toBeGreaterThan(40)
      expect(tool.inputSchema.type).toBe('object')
    }
    // A real calendar date shows up as one in the schema the model reads.
    expect(by.create_task.inputSchema.properties.date.format).toBe('date')

    const { resources } = await client.listResources()
    expect(resources.map((r) => r.uri)).toEqual(
      expect.arrayContaining(['cadence://tags', `cadence://day/${TODAY}`, `cadence://day/${TOMORROW}`]),
    )
    const { resourceTemplates } = await client.listResourceTemplates()
    expect(resourceTemplates.map((t) => t.uriTemplate)).toContain('cadence://day/{date}')
  })
})

describe('get_schedule', () => {
  it('reports today in the configured zone, with tasks, events and trimmed free time', async () => {
    const { base } = await start()
    const client = await connect(base)
    const result = await client.callTool({ name: 'get_schedule', arguments: {} })
    expect(result.isError).toBeFalsy()
    const data = result.structuredContent
    expect(JSON.parse(textOf(result))).toEqual(data)

    expect(data).toMatchObject({ timeZone: 'Asia/Manila', today: TODAY, now: '10:00', from: TODAY, to: TODAY })
    const [day] = data.days
    expect(day.weekday).toBe('Monday')
    expect(day.tasks.map((t) => t.title)).toEqual(['Stretch', 'Write report'])
    expect(day.tasks.find((t) => t.title === 'Write report')).toMatchObject({
      id: 'task1',
      start: '09:30',
      tag: 'Work',
      priority: 'high',
      done: false,
    })
    expect(day.tasks.find((t) => t.title === 'Stretch').id).toBe(`habit1~${TODAY}`)
    expect(day.events.map((e) => e.title)).toEqual(['Standup'])
    // Starts at "now" (10:00), skips the report's block and the 13:00 standup.
    expect(day.freeWindows).toEqual([
      { start: '10:30', end: '13:00', lengthMin: 150 },
      { start: '13:30', end: '20:00', lengthMin: 390 },
    ])
  })

  it('never includes trashed tasks or another account’s data', async () => {
    const { base } = await start()
    const client = await connect(base)
    const everything = [
      await client.callTool({ name: 'get_schedule', arguments: { days: 31 } }),
      await client.callTool({ name: 'find_tasks', arguments: { view: 'all', includeDone: true, limit: 100 } }),
    ]
      .map(textOf)
      .join('\n')
    expect(everything).not.toContain('Trashed task')
    expect(everything).not.toContain('secret')
    expect(everything).not.toContain('Private')
  })

  it('rejects an impossible date or window before touching the schedule', async () => {
    const { base } = await start()
    const client = await connect(base)
    await refused(client, 'get_schedule', { startDate: '2026-02-31' })
    await refused(client, 'get_schedule', { days: 0 })
    await refused(client, 'get_schedule', { days: 32 })
    await refused(client, 'get_schedule', { dayStart: '9am' })
    expect(await refused(client, 'get_schedule', { dayStart: '18:00', dayEnd: '09:00' })).toMatch(/later than/)
  })
})

describe('find_tasks', () => {
  it('lists the inbox and the whole set, with a repeat shown once as its rule', async () => {
    const { base } = await start()
    const client = await connect(base)
    const inbox = (await client.callTool({ name: 'find_tasks', arguments: { view: 'inbox' } })).structuredContent
    expect(inbox.tasks.map((t) => t.id)).toEqual(['inbox1'])

    const all = (await client.callTool({ name: 'find_tasks', arguments: { view: 'all' } })).structuredContent
    expect(all.total).toBe(3)
    expect(all.tasks.find((t) => t.id === 'habit1').repeats).toBe('Every weekday')
  })

  it('reports an unknown tag as an error the model can act on', async () => {
    const { base } = await start()
    const client = await connect(base)
    const message = await refused(client, 'find_tasks', { tag: 'Errands' })
    expect(message).toMatch(/No tag called "Errands"/)
    expect(message).toContain('Work / Deep work')
  })
})

describe('create_task', () => {
  const args = { title: 'Call dentist', date: TOMORROW, startTime: '14:00', durationMin: 45, tag: 'deep work', priority: 'high' }

  it('writes the same document the app would, then shows up in the schedule', async () => {
    const { base, db } = await start()
    const client = await connect(base)
    const result = await client.callTool({ name: 'create_task', arguments: args })
    expect(result.isError).toBeFalsy()
    const { id, task } = result.structuredContent
    expect(task).toMatchObject({ title: 'Call dentist', date: TOMORROW, start: '14:00', durationMin: 45, tag: 'Work / Deep work', priority: 'high', done: false })

    const stored = db.read(`users/${UID}/tasks/${id}`)
    expect(stored).toMatchObject({
      title: 'Call dentist',
      date: TOMORROW,
      startMin: 840,
      durationMin: 45,
      tagId: 'deep',
      priority: 'high',
      done: false,
      completedAt: null,
      deletedAt: null,
      recurrence: null,
      overrides: {},
    })
    // Plain millisecond numbers, as ScheduleContext writes — never a Timestamp.
    expect(stored.createdAt).toBe(NOW.getTime())
    expect(stored.updatedAt).toBe(NOW.getTime())

    const day = (await client.callTool({ name: 'get_schedule', arguments: { startDate: TOMORROW } })).structuredContent.days[0]
    expect(day.tasks.map((t) => t.id)).toContain(id)
  })

  it('without a date, goes to the inbox', async () => {
    const { base, db } = await start()
    const client = await connect(base)
    const { id, task } = (await client.callTool({ name: 'create_task', arguments: { title: '  Buy stamps  ' } })).structuredContent
    expect(task).toMatchObject({ title: 'Buy stamps', date: null, start: null, durationMin: 30, priority: 'normal' })
    expect(db.read(`users/${UID}/tasks/${id}`).date).toBeNull()
  })

  it('writes only under the configured account', async () => {
    const { base, db } = await start()
    const client = await connect(base)
    await client.callTool({ name: 'create_task', arguments: { title: 'x' } })
    expect(db.writes).toHaveLength(1)
    expect(db.writes[0].path.startsWith(`users/${UID}/tasks/`)).toBe(true)
  })

  it('refuses an unknown tag, a time with no date, and bad input — writing nothing', async () => {
    const { base, db } = await start()
    const client = await connect(base)
    expect(await refused(client, 'create_task', { title: 'x', tag: 'Errands' })).toMatch(/No tag called/)
    expect(await refused(client, 'create_task', { title: 'x', startTime: '09:00' })).toMatch(/needs a date/)
    await refused(client, 'create_task', { title: '   ' })
    await refused(client, 'create_task', { title: 'x'.repeat(201) })
    await refused(client, 'create_task', { title: 'x', date: '2026-02-31' })
    await refused(client, 'create_task', { title: 'x', date: TOMORROW, startTime: '25:00' })
    await refused(client, 'create_task', { title: 'x', durationMin: 2 })
    await refused(client, 'create_task', { title: 'x', priority: 'urgent' })
    expect(db.writes).toEqual([])
  })
})

describe('set_task_done', () => {
  it('marks a task done, is a no-op the second time, and can reopen it', async () => {
    const { base, db, tick } = await start()
    const client = await connect(base)
    const path = `users/${UID}/tasks/task1`

    const first = (await client.callTool({ name: 'set_task_done', arguments: { taskId: 'task1' } })).structuredContent
    expect(first).toMatchObject({ id: 'task1', done: true, changed: true })
    expect(db.read(path)).toMatchObject({ done: true, completedAt: NOW.getTime(), updatedAt: NOW.getTime() })

    tick(60_000)
    const again = (await client.callTool({ name: 'set_task_done', arguments: { taskId: 'task1', done: true } })).structuredContent
    expect(again.changed).toBe(false)
    expect(db.read(path).updatedAt, 'an idempotent repeat writes nothing').toBe(NOW.getTime())

    const reopened = (await client.callTool({ name: 'set_task_done', arguments: { taskId: 'task1', done: false } })).structuredContent
    expect(reopened).toMatchObject({ done: false, changed: true })
    expect(db.read(path)).toMatchObject({ done: false, completedAt: null })
  })

  it('ticks one day of a repeating task as an override, and un-ticking removes it', async () => {
    const { base, db } = await start()
    const client = await connect(base)
    const id = `habit1~${TODAY}`
    const path = `users/${UID}/tasks/habit1`

    const done = (await client.callTool({ name: 'set_task_done', arguments: { taskId: id } })).structuredContent
    expect(done).toMatchObject({ id, date: TODAY, done: true, changed: true })
    expect(db.read(path).overrides).toEqual({ [TODAY]: { done: true, completedAt: NOW.getTime() } })
    expect(db.read(path).done, 'the rule itself is untouched').toBeUndefined()

    const day = (await client.callTool({ name: 'get_schedule', arguments: {} })).structuredContent.days[0]
    expect(day.tasks.find((t) => t.id === id).done).toBe(true)

    await client.callTool({ name: 'set_task_done', arguments: { taskId: id, done: false } })
    expect(db.read(path).overrides).toEqual({})
  })

  it('refuses the series rule itself and points at the occurrence id', async () => {
    const { base, db } = await start()
    const client = await connect(base)
    const message = await refused(client, 'set_task_done', { taskId: 'habit1' })
    expect(message).toContain('habit1~YYYY-MM-DD')
    expect(db.writes).toEqual([])
  })

  it('refuses a missing task, a trashed task, and a day the rule does not land on', async () => {
    const { base, db } = await start()
    const client = await connect(base)
    expect(await refused(client, 'set_task_done', { taskId: 'nope' })).toMatch(/No task with id/)
    expect(await refused(client, 'set_task_done', { taskId: 'gone' })).toMatch(/trash/)
    // 2026-08-29 is a Saturday; the habit is weekdays only.
    expect(await refused(client, 'set_task_done', { taskId: 'habit1~2026-08-29' })).toMatch(/not a live occurrence/)
    expect(db.writes).toEqual([])
  })

  it('cannot be pointed at another account’s documents, however the id is crafted', async () => {
    const { base, db } = await start()
    const client = await connect(base)
    const before = db.read(`users/${OTHER}/tasks/secret`)
    for (const taskId of [
      `../${OTHER}/tasks/secret`,
      `${OTHER}/tasks/secret`,
      'secret', // a real id — but in the other account's tree, so not found here
      `../${OTHER}/tasks/secret~${TODAY}`,
      'a/b',
      'x'.repeat(161),
    ]) {
      await refused(client, 'set_task_done', { taskId })
    }
    expect(db.writes).toEqual([])
    expect(db.read(`users/${OTHER}/tasks/secret`)).toEqual(before)
    // Stronger than "it errored": no crafted id was ever handed to the database
    // layer, where a '/' would have addressed a different path.
    for (const id of db.requestedIds) expect(id, 'requested document id').toMatch(/^[A-Za-z0-9_-]{1,128}$/)
  })
})

describe('resources', () => {
  it('cadence://tags lists tags with their full path', async () => {
    const { base } = await start()
    const client = await connect(base)
    const { contents } = await client.readResource({ uri: 'cadence://tags' })
    expect(contents[0].mimeType).toBe('application/json')
    const { tags } = JSON.parse(contents[0].text)
    expect(tags.map((t) => t.path)).toEqual(['Work', 'Work / Deep work'])
    expect(tags.find((t) => t.id === 'deep').parentId).toBe('work')
  })

  it('cadence://day/{date} is a readable sheet including the Journal note', async () => {
    const { base } = await start()
    const client = await connect(base)
    const { contents } = await client.readResource({ uri: `cadence://day/${TODAY}` })
    expect(contents[0].mimeType).toBe('text/markdown')
    const sheet = contents[0].text
    expect(sheet).toContain(`# Monday ${TODAY}`)
    expect(sheet).toContain('13:00–13:30 · Standup')
    expect(sheet).toContain('[ ] 09:30 · 60 min · Write report · [Work] · (high) — id: task1')
    expect(sheet).toContain(`id: habit1~${TODAY}`)
    expect(sheet).toContain('10:30–13:00 (150 min)')
    expect(sheet).toContain('## Journal note: Monday')
    expect(sheet).toContain('Remember the budget call')
    expect(sheet).not.toContain('Trashed task')
    expect(sheet).not.toContain('Other persons secret')
    expect(sheet).not.toContain('Private')
  })

  it('a day with no note has no note section', async () => {
    const { base } = await start()
    const client = await connect(base)
    // A Saturday: no weekday habit, no Tuesday sync, nothing scheduled at all.
    const { contents } = await client.readResource({ uri: 'cadence://day/2026-08-29' })
    expect(contents[0].text).not.toContain('Journal note')
    expect(contents[0].text).toContain('(none)')
  })

  it('refuses an impossible date', async () => {
    const { base } = await start()
    const client = await connect(base)
    await expect(client.readResource({ uri: 'cadence://day/2026-02-31' })).rejects.toThrow(/real day/)
  })
})

describe('a failure inside the database', () => {
  it('is logged, and the client sees a generic message — never the database’s own', async () => {
    const db = seededDb()
    const { base } = await start({ db })
    const client = await connect(base)
    db.collection = () => {
      throw new Error('PERMISSION_DENIED: projects/real-project-id/databases/(default)')
    }
    const result = await client.callTool({ name: 'get_schedule', arguments: {} })
    expect(result.isError).toBe(true)
    expect(textOf(result)).not.toContain('real-project-id')
    expect(textOf(result)).toMatch(/Something went wrong/)
    expect(console.error.mock.calls.flat().join(' ')).toContain('get_schedule')
  })
})

/* ------------------------------------------------- access levels, deletes -- */

const startFull = (opts = {}) => start({ ...opts, env: baseEnv({ MCP_ACCESS: 'full' }) })

const callOk = async (client, name, args = {}) => {
  const result = await client.callTool({ name, arguments: args })
  expect(result.isError, `${name} ${JSON.stringify(args)}`).toBeFalsy()
  return result.structuredContent
}

/** One day of get_schedule. */
const dayOf = async (client, startDate) => (await callOk(client, 'get_schedule', { startDate })).days[0]

/** Ids no tool may ever pass to the database: they would address another path. */
const UNSAFE_IDS = ['../x', 'a/b', `${OTHER}/tasks/secret`, 'a b', `../${OTHER}~${TODAY}`]
const expectOnlySafeIds = (db) => {
  for (const id of db.requestedIds) expect(id, 'requested document id').toMatch(/^[A-Za-z0-9_-]{1,128}$/)
}

describe('access levels (MCP_ACCESS)', () => {
  const names = async (env) => {
    const { base } = await start({ env })
    const client = await connect(base)
    return (await client.listTools()).tools.map((t) => t.name).sort()
  }

  it('read: looking only — four tools', async () => {
    expect(await names(baseEnv({ MCP_ACCESS: 'read' }))).toEqual(READ_TOOLS)
  })

  it('write is the default: adds creating and ticking — nine tools', async () => {
    expect(await names(baseEnv())).toEqual(WRITE_TOOLS)
    expect(await names(baseEnv({ MCP_ACCESS: 'write' }))).toEqual(WRITE_TOOLS)
  })

  it('full: adds the three deletes — twelve tools', async () => {
    expect(await names(baseEnv({ MCP_ACCESS: 'full' }))).toEqual(FULL_TOOLS)
    expect(FULL_TOOLS).toHaveLength(12)
  })

  it('ignores the case of the setting', async () => {
    expect(await names(baseEnv({ MCP_ACCESS: ' FULL ' }))).toEqual(FULL_TOOLS)
  })

  it('an unknown value falls back to read — the safe side — and says so in the log', async () => {
    expect(await names(baseEnv({ MCP_ACCESS: 'admin' }))).toEqual(READ_TOOLS)
    expect(console.warn.mock.calls.flat().join(' ')).toContain('MCP_ACCESS')
  })

  it('a tool above the level is not merely hidden: calling it fails and writes nothing', async () => {
    const { base, db } = await start({ env: baseEnv({ MCP_ACCESS: 'read' }) })
    const client = await connect(base)
    for (const [name, args] of [
      ['create_task', { title: 'x' }],
      ['set_task_done', { taskId: 'task1' }],
      ['create_event', { title: 'x', startDate: TODAY }],
      ['create_journal_note', { title: 'x' }],
      ['append_to_journal_note', { noteId: 'n2', text: 'x' }],
      ['delete_task', { taskId: 'task1' }],
      ['delete_event', { eventId: 'ev1' }],
      ['delete_journal_note', { noteId: 'n2' }],
    ]) {
      await refused(client, name, args)
    }
    expect(db.writes).toEqual([])

    const { base: writeBase, db: writeDb } = await start()
    const writer = await connect(writeBase)
    await refused(writer, 'delete_task', { taskId: 'task1' })
    await refused(writer, 'delete_event', { eventId: 'ev1' })
    await refused(writer, 'delete_journal_note', { noteId: 'n2' })
    expect(writeDb.writes, 'the default level cannot delete').toEqual([])
  })

  it('marks every delete destructive, so a client asks the person first', async () => {
    const { base } = await startFull()
    const client = await connect(base)
    const { tools } = await client.listTools()
    for (const name of DELETE_TOOLS) {
      const tool = tools.find((t) => t.name === name)
      expect(tool.annotations, name).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: true })
      expect(tool.description, name).toMatch(/Trash/)
      expect(tool.description, name).toMatch(/Confirm with the user/)
    }
    for (const tool of tools.filter((t) => !DELETE_TOOLS.includes(t.name))) {
      expect(tool.annotations.destructiveHint, tool.name).not.toBe(true)
    }
  })

  it('tells the model only what it can actually do', async () => {
    const said = async (env) => (await connect((await start({ env })).base)).getInstructions()
    expect(await said(baseEnv({ MCP_ACCESS: 'read' }))).toMatch(/read-only/)
    expect(await said(baseEnv())).toMatch(/Nothing can be deleted/)
    const full = await said(baseEnv({ MCP_ACCESS: 'full' }))
    expect(full).toMatch(/Confirm with the user before you delete/)
    expect(full).not.toMatch(/Nothing can be deleted/)
    for (const level of ['read', 'write', 'full']) {
      expect(await said(baseEnv({ MCP_ACCESS: level }))).toMatch(/private writing/)
    }
  })
})

describe('delete_task', () => {
  it('moves a task to the Trash, as the app does — the document is kept', async () => {
    const { base, db } = await startFull()
    const client = await connect(base)
    const result = await callOk(client, 'delete_task', { taskId: 'task1' })
    expect(result).toMatchObject({ id: 'task1', title: 'Write report', changed: true, outcome: 'moved-to-trash' })
    expect(result.message).toMatch(/restored from the Trash/)

    const stored = db.read(`users/${UID}/tasks/task1`)
    expect(stored).toMatchObject({ title: 'Write report', date: TODAY, deletedAt: NOW.getTime(), updatedAt: NOW.getTime() })
    expect((await dayOf(client, TODAY)).tasks.map((t) => t.id)).not.toContain('task1')
    expect(db.writes.every((w) => w.op === 'update')).toBe(true)
  })

  it('is a no-op the second time', async () => {
    const { base, db, tick } = await startFull()
    const client = await connect(base)
    await callOk(client, 'delete_task', { taskId: 'task1' })
    const writes = db.writes.length
    tick(60_000)
    const again = await callOk(client, 'delete_task', { taskId: 'task1' })
    expect(again).toMatchObject({ changed: false, outcome: 'already-in-trash' })
    expect(db.writes).toHaveLength(writes)
    expect(db.read(`users/${UID}/tasks/task1`).updatedAt).toBe(NOW.getTime())
    expect(await callOk(client, 'delete_task', { taskId: 'gone' })).toMatchObject({ changed: false })
  })

  it('skips one day of a repeating task, leaving the series and the other days alone', async () => {
    const { base, db } = await startFull()
    const client = await connect(base)
    const result = await callOk(client, 'delete_task', { taskId: `habit1~${TODAY}` })
    expect(result).toMatchObject({ changed: true, outcome: 'skipped-day', date: TODAY })

    const series = db.read(`users/${UID}/tasks/habit1`)
    expect(series.overrides).toEqual({ [TODAY]: { detached: true } })
    expect(series.deletedAt, 'the series itself is not deleted').toBeUndefined()
    expect((await dayOf(client, TODAY)).tasks.map((t) => t.title)).not.toContain('Stretch')
    expect((await dayOf(client, TOMORROW)).tasks.map((t) => t.id)).toContain(`habit1~${TOMORROW}`)

    const writes = db.writes.length
    expect(await callOk(client, 'delete_task', { taskId: `habit1~${TODAY}` })).toMatchObject({
      changed: false,
      outcome: 'already-gone',
    })
    expect(db.writes).toHaveLength(writes)
  })

  it('moves the WHOLE series to the Trash when given the series id, and says so', async () => {
    const { base, db } = await startFull()
    const client = await connect(base)
    const result = await callOk(client, 'delete_task', { taskId: 'habit1' })
    expect(result.outcome).toBe('moved-to-trash')
    expect(result.message).toMatch(/whole repeating series/)
    expect(db.read(`users/${UID}/tasks/habit1`).deletedAt).toBe(NOW.getTime())
    expect((await dayOf(client, TOMORROW)).tasks.map((t) => t.title)).not.toContain('Stretch')
  })

  it('refuses a missing task and a day the rule does not land on, writing nothing', async () => {
    const { base, db } = await startFull()
    const client = await connect(base)
    expect(await refused(client, 'delete_task', { taskId: 'nope' })).toMatch(/No task with id/)
    // 2026-08-29 is a Saturday; the habit is weekdays only.
    expect(await refused(client, 'delete_task', { taskId: 'habit1~2026-08-29' })).toMatch(/not a live occurrence/)
    await refused(client, 'delete_task', { taskId: '' })
    expect(db.writes).toEqual([])
  })

  it('cannot reach another account, however the id is crafted', async () => {
    const { base, db } = await startFull()
    const client = await connect(base)
    const before = db.read(`users/${OTHER}/tasks/secret`)
    for (const taskId of [...UNSAFE_IDS, 'secret']) await refused(client, 'delete_task', { taskId })
    expect(db.writes).toEqual([])
    expect(db.read(`users/${OTHER}/tasks/secret`)).toEqual(before)
    expectOnlySafeIds(db)
  })
})

describe('create_event', () => {
  it('writes the same document the app would, and it shows up in the schedule', async () => {
    const { base, db } = await start()
    const client = await connect(base)
    const created = await callOk(client, 'create_event', {
      title: '  Dentist  ',
      startDate: TOMORROW,
      startTime: '15:00',
      endTime: '16:00',
      tag: 'work',
      notes: 'bring forms',
    })
    expect(created.event).toMatchObject({ title: 'Dentist', start: '15:00', end: '16:00', allDay: false, tag: 'Work' })

    const stored = db.read(`users/${UID}/events/${created.id}`)
    expect(stored).toMatchObject({
      title: 'Dentist',
      notes: 'bring forms',
      startDate: TOMORROW,
      endDate: TOMORROW,
      startMin: 900,
      endMin: 960,
      tagId: 'work',
      recurrence: null,
      overrides: {},
      createdAt: NOW.getTime(),
      updatedAt: NOW.getTime(),
    })
    // As the app's own addEvent: no deletedAt field at all.
    expect('deletedAt' in stored).toBe(false)

    const day = await dayOf(client, TOMORROW)
    expect(day.events.map((e) => e.title)).toContain('Dentist')
    // 15:00-16:00 and the 16:00 weekly sync leave 08:00-15:00 and 16:30-20:00.
    expect(day.freeWindows).toEqual([
      { start: '08:00', end: '15:00', lengthMin: 420 },
      { start: '16:30', end: '20:00', lengthMin: 210 },
    ])
  })

  it('makes an all-day event across several days, which does not block time', async () => {
    const { base, db } = await start()
    const client = await connect(base)
    const { id } = await callOk(client, 'create_event', { title: 'Retreat', startDate: TODAY, endDate: '2026-08-27' })
    expect(db.read(`users/${UID}/events/${id}`)).toMatchObject({ startDate: TODAY, endDate: '2026-08-27', startMin: null, endMin: null })

    const middle = await dayOf(client, '2026-08-26')
    expect(middle.events).toEqual([expect.objectContaining({ title: 'Retreat', allDay: true, startDate: TODAY, endDate: '2026-08-27' })])
    expect(middle.freeWindows).toEqual([{ start: '08:00', end: '20:00', lengthMin: 720 }])
  })

  it('refuses every impossible combination, writing nothing', async () => {
    const { base, db } = await start()
    const client = await connect(base)
    expect(await refused(client, 'create_event', { title: 'x', startDate: TOMORROW, endTime: '10:00' })).toMatch(/needs a startTime/)
    expect(
      await refused(client, 'create_event', { title: 'x', startDate: TODAY, endDate: TOMORROW, startTime: '09:00', endTime: '10:00' }),
    ).toMatch(/single day/)
    expect(await refused(client, 'create_event', { title: 'x', startDate: TOMORROW, endDate: TODAY })).toMatch(/before startDate/)
    expect(
      await refused(client, 'create_event', { title: 'x', startDate: TODAY, startTime: '10:00', endTime: '09:00' }),
    ).toMatch(/later than/)
    expect(await refused(client, 'create_event', { title: 'x', startDate: TODAY, endDate: '2028-01-01' })).toMatch(/at most 366/)
    expect(await refused(client, 'create_event', { title: 'x', startDate: TODAY, tag: 'Errands' })).toMatch(/No tag called/)
    await refused(client, 'create_event', { title: 'x', startDate: '2026-02-31' })
    await refused(client, 'create_event', { title: '   ', startDate: TODAY })
    await refused(client, 'create_event', { title: 'x', startDate: TODAY, startTime: '25:00' })
    expect(db.writes).toEqual([])
  })
})

describe('delete_event', () => {
  it('moves an event to the Trash', async () => {
    const { base, db } = await startFull()
    const client = await connect(base)
    expect(await callOk(client, 'delete_event', { eventId: 'ev1' })).toMatchObject({
      title: 'Standup',
      changed: true,
      outcome: 'moved-to-trash',
    })
    expect(db.read(`users/${UID}/events/ev1`)).toMatchObject({ title: 'Standup', deletedAt: NOW.getTime(), updatedAt: NOW.getTime() })
    expect((await dayOf(client, TODAY)).events.map((e) => e.title)).not.toContain('Standup')
    expect(await callOk(client, 'delete_event', { eventId: 'ev1' })).toMatchObject({ changed: false, outcome: 'already-in-trash' })
  })

  it('skips one day of a repeating event, leaving the rest of the series', async () => {
    const { base, db } = await startFull()
    const client = await connect(base)
    const id = `ev2~${TOMORROW}`
    expect((await dayOf(client, TOMORROW)).events.map((e) => e.id)).toContain(id)

    expect(await callOk(client, 'delete_event', { eventId: id })).toMatchObject({ changed: true, outcome: 'skipped-day' })
    expect(db.read(`users/${UID}/events/ev2`).overrides).toEqual({ [TOMORROW]: { detached: true } })
    expect(db.read(`users/${UID}/events/ev2`).deletedAt).toBeUndefined()
    expect((await dayOf(client, TOMORROW)).events.map((e) => e.title)).not.toContain('Weekly sync')
    expect((await dayOf(client, '2026-09-01')).events.map((e) => e.title)).toContain('Weekly sync')
    expect(await callOk(client, 'delete_event', { eventId: id })).toMatchObject({ changed: false, outcome: 'already-gone' })
  })

  it('moves the whole series to the Trash when given its id', async () => {
    const { base, db } = await startFull()
    const client = await connect(base)
    const result = await callOk(client, 'delete_event', { eventId: 'ev2' })
    expect(result.message).toMatch(/whole repeating series/)
    expect(db.read(`users/${UID}/events/ev2`).deletedAt).toBe(NOW.getTime())
  })

  it('refuses a missing event, a day the rule skips, and any crafted id — writing nothing', async () => {
    const { base, db } = await startFull()
    const client = await connect(base)
    expect(await refused(client, 'delete_event', { eventId: 'nope' })).toMatch(/No event with id/)
    // 2026-08-24 is a Monday; the sync is Tuesdays.
    expect(await refused(client, 'delete_event', { eventId: `ev2~${TODAY}` })).toMatch(/not a live occurrence/)
    for (const eventId of UNSAFE_IDS) await refused(client, 'delete_event', { eventId })
    expect(db.writes).toEqual([])
    expectOnlySafeIds(db)
  })
})

/* ---------------------------------------------------------------- journal -- */

describe('find_journal_notes', () => {
  it('lists live notes, pinned first then most recently edited — never trashed or another account’s', async () => {
    const { base } = await start()
    const client = await connect(base)
    const found = await callOk(client, 'find_journal_notes')
    expect(found.notes.map((n) => n.id)).toEqual(['n2', 'n5', 'n4', 'n1'])
    expect(found.total).toBe(4)
    expect(found.notes[0]).toMatchObject({ title: 'Ideas', pinned: true, date: null })
    expect(typeof found.notes[0].edited).toBe('string')
    expect(JSON.stringify(found)).not.toContain('Old trashed note')
    expect(JSON.stringify(found)).not.toContain('Private')
  })

  it('searches titles and excerpts, and filters by the day a note belongs to', async () => {
    const { base } = await start()
    const client = await connect(base)
    const ids = async (args) => (await callOk(client, 'find_journal_notes', args)).notes.map((n) => n.id)
    expect(await ids({ query: 'ideas' })).toEqual(['n2'])
    expect(await ids({ query: 'open plan' })).toEqual(['n2'])
    expect(await ids({ query: 'nothing matches this' })).toEqual([])
    expect(await ids({ from: TODAY })).toEqual(['n1'])
    expect(await ids({ to: '2026-08-23' }), 'the 20th is trashed; the rest have no day').toEqual([])
    expect(await ids({ from: '2026-08-01', to: '2026-08-31' })).toEqual(['n1'])
  })

  it('limits the list and says it was cut short; refuses a backwards range', async () => {
    const { base } = await start()
    const client = await connect(base)
    const two = await callOk(client, 'find_journal_notes', { limit: 2 })
    expect(two.notes).toHaveLength(2)
    expect(two).toMatchObject({ total: 4, truncated: true })
    expect(await refused(client, 'find_journal_notes', { from: TOMORROW, to: TODAY })).toMatch(/later than/)
  })
})

describe('read_journal_note', () => {
  it('reads a note by id, keeping ticked checklist items', async () => {
    const { base } = await start()
    const client = await connect(base)
    const note = await callOk(client, 'read_journal_note', { noteId: 'n2' })
    expect(note).toMatchObject({ id: 'n2', title: 'Ideas', pinned: true, readable: true, truncated: false })
    expect(note.text).toBe('# Plan\n- [x] done thing\n- [ ] open thing')
  })

  it('reads the note written for a day', async () => {
    const { base } = await start()
    const client = await connect(base)
    expect(await callOk(client, 'read_journal_note', { date: TODAY })).toMatchObject({
      id: 'n1',
      title: 'Monday',
      date: TODAY,
      text: 'Remember the budget call',
    })
  })

  it('says so, rather than showing an empty note, when the text is from a newer version', async () => {
    const { base } = await start()
    const client = await connect(base)
    const note = await callOk(client, 'read_journal_note', { noteId: 'n4' })
    expect(note).toMatchObject({ readable: false, text: '' })
    expect(note.message).toMatch(/cannot read/)
  })

  it('refuses a trashed note, a missing one, another account’s, and an unclear request', async () => {
    const { base, db } = await start()
    const client = await connect(base)
    expect(await refused(client, 'read_journal_note', { noteId: 'n3' })).toMatch(/trash/)
    expect(await refused(client, 'read_journal_note', { noteId: 'nope' })).toMatch(/No note with id/)
    expect(await refused(client, 'read_journal_note', { noteId: 'n9' }), 'n9 belongs to another account').toMatch(/No note with id/)
    expect(await refused(client, 'read_journal_note', { date: '2030-01-01' })).toMatch(/There is no note for/)
    expect(await refused(client, 'read_journal_note', {})).toMatch(/noteId .* or date/)
    expect(await refused(client, 'read_journal_note', { noteId: 'n2', date: TODAY })).toMatch(/not both/)
    for (const noteId of UNSAFE_IDS) await refused(client, 'read_journal_note', { noteId })
    expectOnlySafeIds(db)
  })
})

describe('create_journal_note', () => {
  it('writes metadata and body together, as the editor would, and the text reads back unchanged', async () => {
    const { base, db } = await start()
    const client = await connect(base)
    const text = '# Books\n- 1984\n- Dune\n- [ ] buy a copy'
    const created = await callOk(client, 'create_journal_note', { title: 'Reading list', text })
    expect(created).toMatchObject({ title: 'Reading list', date: null })

    const meta = db.read(`users/${UID}/journal/${created.id}`)
    expect(meta).toMatchObject({
      title: 'Reading list',
      excerpt: 'Books 1984 Dune buy a copy',
      dayKey: null,
      pinned: false,
      hasDrawing: false,
      deletedAt: null,
      createdAt: NOW.getTime(),
      updatedAt: NOW.getTime(),
    })
    expect(typeof meta.paper).toBe('object')

    const body = db.read(`users/${UID}/journal/${created.id}/content/body`)
    expect(body).toMatchObject({ schemaVersion: 1, updatedAt: NOW.getTime() })
    expect(meta.bytes).toBe(Buffer.byteLength(body.json))
    expect(JSON.parse(body.json).content.map((b) => b.type)).toEqual(['heading', 'bulletList', 'taskList'])

    expect((await callOk(client, 'read_journal_note', { noteId: created.id })).text).toBe(text)
    const listed = await callOk(client, 'find_journal_notes', { query: 'reading list' })
    expect(listed.notes.map((n) => n.id)).toEqual([created.id])
  })

  it('makes a day note titled with the day, and refuses a second one for the same day', async () => {
    const { base, db } = await start()
    const client = await connect(base)
    const created = await callOk(client, 'create_journal_note', { date: TOMORROW, text: 'plan' })
    expect(created).toMatchObject({ title: 'Tuesday, August 25, 2026', date: TOMORROW })
    expect(db.read(`users/${UID}/journal/${created.id}`)).toMatchObject({ dayKey: TOMORROW })
    expect((await callOk(client, 'read_journal_note', { date: TOMORROW })).id).toBe(created.id)

    const writes = db.writes.length
    const message = await refused(client, 'create_journal_note', { date: TODAY, text: 'again' })
    expect(message).toMatch(/already has a note/)
    expect(message).toContain('n1')
    expect(message).toMatch(/append_to_journal_note/)
    expect(db.writes).toHaveLength(writes)
  })

  it('an untitled, empty note is the app’s own empty note', async () => {
    const { base, db } = await start()
    const client = await connect(base)
    const created = await callOk(client, 'create_journal_note', {})
    expect(created.title).toBe('Untitled')
    expect(db.read(`users/${UID}/journal/${created.id}`).title).toBe('')
    const body = db.read(`users/${UID}/journal/${created.id}/content/body`)
    expect(JSON.parse(body.json)).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
  })

  it('refuses text too large for a note, an over-long title and a bad date, writing nothing', async () => {
    const { base, db } = await start()
    const client = await connect(base)
    await refused(client, 'create_journal_note', { text: 'x'.repeat(20_001) })
    await refused(client, 'create_journal_note', { title: 'x'.repeat(201) })
    await refused(client, 'create_journal_note', { date: '2026-02-31' })
    expect(db.writes).toEqual([])
  })
})

describe('append_to_journal_note', () => {
  it('adds to the end, keeps everything already there, and updates the metadata the way a save does', async () => {
    const { base, db } = await start()
    const client = await connect(base)
    const before = db.read(`users/${UID}/journal/n2`)
    const result = await callOk(client, 'append_to_journal_note', { noteId: 'n2', text: '## Later\n- [ ] call back' })
    expect(result).toMatchObject({ id: 'n2', title: 'Ideas' })

    const meta = db.read(`users/${UID}/journal/n2`)
    expect(meta).toMatchObject({ title: 'Ideas', pinned: true, createdAt: 5, updatedAt: NOW.getTime() })
    expect(meta.excerpt).toBe('Plan done thing open thing Later call back')
    expect(meta.bytes).toBeGreaterThan(before.bytes ?? 0)
    const body = db.read(`users/${UID}/journal/n2/content/body`)
    expect(meta.bytes).toBe(Buffer.byteLength(body.json))
    expect(body).toMatchObject({ schemaVersion: 1, updatedAt: NOW.getTime() })

    expect((await callOk(client, 'read_journal_note', { noteId: 'n2' })).text).toBe(
      '# Plan\n- [x] done thing\n- [ ] open thing\n## Later\n- [ ] call back',
    )
  })

  it('finds the note by day', async () => {
    const { base } = await start()
    const client = await connect(base)
    await callOk(client, 'append_to_journal_note', { date: TODAY, text: 'and also this' })
    expect((await callOk(client, 'read_journal_note', { date: TODAY })).text).toBe('Remember the budget call\nand also this')
  })

  it('does not leave a blank first line when adding to a brand-new note', async () => {
    const { base, db } = await start()
    const client = await connect(base)
    const { id } = await callOk(client, 'create_journal_note', { title: 'Fresh' })
    await callOk(client, 'append_to_journal_note', { noteId: id, text: 'first words' })
    const doc = JSON.parse(db.read(`users/${UID}/journal/${id}/content/body`).json)
    expect(doc.content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: 'first words' }] }])
  })

  it('refuses a note it cannot safely edit — unreadable, trashed, too large — leaving it untouched', async () => {
    const { base, db } = await start()
    const client = await connect(base)
    const snapshot = (id) => [db.read(`users/${UID}/journal/${id}`), db.read(`users/${UID}/journal/${id}/content/body`)]
    for (const [noteId, pattern] of [
      ['n4', /can't be edited/],
      ['n3', /trash/],
      ['n5', /too large/],
    ]) {
      const before = snapshot(noteId)
      const writes = db.writes.length
      expect(await refused(client, 'append_to_journal_note', { noteId, text: 'y'.repeat(20_000) }), noteId).toMatch(pattern)
      expect(snapshot(noteId), `${noteId} unchanged`).toEqual(before)
      expect(db.writes).toHaveLength(writes)
    }
  })

  it('refuses text with nothing in it, a missing note, a day with no note, and an unclear request', async () => {
    const { base, db } = await start()
    const client = await connect(base)
    expect(await refused(client, 'append_to_journal_note', { noteId: 'n2', text: '- \n#\n   ' })).toMatch(/no text to add/)
    expect(await refused(client, 'append_to_journal_note', { noteId: 'nope', text: 'x' })).toMatch(/No note with id/)
    expect(await refused(client, 'append_to_journal_note', { noteId: 'n9', text: 'x' })).toMatch(/No note with id/)
    expect(await refused(client, 'append_to_journal_note', { date: '2030-01-01', text: 'x' })).toMatch(/There is no note for/)
    expect(await refused(client, 'append_to_journal_note', { text: 'x' })).toMatch(/noteId .* or date/)
    await refused(client, 'append_to_journal_note', { noteId: 'n2', text: '' })
    expect(db.writes).toEqual([])
  })

  it('cannot be pointed at another account’s notes, however the id is crafted', async () => {
    const { base, db } = await start()
    const client = await connect(base)
    for (const noteId of UNSAFE_IDS) await refused(client, 'append_to_journal_note', { noteId, text: 'x' })
    expect(db.writes).toEqual([])
    expect(db.read(`users/${OTHER}/journal/n9`)).toMatchObject({ title: 'Private' })
    expectOnlySafeIds(db)
  })
})

describe('delete_journal_note', () => {
  it('moves a note to the Trash, changing only deletedAt — the text is kept', async () => {
    const { base, db } = await startFull()
    const client = await connect(base)
    const before = db.read(`users/${UID}/journal/n2`)
    const bodyBefore = db.read(`users/${UID}/journal/n2/content/body`)

    const result = await callOk(client, 'delete_journal_note', { noteId: 'n2' })
    expect(result).toMatchObject({ id: 'n2', title: 'Ideas', changed: true })
    expect(result.message).toMatch(/restored/)
    expect(db.read(`users/${UID}/journal/n2`)).toEqual({ ...before, deletedAt: NOW.getTime() })
    expect(db.read(`users/${UID}/journal/n2/content/body`)).toEqual(bodyBefore)

    const found = await callOk(client, 'find_journal_notes')
    expect(found.notes.map((n) => n.id)).not.toContain('n2')
    expect(await refused(client, 'read_journal_note', { noteId: 'n2' })).toMatch(/trash/)
  })

  it('is a no-op for a note already in the Trash', async () => {
    const { base, db } = await startFull()
    const client = await connect(base)
    expect(await callOk(client, 'delete_journal_note', { noteId: 'n3' })).toMatchObject({ changed: false })
    expect(db.writes).toEqual([])
  })

  it('refuses a missing note and any crafted id, never touching another account', async () => {
    const { base, db } = await startFull()
    const client = await connect(base)
    expect(await refused(client, 'delete_journal_note', { noteId: 'nope' })).toMatch(/No note with id/)
    expect(await refused(client, 'delete_journal_note', { noteId: 'n9' })).toMatch(/No note with id/)
    for (const noteId of UNSAFE_IDS) await refused(client, 'delete_journal_note', { noteId })
    expect(db.writes).toEqual([])
    expect(db.read(`users/${OTHER}/journal/n9`).deletedAt).toBeUndefined()
    expectOnlySafeIds(db)
  })
})
