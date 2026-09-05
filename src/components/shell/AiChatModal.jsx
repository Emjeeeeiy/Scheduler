import { useRef, useState } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { useModalA11y } from '../../lib/useModalA11y.js'
import { useNow } from '../../lib/useNow.js'
import { addDays, MINUTES_PER_DAY } from '../../lib/date.js'
import { freeSlots } from '../../lib/slots.js'
import { aiScheduleAi } from '../../lib/aiClient.js'
import { CloseIcon } from '../icons.jsx'

// How far ahead real free time is offered to the model, and how many
// windows per day are worth sending — a week is enough for "this week" /
// "next Tuesday" phrasing without the prompt growing without bound, and a
// handful of windows per day is plenty since a day rarely has more than a
// few usefully-sized gaps anyway.
const LOOKAHEAD_DAYS = 7
// Trimmed from an original 4 after live testing showed this route's real
// round-trip running long enough to hit even a generous client timeout —
// up to 7 days x 4 slots was the single largest variable-size part of the
// prompt, and 2 real windows a day is still enough for the model to place
// something sensibly without carrying every minor gap along too.
const MAX_SLOTS_PER_DAY = 2

// Same cap as enrich-task.js's own MAX_HISTORY — enough of this account's
// tagging pattern to be useful without dominating the prompt.
const MAX_HISTORY = 15
// How many of the account's current open (not done) tasks are offered as
// real update/remove targets — see api/ai-schedule.js's own MAX_EXISTING.
const MAX_EXISTING = 40

const UNREACHABLE_MESSAGE = "Couldn't reach AI — try again in a moment."

/** The command palette's "AI" entry point: a small chat, not a form. One or
    several TASKS (no events — see api/ai-schedule.js) can be created,
    changed, or removed directly from a plain-language prompt, without ever
    opening the create-task modal — a second, separate door from
    TaskEditor's own AI enrichment (Phase 8), which stays untouched.

    Follows the app's one modal convention exactly: useModalA11y owns the
    focus trap, initial focus, Escape, and body scroll lock on its own — see
    useModalA11y.js's own comment on why onClose is read through a ref
    rather than depended on directly. Nothing here duplicates any of that. */
export function AiChatModal({ onClose }) {
  const { addTask, updateTask, removeTask, restoreItem, tags, tasks, tasksOn, eventsOn } = useSchedule()
  const { pushUndo, pushError } = useToast()
  const now = useNow()

  const panelRef = useRef(null)
  const inputRef = useRef(null)
  useModalA11y(panelRef, { onClose, initialFocusRef: inputRef })

  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  function say(role, content) {
    setMessages((prev) => [...prev, { role, content }])
  }

  /** Real free time across the WHOLE day, not narrowed to Settings' working
      hours the way planningSlots (autoSchedule.js) narrows it for "Plan my
      day" — that narrowing is right for a heuristic quietly auto-packing
      tasks into a "reasonable" window, but wrong here: someone typing
      "gym monday 7am" is stating an explicit, deliberate time, not asking
      the AI to invent one within office hours. Bypassing planningSlots and
      calling freeSlots directly (0-1440 minus whatever's already busy) was
      the actual fix for an early time silently coming back as "no time
      set" whenever it fell outside a configured working-hours window. */
  function buildWeekSlots() {
    const dayItems = (key) => [
      ...tasksOn(key),
      ...eventsOn(key).filter((e) => Number.isFinite(e.startMin) && e.startDate === e.endDate),
    ]
    const slots = []
    for (let i = 0; i < LOOKAHEAD_DAYS; i += 1) {
      const key = addDays(now.key, i)
      const fromMin = i === 0 ? now.min : 0
      const daySlots = freeSlots(dayItems(key), fromMin, MINUTES_PER_DAY, 1)
      for (const slot of daySlots.slice(0, MAX_SLOTS_PER_DAY)) {
        slots.push({ date: key, startMin: slot.startMin, endMin: slot.endMin })
      }
    }
    return slots
  }

  /** Titles, tags, and durations from this account's own recent tasks — the
      same fields, same cap, and same privacy stance (no notes, no
      checklists) as TaskEditor.jsx's own history payload for
      /api/enrich-task. Lets the model favor how THIS person has actually
      tagged similar work before, rather than guessing from a tag's name
      alone — see the tagId guidance in api/ai-schedule.js's own system
      instruction. */
  function buildHistory() {
    return [...tasks]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_HISTORY)
      .map((t) => ({ title: t.title, tagId: t.tagId, durationMin: t.durationMin, startMin: t.startMin }))
  }

  /** The real, currently-open tasks an update/remove is allowed to target —
      done and deleted tasks are excluded, since "cancel the gym task"
      cannot honestly mean one already finished or already gone. Server-side
      (api/ai-schedule.js) drops any taskId that isn't in this same list, so
      the model can never act on an id it invented. */
  function buildExistingTasks() {
    return tasks
      .filter((t) => !t.done)
      .sort((a, b) => (a.date ?? '9999-99-99').localeCompare(b.date ?? '9999-99-99'))
      .slice(0, MAX_EXISTING)
      .map((t) => ({ id: t.id, title: t.title, date: t.date, startMin: t.startMin, durationMin: t.durationMin, tagId: t.tagId }))
  }

  /** Sequential, not Promise.all — a partial failure part-way through is far
      easier to reason about (and to undo) than an unknown subset of
      concurrent writes having landed, the same choice acceptPlan already
      makes for a day-plan's several writes (TodayView.jsx). Draft/patch
      fields are built one at a time from the already-sanitized item, never
      spread — addTask/updateTask do not strip a stray deletedAt
      (ScheduleContext.jsx), so passing anything through unfiltered is never
      safe regardless of which layer already checked it.

      Returns enough about what happened to build one undo that reverses
      the whole batch: a created task is undone by removing it; a removed
      task (already a soft delete) is undone by restoring it; an updated
      task is undone by writing back whatever it looked like immediately
      before this patch, captured from live data right before the write. */
  async function applyItems(items) {
    const created = []
    const removed = []
    const updated = []

    for (const item of items) {
      if (item.action === 'remove') {
        await removeTask(item.taskId)
        removed.push(item.taskId)
        continue
      }

      if (item.action === 'update') {
        const before = tasks.find((t) => t.id === item.taskId)
        await updateTask(item.taskId, item.patch)
        if (before) {
          const reverse = Object.fromEntries(Object.keys(item.patch).map((key) => [key, before[key] ?? null]))
          updated.push({ id: item.taskId, reverse })
        }
        continue
      }

      const ref = await addTask({
        title: item.title,
        date: item.date,
        startMin: item.startMin,
        durationMin: item.durationMin,
        tagId: item.tagId,
        notes: item.notes ?? '',
        priority: item.priority,
      })
      created.push(ref.id)
    }

    return { created, removed, updated }
  }

  async function send(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || busy) return

    const nextMessages = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setDraft('')
    setBusy(true)

    try {
      const result = await aiScheduleAi({
        messages: nextMessages,
        today: now.key,
        nowMin: now.min,
        tags: tags.map((t) => ({ id: t.id, name: t.name })),
        slots: buildWeekSlots(),
        history: buildHistory(),
        existingTasks: buildExistingTasks(),
      })

      if (!result) {
        say('assistant', UNREACHABLE_MESSAGE)
        return
      }

      if (result.status === 'ask') {
        say('assistant', result.question)
        return
      }

      let outcome = { created: [], removed: [], updated: [] }
      try {
        outcome = await applyItems(result.items)
      } catch (caught) {
        console.error('Could not apply everything AI proposed.', caught)
        pushError('Could not finish all of those. Some may have gone through.')
      }

      const { created, removed, updated } = outcome
      const total = created.length + removed.length + updated.length

      // Whatever landed (even a partial batch from the catch above) is
      // worth one undo, and one confirmation line in the transcript so
      // there's a record of it even though the modal now stays open —
      // closing used to BE that confirmation, so removing it needed a
      // replacement.
      if (total > 0) {
        const bits = []
        if (created.length) bits.push(`created ${created.length}`)
        if (updated.length) bits.push(`updated ${updated.length}`)
        if (removed.length) bits.push(`removed ${removed.length}`)
        const summary = `Done — ${bits.join(', ')}.`
        say('assistant', summary)

        pushUndo(summary, async () => {
          try {
            for (const id of created) await removeTask(id)
            for (const id of removed) await restoreItem('task', id)
            for (const { id, reverse } of updated) await updateTask(id, reverse)
          } catch (caught) {
            console.error('Could not undo the AI-applied changes.', caught)
            pushError('Could not undo all of those.')
          }
        })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} className="modal__panel ai-chat" role="dialog" aria-modal="true" aria-label="Ask AI">
        <div className="modal__head">
          <h2 className="modal__title">Ask AI</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {messages.length === 0 ? (
          <p className="field__hint">
            Describe what to schedule, change, or remove — "gym monday 7am", "move dentist to 4pm", "cancel the
            groceries task." Tasks only; if something's too vague or ambiguous, it'll ask before doing anything.
          </p>
        ) : (
          <div className="ai-chat__transcript" role="log" aria-live="polite">
            {messages.map((m, i) => (
              // Index as key is safe here: this list only ever appends, in
              // order, for the lifetime of one modal instance — nothing is
              // ever inserted, removed, or reordered.
              // eslint-disable-next-line react/no-array-index-key
              <p key={i} className={`ai-chat__msg ai-chat__msg--${m.role}`}>
                {m.content}
              </p>
            ))}
          </div>
        )}

        {busy && <p className="ai-suggest__thinking">Thinking…</p>}

        <form onSubmit={send}>
          <label className="field">
            <span className="field__label">{messages.length === 0 ? 'What do you need?' : 'Reply'}</span>
            <textarea
              ref={inputRef}
              className="input input--area"
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter still writes a newline — the
                // usual chat-box convention, and the one place in this app
                // a textarea's Enter key means something other than a line
                // break.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(e)
                }
              }}
              placeholder="Describe what to schedule…"
              disabled={busy}
            />
          </label>

          <div className="modal__foot">
            <span className="modal__spacer" />
            {/* No longer closes on a successful action — this stays open so
                a multi-step conversation (add a few things, then tweak one)
                doesn't mean reopening the palette each time. Closing is now
                always the person's own choice, via this button or the X. */}
            <button type="button" className="ghost-button" onClick={onClose}>
              Close
            </button>
            <button type="submit" className="primary-button" disabled={busy || !draft.trim()}>
              {busy ? 'Working…' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
