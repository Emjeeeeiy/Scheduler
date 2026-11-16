/* Everything the MCP endpoint reads from the environment, validated in one
 * place so the handler can fail CLOSED: a missing or weak setting turns the
 * endpoint off ("not configured") instead of leaving it half-open.
 *
 *   MCP_API_KEY       bearer secret for `Authorization: Bearer <key>` (>= 32 chars)
 *   MCP_URL_KEY       OPTIONAL second secret that enables /mcp/k/<key>, for web
 *                     clients (ChatGPT, claude.ai) that cannot send a header.
 *                     Kept separate from MCP_API_KEY so it can be rotated alone.
 *   MCP_USER_UID      the ONE Firebase account whose data this endpoint exposes
 *   MCP_TIMEZONE      IANA zone that defines "today" (the server runs in UTC)
 *   MCP_ALLOWED_ORIGINS  comma-separated browser origins; default "*"
 *   FIREBASE_SERVICE_ACCOUNT  read by firestore.js, only checked for presence here
 *
 * The uid comes from here and nowhere else — never from a request or a tool
 * argument. firebase-admin bypasses firestore.rules, so this is the boundary.
 */

export const MIN_KEY_LENGTH = 32

/** Firebase uids are up to 128 characters of letters, digits, `-` and `_`. Also
    the shape every id handed to a tool must match, which is what stops a
    crafted id from addressing a path outside the configured account. */
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

const clean = (value) => (typeof value === 'string' ? value.trim() : '')

export function isValidTimeZone(zone) {
  if (typeof zone !== 'string' || zone === '') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/**
 * @return {{
 *   ready: boolean,
 *   problems: string[],
 *   apiKey: string, urlKey: string, uid: string, timeZone: string,
 *   allowedOrigins: string[], hasServiceAccount: boolean,
 * }}
 *   `problems` is for the server log only — it is never sent to a client.
 */
export function readMcpConfig(env = process.env) {
  const problems = []

  let apiKey = clean(env.MCP_API_KEY)
  if (apiKey.length < MIN_KEY_LENGTH) {
    if (apiKey) problems.push(`MCP_API_KEY must be at least ${MIN_KEY_LENGTH} characters.`)
    else problems.push('MCP_API_KEY is not set.')
    apiKey = ''
  }

  let urlKey = clean(env.MCP_URL_KEY)
  if (urlKey && urlKey.length < MIN_KEY_LENGTH) {
    problems.push(`MCP_URL_KEY must be at least ${MIN_KEY_LENGTH} characters; the URL form is off.`)
    urlKey = ''
  }
  // One secret for both would make the URL form (which ends up in logs and
  // connector settings) a copy of the header secret.
  if (urlKey && urlKey === apiKey) {
    problems.push('MCP_URL_KEY must differ from MCP_API_KEY; the URL form is off.')
    urlKey = ''
  }
  // The key rides in a URL path segment, so it has to survive one unescaped.
  if (urlKey && !/^[A-Za-z0-9._~-]+$/.test(urlKey)) {
    problems.push('MCP_URL_KEY may only use letters, digits and . _ ~ -; the URL form is off.')
    urlKey = ''
  }

  const uid = clean(env.MCP_USER_UID)
  if (!ID_PATTERN.test(uid)) {
    problems.push(uid ? 'MCP_USER_UID is not a valid Firebase uid.' : 'MCP_USER_UID is not set.')
  }

  const zone = clean(env.MCP_TIMEZONE)
  let timeZone = 'UTC'
  if (zone) {
    if (isValidTimeZone(zone)) timeZone = zone
    else problems.push(`MCP_TIMEZONE "${zone}" is not a valid IANA time zone; using UTC.`)
  }

  const allowedOrigins = clean(env.MCP_ALLOWED_ORIGINS)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  const hasServiceAccount = clean(env.FIREBASE_SERVICE_ACCOUNT) !== ''
  if (!hasServiceAccount) problems.push('FIREBASE_SERVICE_ACCOUNT is not set.')

  return {
    ready: apiKey !== '' && ID_PATTERN.test(uid) && hasServiceAccount,
    problems,
    apiKey,
    urlKey,
    uid: ID_PATTERN.test(uid) ? uid : '',
    timeZone,
    allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : ['*'],
    hasServiceAccount,
  }
}
