/* mcp/config.js, mcp/auth.js, mcp/cors.js and the service-account parser — the
 * pieces that decide who gets in. The endpoint must fail CLOSED: a weak or
 * missing setting turns it off rather than leaving it half open.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { authenticate } from '../mcp/auth.js'
import { ACCESS_LEVELS, ID_PATTERN, MIN_KEY_LENGTH, allows, readMcpConfig } from '../mcp/config.js'
import { applyCors } from '../mcp/cors.js'
import { parseServiceAccount } from '../mcp/firestore.js'

const API_KEY = 'k'.repeat(MIN_KEY_LENGTH)
const URL_KEY = 'u'.repeat(MIN_KEY_LENGTH)

const env = (extra = {}) => ({
  MCP_API_KEY: API_KEY,
  MCP_USER_UID: 'uid_123',
  FIREBASE_SERVICE_ACCOUNT: '{}',
  ...extra,
})

describe('readMcpConfig', () => {
  it('is ready with the three required settings, and defaults the rest', () => {
    const config = readMcpConfig(env())
    assert.equal(config.ready, true)
    assert.equal(config.timeZone, 'UTC')
    assert.deepEqual(config.allowedOrigins, ['*'])
    assert.equal(config.urlKey, '')
  })

  it('is NOT ready without each required setting', () => {
    for (const missing of ['MCP_API_KEY', 'MCP_USER_UID', 'FIREBASE_SERVICE_ACCOUNT']) {
      const config = readMcpConfig(env({ [missing]: '' }))
      assert.equal(config.ready, false, missing)
      assert.ok(config.problems.some((p) => p.includes(missing)), missing)
    }
  })

  it('treats a short key as no key at all', () => {
    const config = readMcpConfig(env({ MCP_API_KEY: 'short' }))
    assert.equal(config.apiKey, '')
    assert.equal(config.ready, false)
  })

  it('refuses a uid that is not a plain Firebase uid', () => {
    for (const uid of ['a/b', '../other', 'a b', 'x'.repeat(129)]) {
      assert.equal(readMcpConfig(env({ MCP_USER_UID: uid })).ready, false, uid)
    }
  })

  it('turns the URL form off when its key is weak, shared, or not URL-safe', () => {
    assert.equal(readMcpConfig(env({ MCP_URL_KEY: URL_KEY })).urlKey, URL_KEY)
    assert.equal(readMcpConfig(env({ MCP_URL_KEY: 'short' })).urlKey, '')
    assert.equal(readMcpConfig(env({ MCP_URL_KEY: API_KEY })).urlKey, '', 'must differ from the header key')
    assert.equal(readMcpConfig(env({ MCP_URL_KEY: `${'u'.repeat(40)}/x` })).urlKey, '')
    // Switching the URL form off never switches the endpoint itself off.
    assert.equal(readMcpConfig(env({ MCP_URL_KEY: 'short' })).ready, true)
  })

  it('falls back to UTC for an invalid time zone, and says so', () => {
    const config = readMcpConfig(env({ MCP_TIMEZONE: 'Mars/Olympus' }))
    assert.equal(config.timeZone, 'UTC')
    assert.ok(config.problems.some((p) => p.includes('MCP_TIMEZONE')))
    assert.equal(readMcpConfig(env({ MCP_TIMEZONE: 'Asia/Manila' })).timeZone, 'Asia/Manila')
  })

  it('defaults MCP_ACCESS to write, and reads read / write / full in any case', () => {
    assert.equal(readMcpConfig(env()).access, 'write')
    assert.equal(readMcpConfig(env({ MCP_ACCESS: '' })).access, 'write')
    for (const level of ACCESS_LEVELS) {
      assert.equal(readMcpConfig(env({ MCP_ACCESS: level })).access, level)
      assert.equal(readMcpConfig(env({ MCP_ACCESS: `  ${level.toUpperCase()} ` })).access, level)
    }
  })

  it('treats an unknown MCP_ACCESS as read — never as something more generous — and says so', () => {
    for (const bad of ['admin', 'delete', 'true', '1', 'full access', 'ful']) {
      const config = readMcpConfig(env({ MCP_ACCESS: bad }))
      assert.equal(config.access, 'read', bad)
      assert.ok(config.problems.some((p) => p.includes('MCP_ACCESS')), bad)
      // A typo narrows what the endpoint may do; it never switches it off.
      assert.equal(config.ready, true, bad)
    }
  })

  it('each access level includes the ones below it', () => {
    assert.deepEqual(ACCESS_LEVELS, ['read', 'write', 'full'])
    assert.equal(allows('read', 'read'), true)
    assert.equal(allows('read', 'write'), false)
    assert.equal(allows('read', 'full'), false)
    assert.equal(allows('write', 'read'), true)
    assert.equal(allows('write', 'write'), true)
    assert.equal(allows('write', 'full'), false)
    assert.equal(allows('full', 'full'), true)
    // An unrecognised level allows nothing at all.
    assert.equal(allows('root', 'read'), false)
    assert.equal(allows(undefined, 'read'), false)
  })

  it('parses a comma-separated origin list', () => {
    const config = readMcpConfig(env({ MCP_ALLOWED_ORIGINS: ' https://claude.ai , https://chatgpt.com ,' }))
    assert.deepEqual(config.allowedOrigins, ['https://claude.ai', 'https://chatgpt.com'])
  })

  it('ID_PATTERN is what keeps an id inside one path segment', () => {
    assert.equal(ID_PATTERN.test('abcDEF123_-'), true)
    for (const bad of ['', 'a/b', '..', 'a.b', 'a~b', 'a b', 'a\nb', 'x'.repeat(129)]) {
      assert.equal(ID_PATTERN.test(bad), false, JSON.stringify(bad))
    }
  })
})

describe('authenticate', () => {
  const req = (headers = {}, url = '/mcp') => ({ headers, url })
  const withUrlKey = readMcpConfig(env({ MCP_URL_KEY: URL_KEY }))
  const headerOnly = readMcpConfig(env())

  it('accepts the bearer key', () => {
    assert.deepEqual(authenticate(req({ authorization: `Bearer ${API_KEY}` }), headerOnly), {
      ok: true,
      via: 'header',
    })
  })

  it('accepts the scheme in any case', () => {
    assert.equal(authenticate(req({ authorization: `bearer ${API_KEY}` }), headerOnly).ok, true)
  })

  it('rejects a missing, wrong, or differently-shaped credential', () => {
    for (const headers of [
      {},
      { authorization: '' },
      { authorization: 'Bearer ' },
      { authorization: API_KEY },
      { authorization: `Basic ${API_KEY}` },
      { authorization: `Bearer ${API_KEY}x` },
      { authorization: `Bearer ${API_KEY.slice(1)}` },
      { authorization: 'Bearer short' },
    ]) {
      assert.equal(authenticate(req(headers), headerOnly).ok, false, JSON.stringify(headers))
    }
  })

  it('never authenticates when no key is configured', () => {
    const none = readMcpConfig(env({ MCP_API_KEY: '' }))
    assert.equal(authenticate(req({ authorization: 'Bearer ' }), none).ok, false)
    assert.equal(authenticate(req({ authorization: 'Bearer undefined' }), none).ok, false)
  })

  it('ignores the URL form entirely unless MCP_URL_KEY is set', () => {
    assert.equal(authenticate(req({}, `/mcp/k/${URL_KEY}`), headerOnly).ok, false)
    assert.equal(authenticate(req({}, `/api/mcp?key=${URL_KEY}`), headerOnly).ok, false)
  })

  it('accepts the URL key as a path or as the query a rewrite produces', () => {
    assert.deepEqual(authenticate(req({}, `/mcp/k/${URL_KEY}`), withUrlKey), { ok: true, via: 'url' })
    assert.deepEqual(authenticate(req({}, `/mcp/k/${URL_KEY}/`), withUrlKey), { ok: true, via: 'url' })
    assert.deepEqual(authenticate(req({}, `/api/mcp?key=${URL_KEY}`), withUrlKey), { ok: true, via: 'url' })
  })

  it('rejects a wrong URL key, and the header key used as a URL key', () => {
    assert.equal(authenticate(req({}, `/mcp/k/${'x'.repeat(32)}`), withUrlKey).ok, false)
    assert.equal(authenticate(req({}, `/mcp/k/${API_KEY}`), withUrlKey).ok, false)
    assert.equal(authenticate(req({}, '/mcp/k/'), withUrlKey).ok, false)
    assert.equal(authenticate(req({}, '/mcp?key='), withUrlKey).ok, false)
  })

  it('does not take the URL key as a bearer token', () => {
    assert.equal(authenticate(req({ authorization: `Bearer ${URL_KEY}` }), withUrlKey).ok, false)
  })

  it('survives a malformed URL or escape sequence', () => {
    assert.equal(authenticate(req({}, '/mcp/k/%E0%A4%A'), withUrlKey).ok, false)
    assert.equal(authenticate({ headers: {}, url: undefined }, withUrlKey).ok, false)
  })
})

describe('applyCors', () => {
  function run(allowedOrigins, origin) {
    const headers = {}
    applyCors({ headers: origin ? { origin } : {} }, { setHeader: (k, v) => (headers[k] = v) }, allowedOrigins)
    return headers
  }

  it('allows any origin by default, without credentials', () => {
    const h = run(['*'], 'https://claude.ai')
    assert.equal(h['Access-Control-Allow-Origin'], '*')
    assert.equal('Access-Control-Allow-Credentials' in h, false)
  })

  it('lets a browser send the auth and MCP protocol headers, and read the challenge', () => {
    const h = run(['*'])
    for (const name of ['Authorization', 'Content-Type', 'Mcp-Session-Id', 'Mcp-Protocol-Version']) {
      assert.ok(h['Access-Control-Allow-Headers'].includes(name), name)
    }
    assert.ok(h['Access-Control-Expose-Headers'].includes('WWW-Authenticate'))
    assert.ok(h['Access-Control-Allow-Methods'].includes('POST'))
    assert.ok(h['Access-Control-Allow-Methods'].includes('OPTIONS'))
  })

  it('with an allow-list, answers only listed origins', () => {
    const list = ['https://claude.ai']
    assert.equal(run(list, 'https://claude.ai')['Access-Control-Allow-Origin'], 'https://claude.ai')
    assert.equal(run(list, 'https://claude.ai')['Vary'], 'Origin')
    assert.equal('Access-Control-Allow-Origin' in run(list, 'https://evil.example'), false)
    assert.equal('Access-Control-Allow-Origin' in run(list), false)
  })
})

describe('parseServiceAccount', () => {
  const account = {
    project_id: 'demo',
    client_email: 'svc@demo.iam.gserviceaccount.com',
    private_key: '-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n',
  }
  const json = JSON.stringify(account)

  it('reads raw JSON and base64 JSON alike', () => {
    assert.equal(parseServiceAccount(json).project_id, 'demo')
    assert.equal(parseServiceAccount(Buffer.from(json).toString('base64')).project_id, 'demo')
  })

  it('turns a pasted "\\n" back into a real newline', () => {
    assert.ok(parseServiceAccount(json).private_key.includes('\n'))
    assert.ok(!parseServiceAccount(json).private_key.includes('\\n'))
  })

  it('names what is wrong without echoing the credential', () => {
    const secret = 'SUPER-SECRET-VALUE'
    for (const bad of ['', '   ', 'not json', `{"project_id":"${secret}"}`, JSON.stringify({ ...account, private_key: '' })]) {
      assert.throws(
        () => parseServiceAccount(bad),
        (caught) => caught instanceof Error && !caught.message.includes(secret),
        JSON.stringify(bad),
      )
    }
    assert.throws(() => parseServiceAccount('{"project_id":"x"}'), /missing "client_email"/)
  })
})
