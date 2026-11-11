/* A small, purpose-built stand-in for the Upstash client — not a Redis
 * emulator, just the exact commands api/_lib/pushStore.js issues, behaving the
 * way Redis does where the code depends on it:
 *
 *   - ZREM returns how many members it actually removed. claimDue's whole
 *     "two overlapping ticks never share a reminder" guarantee rests on that
 *     number, so it is real here, not stubbed to 1.
 *   - multi() runs its queued commands back to back and returns every result
 *     in order, the way MULTI/EXEC does.
 *   - reads come back as strings (the store builds the client with
 *     automaticDeserialization off), writes accept strings or objects.
 *
 * Every method is async because the real client's are: the point is to
 * exercise the store exactly as written, not to reimplement Redis.
 */

const asString = (value) => (typeof value === 'string' ? value : JSON.stringify(value))

function bound(value) {
  if (value === '-inf') return -Infinity
  if (value === '+inf' || value === 'inf') return Infinity
  return Number(value)
}

export class FakeRedis {
  constructor() {
    /** key -> { type: 'string' | 'set' | 'hash' | 'zset', value } */
    this.data = new Map()
    /** key -> seconds, as last set by EXPIRE */
    this.ttls = new Map()
    /** every command issued, in order, for tests that care about cost */
    this.log = []
  }

  /* ------------------------------------------------------------ plumbing -- */

  #get(key, type) {
    const entry = this.data.get(key)
    if (!entry) return null
    if (entry.type !== type) throw new Error(`WRONGTYPE: ${key} is a ${entry.type}, not a ${type}`)
    return entry.value
  }

  #ensure(key, type, make) {
    let value = this.#get(key, type)
    if (!value) {
      value = make()
      this.data.set(key, { type, value })
    }
    return value
  }

  #tidy(key) {
    const entry = this.data.get(key)
    if (!entry) return
    const empty = entry.type === 'string' ? false : (entry.value.size ?? 0) === 0
    if (empty) {
      this.data.delete(key)
      this.ttls.delete(key)
    }
  }

  #run(name, args, fn) {
    this.log.push(name)
    return fn(...args)
  }

  /* ------------------------------------------------------------- commands -- */

  async get(key) {
    return this.#run('get', [key], (k) => this.#get(k, 'string') ?? null)
  }

  async set(key, value) {
    return this.#run('set', [key, value], (k, v) => {
      this.data.set(k, { type: 'string', value: asString(v) })
      return 'OK'
    })
  }

  async del(...keys) {
    return this.#run('del', keys, (...ks) => {
      let removed = 0
      for (const k of ks) {
        if (this.data.delete(k)) removed += 1
        this.ttls.delete(k)
      }
      return removed
    })
  }

  async incr(key) {
    return this.#run('incr', [key], (k) => {
      const next = Number(this.#get(k, 'string') ?? 0) + 1
      this.data.set(k, { type: 'string', value: String(next) })
      return next
    })
  }

  /** The TTL last set on a key, in seconds, or null. */
  ttl(key) {
    return this.ttls.get(key) ?? null
  }

  async expire(key, seconds) {
    return this.#run('expire', [key, seconds], (k, s) => {
      if (!this.data.has(k)) return 0
      this.ttls.set(k, s)
      return 1
    })
  }

  async sadd(key, ...members) {
    return this.#run('sadd', [key, ...members], (k, ...ms) => {
      const set = this.#ensure(k, 'set', () => new Set())
      let added = 0
      for (const m of ms.map(asString)) {
        if (!set.has(m)) {
          set.add(m)
          added += 1
        }
      }
      return added
    })
  }

  async srem(key, ...members) {
    return this.#run('srem', [key, ...members], (k, ...ms) => {
      const set = this.#get(k, 'set')
      if (!set) return 0
      let removed = 0
      for (const m of ms.map(asString)) if (set.delete(m)) removed += 1
      this.#tidy(k)
      return removed
    })
  }

  async smembers(key) {
    return this.#run('smembers', [key], (k) => [...(this.#get(k, 'set') ?? [])])
  }

  async scard(key) {
    return this.#run('scard', [key], (k) => this.#get(k, 'set')?.size ?? 0)
  }

  async hset(key, record) {
    return this.#run('hset', [key, record], (k, r) => {
      const hash = this.#ensure(k, 'hash', () => new Map())
      let added = 0
      for (const [field, value] of Object.entries(r)) {
        if (!hash.has(field)) added += 1
        hash.set(field, asString(value))
      }
      return added
    })
  }

  async hget(key, field) {
    return this.#run('hget', [key, field], (k, f) => this.#get(k, 'hash')?.get(f) ?? null)
  }

  async hdel(key, ...fields) {
    return this.#run('hdel', [key, ...fields], (k, ...fs) => {
      const hash = this.#get(k, 'hash')
      if (!hash) return 0
      let removed = 0
      for (const f of fs) if (hash.delete(f)) removed += 1
      this.#tidy(k)
      return removed
    })
  }

  /** Like the real client with automatic deserialisation off: Redis's own flat
      [field, value, field, value, …] reply, and an empty array for no key. */
  async hgetall(key) {
    return this.#run('hgetall', [key], (k) => [...(this.#get(k, 'hash') ?? new Map()).entries()].flat())
  }

  async hkeys(key) {
    return this.#run('hkeys', [key], (k) => [...(this.#get(k, 'hash')?.keys() ?? [])])
  }

  async zadd(key, ...pairs) {
    return this.#run('zadd', [key, ...pairs], (k, ...ps) => {
      const zset = this.#ensure(k, 'zset', () => new Map())
      let added = 0
      for (const { score, member } of ps) {
        const m = asString(member)
        if (!zset.has(m)) added += 1
        zset.set(m, Number(score))
      }
      return added
    })
  }

  async zrem(key, ...members) {
    return this.#run('zrem', [key, ...members], (k, ...ms) => {
      const zset = this.#get(k, 'zset')
      if (!zset) return 0
      let removed = 0
      for (const m of ms.map(asString)) if (zset.delete(m)) removed += 1
      this.#tidy(k)
      return removed
    })
  }

  /** Only the by-score form the store uses: `zrange(key, min, max, { byScore, offset, count })`. */
  async zrange(key, min, max, options = {}) {
    return this.#run('zrange', [key, min, max, options], (k, lo, hi, opts) => {
      if (!opts.byScore) throw new Error('FakeRedis.zrange only implements byScore')
      const zset = this.#get(k, 'zset') ?? new Map()
      const inRange = [...zset.entries()]
        .filter(([, score]) => score >= bound(lo) && score <= bound(hi))
        .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
        .map(([member]) => member)
      const offset = opts.offset ?? 0
      return opts.count === undefined ? inRange.slice(offset) : inRange.slice(offset, offset + opts.count)
    })
  }

  /* ------------------------------------------------------ batching -------- */

  multi() {
    return new Batch(this)
  }

  pipeline() {
    return new Batch(this)
  }

  /* ------------------------------------------------------ test helpers ----- */

  /** Members of a sorted set, soonest first. */
  queue(key = 'push:queue') {
    const zset = this.#get(key, 'zset') ?? new Map()
    return [...zset.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([m]) => m)
  }

  score(key, member) {
    return this.#get(key, 'zset')?.get(member) ?? null
  }

  has(key) {
    return this.data.has(key)
  }

  keys(prefix = '') {
    return [...this.data.keys()].filter((k) => k.startsWith(prefix)).sort()
  }
}

/** Queues commands and runs them in order on exec(), returning every result. */
class Batch {
  #redis
  #queue = []

  constructor(redis) {
    this.#redis = redis
    for (const name of [
      'get', 'set', 'del', 'incr', 'expire', 'sadd', 'srem', 'smembers', 'scard',
      'hset', 'hget', 'hdel', 'hkeys', 'hgetall', 'zadd', 'zrem', 'zrange',
    ]) {
      this[name] = (...args) => {
        this.#queue.push(() => this.#redis[name](...args))
        return this
      }
    }
  }

  async exec() {
    const results = []
    for (const run of this.#queue) results.push(await run())
    return results
  }
}
