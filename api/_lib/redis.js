/* The one Redis client the push routes share (Upstash, over HTTPS — no socket
 * to keep open, so it suits a serverless function that may be frozen between
 * calls).
 *
 * Reads the variable names Upstash itself documents AND the ones Vercel's
 * Marketplace integration injects (KV_REST_API_*), so whichever way the
 * database was added, no renaming is needed.
 *
 * automaticDeserialization is off on purpose: the default quietly turns any
 * string that happens to look like JSON or a number into a different type on
 * the way back out. pushStore.js stringifies and parses its own payloads, so
 * what it reads is always exactly what it wrote.
 */

import { Redis } from '@upstash/redis'
import { ApiError } from './pushRoute.js'

let client = null

export function getRedis() {
  if (client) return client
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN
  if (!url || !token) {
    throw new ApiError(500, 'Server is missing the Upstash Redis URL and token.')
  }
  client = new Redis({ url, token, automaticDeserialization: false })
  return client
}
