/* Everything an AI route accepts from a client, checked and SIZED here before
 * any of it reaches a prompt — the same stance pushInput.js takes for Redis.
 *
 * The sizes are the point. A prompt is paid for by the token, and Vercel will
 * accept a ~4.5 MB body, so an uncapped field is a way to spend the whole
 * shared Gemini quota in a handful of requests. Each cap below sits well above
 * anything the app itself ever sends (see the callers in TaskEditor.jsx,
 * TodayView.jsx, AiChatModal.jsx and App.jsx); anything past it is clipped or
 * dropped, never rejected outright, because every one of these routes is an
 * enhancement with a heuristic already on screen.
 */

import { clip } from './pushInput.js'

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const CAPS = {
  title: 300,
  quickAddText: 500,
  tags: 100,
  tagId: 100,
  tagName: 60,
  slots: 60,
  history: 15,
  historyTitle: 200,
  planTasks: 100,
  taskTitle: 200,
  existingTasks: 40,
  messages: 12,
  messageChars: 2000,
}

const PRIORITIES = new Set(['low', 'normal', 'high'])
const MINUTES_PER_DAY = 24 * 60

const isId = (value) => typeof value === 'string' && value.length > 0 && value.length <= CAPS.tagId
const isMinute = (value) => Number.isInteger(value) && value >= 0 && value <= MINUTES_PER_DAY
const finiteOrNull = (value) => (Number.isFinite(value) ? value : null)

/** A trimmed, clipped string, or '' when it isn't one. */
export function readText(raw, max) {
  return typeof raw === 'string' ? clip(raw, max) : ''
}

/** `[{ id, name }]` — the account's tags, as offered to the model. */
export function readTags(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((tag) => isId(tag?.id) && typeof tag?.name === 'string')
    .slice(0, CAPS.tags)
    .map((tag) => ({ id: tag.id, name: clip(tag.name, CAPS.tagName) }))
}

/** `[{ startMin, endMin }]`, or with `dated`, `[{ date, startMin, endMin }]`. */
export function readSlots(raw, { dated = false } = {}) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (slot) =>
        isMinute(slot?.startMin) &&
        isMinute(slot?.endMin) &&
        slot.endMin > slot.startMin &&
        (!dated || (typeof slot.date === 'string' && ISO_DATE.test(slot.date))),
    )
    .slice(0, CAPS.slots)
    .map((slot) => (dated ? { date: slot.date, startMin: slot.startMin, endMin: slot.endMin } : { startMin: slot.startMin, endMin: slot.endMin }))
}

/** The account's recent tasks: titles, tags and timings only. */
export function readHistory(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, CAPS.history)
    .filter((entry) => typeof entry?.title === 'string' && entry.title.trim())
    .map((entry) => ({
      title: clip(entry.title, CAPS.historyTitle),
      tagId: isId(entry.tagId) ? entry.tagId : null,
      durationMin: finiteOrNull(entry.durationMin),
      startMin: finiteOrNull(entry.startMin),
    }))
}

/** Plan-day's candidates. A task without a usable length can't be placed, so
    it is dropped rather than guessed at. */
export function readPlanTasks(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (task) =>
        isId(task?.id) &&
        typeof task?.title === 'string' &&
        Number.isInteger(task?.durationMin) &&
        task.durationMin > 0 &&
        task.durationMin <= MINUTES_PER_DAY,
    )
    .slice(0, CAPS.planTasks)
    .map((task) => ({
      id: task.id,
      title: clip(task.title, CAPS.taskTitle),
      durationMin: task.durationMin,
      priority: PRIORITIES.has(task.priority) ? task.priority : 'normal',
    }))
}

/** The AI chat's open tasks — the only things an update or removal may name. */
export function readExistingTasks(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (task) =>
        isId(task?.id) &&
        typeof task?.title === 'string' &&
        (task.date === null || task.date === undefined || (typeof task.date === 'string' && ISO_DATE.test(task.date))),
    )
    .slice(0, CAPS.existingTasks)
    .map((task) => ({
      id: task.id,
      title: clip(task.title, CAPS.taskTitle),
      date: task.date ?? null,
      startMin: finiteOrNull(task.startMin),
      durationMin: finiteOrNull(task.durationMin),
      tagId: isId(task.tagId) ? task.tagId : null,
    }))
}

const ROLES = new Set(['user', 'assistant'])

/** The chat so far: the most recent turns, each clipped. */
export function readMessages(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((m) => ROLES.has(m?.role) && typeof m?.content === 'string' && m.content.trim())
    .slice(-CAPS.messages)
    .map((m) => ({ role: m.role, content: clip(m.content, CAPS.messageChars) }))
}
