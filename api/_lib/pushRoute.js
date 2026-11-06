/* The request/response glue every /api/push/* route shares, so each route file
 * is only its own decision-making: method check, JSON body parse, and one
 * place that turns a thrown error into an HTTP status. Mirrors the shape the
 * AI routes already use (AuthError -> its status, anything else -> a logged
 * 500 that leaks nothing), it just doesn't repeat it four times.
 */

import { AuthError } from './auth.js'

/** A failure the caller should see as-is: a bad request, an unknown
    subscription, a missing server setting. Its message is safe to show. */
export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/** Vercel parses a JSON body for us, but hands a string through when the
    Content-Type wasn't JSON — a service worker's fetch can do that. */
export function readJsonBody(req) {
  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      throw new ApiError(400, 'Body must be JSON.')
    }
  }
  return req.body && typeof req.body === 'object' ? req.body : {}
}

/** Whether the request carries ANY Authorization header. Routes that accept a
    session OR another proof (the service worker has no session) branch on
    this, then let verifyRequest decide whether the token is actually good. */
export function hasAuthorization(req) {
  return Boolean(req.headers?.authorization ?? req.headers?.Authorization)
}

export function route(name, methods, run) {
  return async function handler(req, res) {
    if (!methods.includes(req.method)) {
      res.setHeader?.('Allow', methods.join(', '))
      return res.status(405).json({ error: 'Method not allowed.' })
    }
    try {
      return await run(req, res)
    } catch (caught) {
      if (caught instanceof AuthError || caught instanceof ApiError) {
        return res.status(caught.status).json({ error: caught.message })
      }
      console.error(`${name} failed`, caught)
      return res.status(500).json({ error: 'Internal error.' })
    }
  }
}
