/* Everything a push route accepts from a client is checked here, once, before
 * it can reach Redis — the same stance normalize.js takes toward Firestore
 * documents: nothing that crossed a network boundary is trusted until it has
 * been coerced to exactly the shape the rest of the code assumes.
 */

import { ApiError } from './pushRoute.js'

/** The reminder kinds the client schedules (packages/shared/src/reminders.js —
    tests/pushHandlers.test.jsx fails if the two lists ever drift apart), and
    how long after its due time each one is still worth showing. A "starting
    in 30 minutes" that arrives an hour late is worse than none; the morning
    nudge is still useful over breakfast. */
export const STALE_AFTER_MS = {
  soon: 10 * 60_000,
  start: 10 * 60_000,
  nudge: 3 * 60 * 60_000,
}

export const MAX_REMINDERS = 1000

/* The client schedules 14 days ahead; accepting a day more means a slow clock
   on the phone can never get an honest payload rejected. The past edge is the
   same idea the other way: a minute of grace for clock skew, no more — anything
   older has already been delivered or missed. */
const WINDOW_PAST_MS = 60_000
const WINDOW_FUTURE_MS = 15 * 24 * 60 * 60_000

/* Reminder ids become part of a Redis member string, `uid|id`, split on the
   first `|` — so an id may never contain one. */
const ID_PATTERN = /^[A-Za-z0-9_~.:-]{1,200}$/

/* The server POSTs to whatever endpoint a subscription names, so an endpoint is
   effectively a URL a client gets us to fetch. Left open that is a request
   forgery hook (an internal address, an attacker's host that learns our egress
   IP). Real subscriptions only ever come from a browser vendor's push service,
   so that short list is the whole allowlist. */
const PUSH_HOST_SUFFIXES = [
  'fcm.googleapis.com', // Chrome, Edge-on-Android, Opera, Brave, Samsung Internet
  'push.services.mozilla.com', // Firefox
  'push.apple.com', // Safari, installed iOS/iPadOS web apps
  'notify.windows.com', // Edge (WNS)
]

/** The push service's host for an endpoint — all that is safe to show or log,
    since the full endpoint is a capability URL that can wake the device. */
export function hostOf(endpoint) {
  try {
    return new URL(endpoint).hostname
  } catch {
    return 'unknown'
  }
}

export function isPushEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false
  let url
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false
  if (url.port && url.port !== '443') return false
  const host = url.hostname.toLowerCase()
  return PUSH_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
}

const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/

/** A base64url string that decodes to exactly `bytes` bytes. web-push throws on
    anything else at SEND time, which would be a reminder lost at the worst
    moment — so it is refused here, at subscribe time, instead. */
function isKey(value, bytes) {
  return typeof value === 'string' && BASE64URL.test(value) && Buffer.from(value, 'base64url').length === bytes
}

/** `PushSubscription.toJSON()` -> the two fields web-push needs. */
export function readSubscription(raw) {
  if (!raw || typeof raw !== 'object') throw new ApiError(400, 'subscription is required.')
  if (!isPushEndpoint(raw.endpoint)) {
    throw new ApiError(400, 'subscription.endpoint is not a supported push service URL.')
  }
  const p256dh = raw.keys?.p256dh
  const auth = raw.keys?.auth
  if (!isKey(p256dh, 65) || !isKey(auth, 16)) {
    throw new ApiError(400, 'subscription.keys.p256dh and subscription.keys.auth are required.')
  }
  return { endpoint: raw.endpoint, keys: { p256dh, auth } }
}

/** Clipped by code point, not UTF-16 unit, so an emoji is never cut in half. */
export function clip(text, max) {
  const chars = [...text.trim()]
  return chars.length > max ? chars.slice(0, max).join('') : chars.join('')
}

/** Where a notification click opens. Only a same-origin path: the service
    worker passes this straight to `clients.openWindow`. */
function safeUrl(url) {
  return typeof url === 'string' && url.length <= 200 && /^\/(?![/\\])/.test(url) ? url : '/'
}

/** One reminder from the client, or null when it isn't usable. Dropping a bad
    entry beats rejecting the whole list: one malformed reminder should never
    cost a person the other three hundred. */
export function readReminder(raw, now) {
  if (!raw || typeof raw !== 'object') return null
  const { id, kind, fireAt, title, body, tag, url } = raw
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return null
  if (!Object.hasOwn(STALE_AFTER_MS, kind)) return null
  if (!Number.isFinite(fireAt)) return null
  const at = Math.round(fireAt)
  if (at <= now - WINDOW_PAST_MS || at > now + WINDOW_FUTURE_MS) return null
  if (typeof title !== 'string' || !title.trim()) return null

  const reminder = {
    id,
    kind,
    fireAt: at,
    title: clip(title, 200),
    body: typeof body === 'string' ? clip(body, 300) : '',
    url: safeUrl(url),
  }
  if (typeof tag === 'string' && tag.trim()) reminder.tag = clip(tag, 120)
  return reminder
}

/** The whole `reminders` array. Later entries win over earlier ones with the
    same id, which keeps one id one queue slot. */
export function readReminders(list, now) {
  if (!Array.isArray(list)) throw new ApiError(400, 'reminders must be an array.')
  if (list.length > MAX_REMINDERS) throw new ApiError(400, `At most ${MAX_REMINDERS} reminders per request.`)
  const byId = new Map()
  let skipped = 0
  for (const raw of list) {
    const reminder = readReminder(raw, now)
    if (reminder) byId.set(reminder.id, reminder)
    else skipped += 1
  }
  return { reminders: [...byId.values()], skipped }
}
