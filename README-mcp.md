# Cadence MCP server

An [MCP](https://modelcontextprotocol.io) server inside the app, so an AI client
(Claude, ChatGPT, Cursor, Gemini CLI…) can read and update **your** schedule by
URL. It speaks Streamable HTTP at **`/mcp`** and lives in [`mcp/`](mcp), kept
apart from the UI and the other `/api` routes; [`api/mcp.js`](api/mcp.js) is the
thin Vercel entry.

## What it exposes

| Kind | Name | What it does |
| --- | --- | --- |
| Tool (read) | `get_schedule` | One day or a range: events, tasks (with done state), free time. Repeating tasks appear as that day's occurrence. |
| Tool (read) | `find_tasks` | List or search: `upcoming` (14 days), `overdue`, `inbox`, `all`; filter by text and tag. |
| Tool (write) | `create_task` | Add a task — inbox, or dated, optionally timed, tagged, with a priority. |
| Tool (write) | `set_task_done` | Tick a task (or one day of a repeating task) done, or reopen it. Idempotent. |
| Resource | `cadence://tags` | Every tag with its full path, so `create_task` never guesses a tag name. |
| Resource | `cadence://day/{date}` | A readable sheet for one day: events, tasks, free time and that day's Journal note. |

**Nothing can be deleted** through it, and `create_task` never creates a tag.
Writes go through the same normalisers the app uses, so what lands in Firestore
is what the app would have written itself.

## 1. Environment variables

Add these in **Vercel → Project Settings → Environment Variables** (Production,
and Preview if you want it there), then redeploy. For local use, put them in
`.env.local`. They are all server-side — none is `VITE_`-prefixed.

```bash
# REQUIRED — endpoint refuses every call until all three are set
MCP_API_KEY=            # >= 32 chars:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
MCP_USER_UID=           # Firebase console → Authentication → Users → "User UID"
FIREBASE_SERVICE_ACCOUNT=   # service-account key JSON, preferably base64 (see below)

# RECOMMENDED
MCP_TIMEZONE=Asia/Manila    # IANA zone that defines "today" for you; default UTC

# OPTIONAL
MCP_URL_KEY=            # enables /mcp/k/<key> for ChatGPT / claude.ai web — see "Security"
MCP_ALLOWED_ORIGINS=    # comma-separated browser origins; blank = any
MCP_DEV_PORT=           # `npm run mcp:dev` only; default 8787
```

Already present and reused: `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
rate-limit the endpoint (600 requests/hour; it fails open without Redis, like the
other routes).

**The service account.** Firebase console → Project settings → **Service
accounts** → *Generate new private key*. Base64 it so line breaks survive an env
var, paste the result into `FIREBASE_SERVICE_ACCOUNT`, then **delete the key
file**:

```bash
node -e "console.log(require('fs').readFileSync('key.json').toString('base64'))"
```

## 2. Run and test locally

```bash
npm run mcp:dev        # http://localhost:8787/mcp   (reads .env.local, 127.0.0.1 only)
```

It runs the same handler Vercel does, against your **real** Firestore as
`MCP_USER_UID` — a task created through it shows up in `npm run dev`.

### With the official MCP Inspector

> **Node version.** Inspector 2.x needs Node `^22.23.4`, `^24.22.1` or `>=26.12.1`.
> If `node -v` is older, upgrade Node first (or use the legacy line with
> `npx @modelcontextprotocol/inspector@v1-latest`; the steps below are the same).

```bash
npx @modelcontextprotocol/inspector
```

Open the URL it prints, then:

1. **Transport:** *Streamable HTTP*
2. **URL:** `http://localhost:8787/mcp`
3. **Authentication:** add the header `Authorization` = `Bearer <your MCP_API_KEY>`
4. **Connect**, then *Tools → List* and run `get_schedule` (no arguments = today).
   Try *Resources* → `cadence://day/<today>`.

Scriptable form (flags taken from Inspector 2.15's own CLI definition):

```bash
npx @modelcontextprotocol/inspector --cli --server-url http://localhost:8787/mcp \
  --transport http --header "Authorization: Bearer $MCP_API_KEY" --method tools/list

npx @modelcontextprotocol/inspector --cli --server-url http://localhost:8787/mcp \
  --transport http --header "Authorization: Bearer $MCP_API_KEY" \
  --method tools/call --tool-name get_schedule --tool-args-json '{"days":3}'
```

### With curl

```bash
# preflight — 204 with Access-Control-* headers, no key needed
curl -i -X OPTIONS http://localhost:8787/mcp -H "Origin: https://claude.ai" \
  -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type"

# no key → 401
curl -i -X POST http://localhost:8787/mcp -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" -d '{}'

# with the key → the tool list
curl -s -X POST http://localhost:8787/mcp -H "Authorization: Bearer $MCP_API_KEY" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 3. Connect a client

Replace `YOUR-DOMAIN` with your deployed Vercel domain. The URL must be **public
HTTPS** — a hosted client such as ChatGPT or claude.ai cannot reach `localhost`.

### Claude Code

```bash
claude mcp add --transport http cadence https://YOUR-DOMAIN/mcp \
  --header "Authorization: Bearer YOUR_MCP_API_KEY"
```

or in a project `.mcp.json`:

```json
{
  "mcpServers": {
    "cadence": {
      "type": "http",
      "url": "https://YOUR-DOMAIN/mcp",
      "headers": { "Authorization": "Bearer ${CADENCE_MCP_KEY}" }
    }
  }
}
```

### Claude Desktop (via `mcp-remote`)

`claude_desktop_config.json`. The token goes in `env` so there is no space in an
argument (which Windows mangles):

```json
{
  "mcpServers": {
    "cadence": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://YOUR-DOMAIN/mcp", "--header", "Authorization:${CADENCE_AUTH}"],
      "env": { "CADENCE_AUTH": "Bearer YOUR_MCP_API_KEY" }
    }
  }
}
```

### Cursor

`.cursor/mcp.json` (or `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "cadence": {
      "url": "https://YOUR-DOMAIN/mcp",
      "headers": { "Authorization": "Bearer ${env:CADENCE_MCP_KEY}" }
    }
  }
}
```

### Gemini CLI

`~/.gemini/settings.json`. Note `httpUrl` (Streamable HTTP) — plain `url` means
SSE, which this server does not offer:

```json
{
  "mcpServers": {
    "cadence": {
      "httpUrl": "https://YOUR-DOMAIN/mcp",
      "headers": { "Authorization": "Bearer $CADENCE_MCP_KEY" }
    }
  }
}
```

### ChatGPT and claude.ai (web)

These add a connector by URL and, as far as OpenAI documents, offer only
**OAuth or no authentication** — there is nowhere to put a bearer header (claude.ai's
support for custom headers is unconfirmed). For them, enable the secret-URL form:

1. Set `MCP_URL_KEY` (≥ 32 chars, **different** from `MCP_API_KEY`) and redeploy.
2. Add a custom connector / MCP server with the URL
   **`https://YOUR-DOMAIN/mcp/k/YOUR_MCP_URL_KEY`**.
3. Authentication: **None** (the secret is in the URL).

Menu names change often (ChatGPT: *Settings → Connectors / Developer mode*;
claude.ai: *Settings → Connectors → Add custom connector*) and custom
connectors need a paid plan — check the product's own docs for the current path.

### Gemini app

Not possible: the consumer Gemini app has no custom MCP support. Use Gemini CLI.

## Security

- **The key is the whole boundary.** Anyone with `MCP_API_KEY` can read your tasks,
  events and today's Journal note, and add or tick tasks. Treat it like a password;
  rotate it by changing the env var and redeploying.
- **The Admin SDK ignores `firestore.rules`.** The server therefore never trusts a
  request for the account: the uid comes only from `MCP_USER_UID`, every path is
  built from it, and every id a tool receives is checked against
  `^[A-Za-z0-9_-]{1,128}$` before it can become part of a path. The tests assert
  that another account's documents are unreachable.
- **The secret URL is weaker than the header.** It is a capability URL: it appears
  in Vercel's request logs, in the connector's saved settings, and in any browser
  history. That is why it is off by default, has its own key, and can be rotated
  without touching the header key. Leave `MCP_URL_KEY` blank if you only use
  header-capable clients.
- **The service account is a full-project credential.** Keep it only in Vercel's
  env vars. If it leaks, revoke it in Google Cloud → IAM → Service accounts.
- **Wildcard CORS is deliberate.** Auth is a bearer secret, never a cookie, so a
  foreign page cannot ride a signed-in session. Set `MCP_ALLOWED_ORIGINS` to
  narrow it.
- **Prompt injection.** Task titles, notes and the day's Journal note are read
  into the assistant's context. If you paste untrusted text into a task, a
  connected assistant will see it — and it can create or tick tasks.
- **Failures are generic.** A database error is logged server-side and the client
  only sees "Something went wrong…"; project ids and paths are never sent.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `401 Unauthorized` | Wrong or missing key. The header must be exactly `Authorization: Bearer <key>`; with the URL form, the path key must equal `MCP_URL_KEY`. |
| `500 The MCP server is not configured` | One of the three required variables is missing or invalid. The reason is in the function log (Vercel → Logs), not in the response. |
| Tools fail with "Something went wrong…" | Usually the service account (wrong project, or the key was revoked). Check the log line `mcp tool … failed`. |
| "Today" is off by hours | Set `MCP_TIMEZONE`; the server runs in UTC. |
| `GET /mcp` returns 405 | Expected. The server is stateless and has no SSE stream; clients fall back to POST. |
| Client says "could not connect" with a 401 | The client is trying OAuth discovery. This server uses a static key, not OAuth — use a header-capable client or the secret URL. |
| `429` | The hourly budget (600) is spent; it resets at the next hour. |

## Not included

- **OAuth.** Authentication is one static key for one account. Several people, or
  per-person revocation, would need a real OAuth flow.
- **SSE transport.** Long-lived streams do not fit a serverless function, and every
  client above speaks Streamable HTTP.
- **Deleting or editing tasks, events and notes.** Out of scope for now; the four
  tools are deliberately the smallest useful set.
