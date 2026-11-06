/* All of the push feature's Redis access, behind one factory that takes the
 * client as an argument — so the route logic is exercised against an in-memory
 * stand-in (tests/fakeRedis.js) exactly the way functions/lib/runDailyDigest.js
 * is exercised against functions/test/fakeFirestore.js.
 *
 * Keys:
 *   push:sub:{subId}   JSON  { uid, endpoint, keys, ua, createdAt, updatedAt }
 *                      subId = sha256(endpoint), so an endpoint is looked up
 *                      directly and never stored as a key itself
 *   push:subs:{uid}    SET   the subIds a person has registered (one per device)
 *   push:rem:{uid}     HASH  reminderId -> JSON reminder (the payload to show)
 *   push:queue         ZSET  "{uid}|{reminderId}" scored by due time in ms —
 *                      "what is due now" is one ranged read
 *
 * Two invariants hold across every write here:
 *   - an endpoint belongs to exactly ONE person. A browser has one push
 *     subscription per origin, so when someone else signs in on the same
 *     device the newest registration takes it over (a device is a place, not
 *     an account); the previous owner simply stops receiving there.
 *   - a person with no registered device has no queued reminders. Nothing
 *     could receive them, and leaving them behind is how a queue fills with
 *     work no one will ever do.
 */

import { createHash } from 'node:crypto'

const QUEUE = 'push:queue'

/* A person's schedule is rewritten whenever they open the app. If they stop
   opening it, the hash expires on its own a day after the last reminder it
   could contain would have been due, instead of lingering forever. */
const SCHEDULE_TTL_SECONDS = 16 * 24 * 60 * 60

/* Variadic commands are sent in slices so one huge schedule is never one huge
   command. */
const CHUNK = 200

const subKey = (subId) => `push:sub:${subId}`
const userSubsKey = (uid) => `push:subs:${uid}`
const remKey = (uid) => `push:rem:${uid}`
const memberOf = (uid, reminderId) => `${uid}|${reminderId}`

function splitMember(member) {
  const bar = typeof member === 'string' ? member.indexOf('|') : -1
  return bar > 0 ? { uid: member.slice(0, bar), id: member.slice(bar + 1) } : null
}

export const subIdOf = (endpoint) => createHash('sha256').update(endpoint).digest('base64url')

/** Reads tolerate both a JSON string and an already-parsed object, so the
    store behaves the same whether or not the client auto-deserialises. */
function parse(raw) {
  if (raw == null) return null
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function slices(list, size = CHUNK) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export function createPushStore(redis) {
  /* ------------------------------------------------------------ schedule -- */

  /** Removes every queued reminder a person has. Returns how many there were. */
  async function clearSchedule(uid) {
    const ids = await redis.hkeys(remKey(uid))
    if (ids.length === 0) return 0
    const tx = redis.multi()
    for (const part of slices(ids)) tx.zrem(QUEUE, ...part.map((id) => memberOf(uid, id)))
    tx.del(remKey(uid))
    await tx.exec()
    return ids.length
  }

  async function dropScheduleIfNoDevices(uid) {
    if ((await redis.scard(userSubsKey(uid))) === 0) await clearSchedule(uid)
  }

  /** Swaps a person's whole schedule for `reminders` in one transaction, so a
      reader never sees half of the old list and half of the new. */
  async function replaceSchedule(uid, reminders) {
    const previous = await redis.hkeys(remKey(uid))
    const tx = redis.multi()
    for (const part of slices(previous)) tx.zrem(QUEUE, ...part.map((id) => memberOf(uid, id)))
    tx.del(remKey(uid))
    if (reminders.length > 0) {
      tx.hset(remKey(uid), Object.fromEntries(reminders.map((r) => [r.id, JSON.stringify(r)])))
      for (const part of slices(reminders)) {
        tx.zadd(QUEUE, ...part.map((r) => ({ score: r.fireAt, member: memberOf(uid, r.id) })))
      }
      tx.expire(remKey(uid), SCHEDULE_TTL_SECONDS)
    }
    await tx.exec()
    return reminders.length
  }

  /** How many reminders a person has queued and which comes next — what the
      app's diagnostics show, so "did my schedule reach the server?" has an
      answer. `next` is the soonest one not already more than a minute past. */
  async function scheduleSummary(uid, now = Date.now()) {
    const raw = await redis.hgetall(remKey(uid))
    // With automatic deserialisation off, the client returns Redis's own flat
    // [field, value, field, value, …] reply; accept an object too.
    const values = Array.isArray(raw)
      ? raw.filter((_, i) => i % 2 === 1)
      : Object.values(raw ?? {})

    let count = 0
    let next = null
    for (const value of values) {
      const reminder = parse(value)
      if (!reminder) continue
      count += 1
      const current = reminder.fireAt >= now - 60_000
      if (current && (!next || reminder.fireAt < next.fireAt)) {
        next = { kind: reminder.kind, title: reminder.title, fireAt: reminder.fireAt }
      }
    }
    return { count, next }
  }

  /** Puts one reminder back on the queue for `at` — a delivery that failed for
      a reason that may pass. claimDue deleted its payload when it took it. */
  async function requeue(uid, reminder, at) {
    const tx = redis.multi()
    tx.hset(remKey(uid), { [reminder.id]: JSON.stringify(reminder) })
    tx.zadd(QUEUE, { score: at, member: memberOf(uid, reminder.id) })
    tx.expire(remKey(uid), SCHEDULE_TTL_SECONDS)
    await tx.exec()
  }

  /**
   * Takes up to `limit` reminders that are due at `now` and hands them to the
   * caller exclusively.
   *
   * "Exclusively" is the ZREM: it reports how many members it actually
   * removed, so when two overlapping ticks read the same due list, exactly one
   * of them wins each member and the other gets 0 and skips it. That is what
   * stops a slow run and the next minute's run from both sending a reminder.
   *
   * @return [{ uid, id, reminder }] — `reminder` is null when the payload is
   *         gone, i.e. the person replaced their schedule after it was queued
   */
  async function claimDue(now, limit = 200) {
    const due = await redis.zrange(QUEUE, '-inf', now, { byScore: true, offset: 0, count: limit })
    if (due.length === 0) return []

    const race = redis.pipeline()
    for (const member of due) race.zrem(QUEUE, member)
    const won = await race.exec()

    const mine = []
    due.forEach((member, i) => {
      const parts = Number(won[i]) === 1 ? splitMember(member) : null
      if (parts) mine.push(parts)
    })
    if (mine.length === 0) return []

    // Read each payload and delete it in the same round trip: once claimed, it
    // is the caller's alone, and a fired reminder shouldn't linger in the hash.
    const read = redis.pipeline()
    for (const { uid, id } of mine) {
      read.hget(remKey(uid), id)
      read.hdel(remKey(uid), id)
    }
    const results = await read.exec()
    return mine.map(({ uid, id }, i) => ({ uid, id, reminder: parse(results[i * 2]) }))
  }

  /* ------------------------------------------------------- subscriptions -- */

  async function getSubscription(endpoint) {
    const subId = subIdOf(endpoint)
    const record = parse(await redis.get(subKey(subId)))
    return record ? { subId, ...record } : null
  }

  /** Registers (or refreshes) a device for `uid`. If the endpoint was another
      person's, it moves — see the invariants at the top. */
  async function upsertSubscription(uid, { endpoint, keys }, { ua = '', now = Date.now() } = {}) {
    const subId = subIdOf(endpoint)
    const previous = parse(await redis.get(subKey(subId)))
    const record = {
      uid,
      endpoint,
      keys,
      ua,
      createdAt: previous?.uid === uid ? (previous.createdAt ?? now) : now,
      updatedAt: now,
    }
    const tx = redis.multi()
    if (previous && previous.uid !== uid) tx.srem(userSubsKey(previous.uid), subId)
    tx.set(subKey(subId), JSON.stringify(record))
    tx.sadd(userSubsKey(uid), subId)
    await tx.exec()

    const takenFrom = previous && previous.uid !== uid ? previous.uid : null
    if (takenFrom) await dropScheduleIfNoDevices(takenFrom)
    return { subId, takenFrom }
  }

  async function removeSubscription(endpoint) {
    const subId = subIdOf(endpoint)
    const record = parse(await redis.get(subKey(subId)))
    if (!record) return { removed: false, uid: null }
    await redis.multi().del(subKey(subId)).srem(userSubsKey(record.uid), subId).exec()
    await dropScheduleIfNoDevices(record.uid)
    return { removed: true, uid: record.uid }
  }

  /** Every device a person has registered, ready to hand to web-push. A subId
      whose record has expired or been removed is pruned from the set here, so
      the set can't accumulate ghosts. */
  async function subsForUser(uid) {
    const ids = await redis.smembers(userSubsKey(uid))
    if (ids.length === 0) return []
    const read = redis.pipeline()
    for (const id of ids) read.get(subKey(id))
    const records = (await read.exec()).map(parse)

    const live = []
    const ghosts = []
    ids.forEach((id, i) => {
      const record = records[i]
      if (record?.endpoint && record.keys) {
        live.push({
          subId: id,
          endpoint: record.endpoint,
          keys: record.keys,
          ua: record.ua ?? '',
          registeredAt: record.updatedAt ?? record.createdAt ?? null,
        })
      } else {
        ghosts.push(id)
      }
    })
    if (ghosts.length > 0) await redis.srem(userSubsKey(uid), ...ghosts)
    return live
  }

  /** Account deletion: every device and every queued reminder. */
  async function purgeUser(uid) {
    const ids = await redis.smembers(userSubsKey(uid))
    if (ids.length > 0) {
      const tx = redis.multi()
      for (const id of ids) tx.del(subKey(id))
      tx.del(userSubsKey(uid))
      await tx.exec()
    }
    const reminders = await clearSchedule(uid)
    return { subscriptions: ids.length, reminders }
  }

  return {
    clearSchedule,
    replaceSchedule,
    scheduleSummary,
    requeue,
    claimDue,
    getSubscription,
    upsertSubscription,
    removeSubscription,
    subsForUser,
    purgeUser,
  }
}
