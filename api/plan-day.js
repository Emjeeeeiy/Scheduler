/* POST /api/plan-day
 *
 * The one route latency doesn't matter for — "Plan my day" runs once, on
 * demand, and src/lib/autoSchedule.js's planDay() already rendered a
 * proposal on screen by the time this call is even made, so there's
 * nothing for the person to wait on with nothing to look at.
 *
 * Where planDay() is mechanical gap-packing (priority, then age, first-fit),
 * this asks Gemini to reason about the SAME real free time and task list —
 * batching similar work, putting the heavier task earlier — and returns
 * only if isValidAiPlan (src/lib/autoSchedule.js) accepts it whole. That
 * import works unmodified here because Vercel's function bundler traces the
 * real dependency graph from this file, wherever it lives in the repo —
 * unlike functions/ (Firebase, which only uploads its own directory and
 * needs scripts/syncSharedLib.mjs to cope), nothing needs copying for a
 * Vercel function to reach into src/lib/.
 */

import { verifyRequest } from './_lib/auth.js'
import { generateJson } from './_lib/gemini.js'
import { readJsonBody, route } from './_lib/pushRoute.js'
import { enforceAiLimits } from './_lib/rateLimit.js'
import { readPlanTasks, readSlots } from './_lib/aiInput.js'
import { isValidAiPlan } from '@cadence/shared/autoSchedule.js'

const MODEL = process.env.GEMINI_MODEL_PLAN ?? 'gemini-3.5-flash'

const SYSTEM_INSTRUCTION = `You lay a person's open tasks out across their real free time today.
You are given the day's actual free windows and a list of tasks with how long each takes and its priority.
Place tasks with good judgement, not just mechanically: put demanding or high-priority work in an earlier window where reasonable, batch similar or related tasks near each other rather than scattering them, and leave a task out entirely rather than forcing an awkward fit.
Every placement must use a real task id you were given and a startMin that, together with that task's own durationMin, fits ENTIRELY inside one of the free windows you were given, with no two placements overlapping.
Not every task needs to be placed — an empty result is a legitimate answer when nothing fits well.`

const SCHEMA = {
  type: 'object',
  properties: {
    placements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          startMin: { type: 'integer' },
        },
        required: ['taskId', 'startMin'],
      },
    },
  },
  required: ['placements'],
}

export default route('plan-day', ['POST'], async (req, res) => {
  const uid = await verifyRequest(req)
  const body = readJsonBody(req)

  const tasks = readPlanTasks(body.tasks)
  const slots = readSlots(body.slots)
  if (tasks.length === 0 || slots.length === 0) {
    return res.status(200).json({ placements: [] })
  }

  await enforceAiLimits('planDay', uid)

  const prompt = [
    'Free windows today (minutes since local midnight):',
    ...slots.map((s) => `- ${s.startMin}-${s.endMin}`),
    '',
    'Open tasks:',
    ...tasks.map(
      (t) => `- id ${JSON.stringify(t.id)}: ${JSON.stringify(t.title)}, ${t.durationMin} min, priority ${t.priority}`,
    ),
  ].join('\n')

  const result = await generateJson({
    model: MODEL,
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    schema: SCHEMA,
    // Matches (with a little margin) planDayAi's own 15000ms client
    // budget — see enrich-task.js's identical fix for the full reasoning.
    timeoutMs: 14000,
  })

  const placements = Array.isArray(result?.placements) ? result.placements : []
  // Server-side validation is a first line of defense, using the exact
  // slots/tasks THIS request supplied — the client re-validates again
  // against its own live data before ever writing anything, since a
  // schedule change between this request and the moment someone clicks
  // Accept is a real possibility this route has no way to see.
  if (!isValidAiPlan(placements, { tasks, slots })) {
    return res.status(200).json({ placements: [] })
  }

  return res.status(200).json({ placements })
})
