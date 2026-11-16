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
    expect(tools).toHaveLength(4)
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

  it('lists exactly four tools and two resources, with honest annotations', async () => {
    const { base } = await start()
    const client = await connect(base)
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['create_task', 'find_tasks', 'get_schedule', 'set_task_done'])

    const by = Object.fromEntries(tools.map((t) => [t.name, t]))
    for (const name of ['get_schedule', 'find_tasks']) expect(by[name].annotations.readOnlyHint, name).toBe(true)
    for (const name of ['create_task', 'set_task_done']) {
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
    const { contents } = await client.readResource({ uri: `cadence://day/${TOMORROW}` })
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
