import { NextResponse } from 'next/server'

// Mirrors api/parse-task.js as a Next.js Route Handler. The Gemini logic
// stays identical; only the transport changes (Vercel serverless fn -> app route).
export async function POST(request) {
  const body = await request.json().catch(() => ({}))
  // TODO(P1): move the body of api/parse-task.js here verbatim, swapping
  // process.env for validated env + Firebase auth check in _lib/auth.js.
  return NextResponse.json({ ok: true, echo: body, todo: 'migrate api/parse-task.js' })
}
