/* Per-account (and, for the few session-less routes, per-IP) request budgets.
 *
 * Registration is open, so "has a valid token" is not a limit on anything: one
 * script with one account could otherwise drain the shared Gemini free-tier
 * quota for everybody, or keep the reminder queue full of junk. Every route
 * that costs something spends from a budget here first.
 *
 * A fixed window on the Redis the push routes already use: INCR a counter
 * named for the current window, give it a TTL on the way, refuse once it passes
 * the limit. Fixed windows allow a burst at a boundary (up to 2x in a moment);
 * that is fine for what this is for — stopping sustained abuse, not shaping
 * traffic.
 *
 * Fails OPEN when Redis is not configured or not answering. Every AI route
 * has a heuristic already on screen, and push has its own queue limits, so
 * "no rate limiting for a moment" is far better than "no app". A missing
 * configuration is logged once per instance so it can't go unnoticed.
 */

import { ApiError } from './pushRoute.js'
import { getRedis } from './redis.js'

const HOUR = 60 * 60
const DAY = 24 * HOUR

/** Each budget: how many requests per window, per subject (a uid or an IP). */
export const LIMITS = {
  // The two "while you type" helpers fire often (debounced), so they get most.
  suggestTag: { limit: 120, windowSec: HOUR },
  enrichTask: { limit: 120, windowSec: HOUR },
  parseTask: { limit: 60, windowSec: HOUR },
  aiSchedule: { limit: 40, windowSec: HOUR },
  // On the reasoning-tier model, whose free quota is tiny.
  planDay: { limit: 20, windowSec: HOUR },
  // Across every AI route together, so five separate hourly budgets can't add
  // up to an unreasonable day.
  aiDaily: { limit: 300, windowSec: DAY },

  pushSchedule: { limit: 300, windowSec: HOUR },
  pushSubscribe: { limit: 30, windowSec: HOUR },
  pushDiagnose: { limit: 30, windowSec: HOUR },
  // A test sends a real notification to every device of the account.
  pushTest: { limit: 10, windowSec: HOUR },
  // The session-less push calls (a service worker's subscription rotation,
  // turning push off from the sign-in screen), keyed by IP.
  pushAnonymous: { limit: 60, windowSec: HOUR },
}

const TOO_MANY = 'Too many requests — try again later.'

let warnedUnconfigured = false

function redisOrNull() {
  try {
    return getRedis()
  } catch (caught) {
    if (!(caught instanceof ApiError)) throw caught
    if (!warnedUnconfigured) {
      warnedUnconfigured = true
      console.warn('Rate limiting is OFF: the Upstash Redis URL and token are not configured.')
    }
    return null
  }
}

/**
 * Spends one request from `name`'s budget for `subject`, or throws a 429
 * ApiError once it is used up.
 *
 * @param name    a key of LIMITS
 * @param subject who is spending it — a uid, or `ip:<address>`
 */
export async function enforceLimit(name, subject, { now = Date.now() } = {}) {
  const rule = LIMITS[name]
  if (!rule) throw new Error(`Unknown rate limit: ${name}`)
  const redis = redisOrNull()
  if (!redis) return

  const window = Math.floor(now / 1000 / rule.windowSec)
  const key = `rl:${name}:${subject}:${window}`
  let count
  try {
    const [value] = await redis.multi().incr(key).expire(key, rule.windowSec).exec()
    count = Number(value)
  } catch (caught) {
    console.warn(`Rate limit ${name} unavailable; allowing the request.`, caught)
    return
  }
  if (count > rule.limit) throw new ApiError(429, TOO_MANY)
}

/** The route's own budget plus the shared daily one, for every AI route. */
export async function enforceAiLimits(name, uid) {
  await enforceLimit(name, uid)
  await enforceLimit('aiDaily', uid)
}

/** The caller's IP for a session-less route. On Vercel, x-forwarded-for is
    set by the platform (a client-supplied value is overwritten), and its
    first entry is the client. */
export function clientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for']
  const first = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : ''
  const real = typeof req.headers?.['x-real-ip'] === 'string' ? req.headers['x-real-ip'].trim() : ''
  return first || real || 'unknown'
}
