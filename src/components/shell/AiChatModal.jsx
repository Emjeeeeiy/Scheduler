import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { useModalA11y } from '../../lib/useModalA11y.js'
import { useNow } from '../../lib/useNow.js'
import { addDays, MINUTES_PER_DAY } from '@cadence/shared/date.js'
import { freeSlots } from '@cadence/shared/slots.js'
import { aiScheduleAi } from '../../lib/aiClient.js'
import { AI_DISCLOSURE } from '../../lib/aiDisclosure.js'
import { ArrowUpIcon, ClockIcon, CloseIcon } from '../icons.jsx'
import { VerifyNotice } from './VerifyNotice.jsx'

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


const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// What the composer's disabled controls point at, so a screen reader that reaches
// one hears why it is disabled.
const VERIFY_NOTICE_ID = 'verify-ai-chat'

// What the empty state offers. They are examples to start from, not actions: they
// fill the composer and wait, because "cancel the groceries task" is a real
// delete and should be read (and perhaps changed) before it is sent.
const SUGGESTIONS = ['Gym Monday 7am', 'Move dentist to 4pm', 'Cancel the groceries task']

/** The assistant's mark: the brand's clock, frozen, in a ring — the small round
    avatar every chat puts beside the other side's words. */
function Mark({ large = false }) {
  return (
    <span className={`ai-chat__mark${large ? ' ai-chat__mark--lg' : ''}`} aria-hidden="true">
      <ClockIcon live={false} />
    </span>
  )
}

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
  const { pushError } = useToast()
  // The AI route only serves confirmed addresses (api/_lib/auth.js).
  const { emailVerified } = useAuth()
  const now = useNow()

  const panelRef = useRef(null)
  const inputRef = useRef(null)
  // A disabled box can't take focus, so until the email address is confirmed
  // the dialog opens on its first focusable control instead of leaving focus
  // behind in the page underneath.
  useModalA11y(panelRef, { onClose, initialFocusRef: emailVerified ? inputRef : undefined })

  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef(null)

  // A chat follows the conversation: the newest message, or the typing
  // indicator where the answer is about to appear, is always in view.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  // One line to start, growing with what is typed up to a cap, then scrolling.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    if (el.scrollHeight) el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [draft])

  /** `extra` carries what a message can offer beyond its words: `undo`, on
      the line that reports a batch of changes, and `pending`, on the line
      that asks before a batch that deletes anything. */
  function say(role, content, extra) {
    setMessages((prev) => [...prev, { role, content, ...extra }])
  }

  function patchMessage(index, patch) {
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)))
  }

  /** The way back from a batch, right under the line that reports it. It used to
      be a toast saying the same sentence a second time, over the top of the
      dialog (and, on a phone, over its own Close). One place now: the message. */
  async function undoMessage(index) {
    const target = messages[index]
    if (!target?.undo || target.undoing || target.undone) return
    patchMessage(index, { undoing: true })
    const ok = await target.undo()
    patchMessage(index, ok ? { undone: true, undoing: false } : { undoing: false })
  }

  /** The answer to "Remove these?" — once, from whichever button is pressed. */
  async function resolvePending(index, confirmed) {
    const target = messages[index]
    if (!target?.pending || target.resolved) return
    patchMessage(index, { resolved: confirmed ? 'confirmed' : 'kept' })
    if (!confirmed) {
      say('assistant', 'Okay — nothing changed.')
      return
    }
    setBusy(true)
    try {
      await applyAndReport(target.pending)
    } finally {
      setBusy(false)
    }
  }

  function startOver() {
    setMessages([])
    setDraft('')
    inputRef.current?.focus()
  }

  function pickSuggestion(text) {
    setDraft(text)
    inputRef.current?.focus()
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

  /** Applies a batch and reports it in one line, with one Undo for all of it. */
  async function applyAndReport(items) {
    let outcome = { created: [], removed: [], updated: [] }
    try {
      outcome = await applyItems(items)
    } catch (caught) {
      console.error('Could not apply everything AI proposed.', caught)
      pushError('Could not finish all of those. Some may have gone through.')
    }

    const { created, removed, updated } = outcome
    const total = created.length + removed.length + updated.length

    // Whatever landed (even a partial batch from the catch above) is
    // worth one confirmation line in the transcript — there's a record
    // of it even though the modal now stays open; closing used to BE that
    // confirmation — and one undo for the whole batch, never one per item,
    // offered on that same line.
    if (total > 0) {
      const bits = []
      if (created.length) bits.push(`created ${created.length}`)
      if (updated.length) bits.push(`updated ${updated.length}`)
      if (removed.length) bits.push(`removed ${removed.length}`)
      const summary = `Done — ${bits.join(', ')}.`

      say('assistant', summary, {
        // Resolves to whether it worked, so the message can say "Undone" (or
        // keep its button) honestly.
        undo: async () => {
          try {
            for (const id of created) await removeTask(id)
            for (const id of removed) await restoreItem('task', id)
            for (const { id, reverse } of updated) await updateTask(id, reverse)
            return true
          } catch (caught) {
            console.error('Could not undo the AI-applied changes.', caught)
            pushError('Could not undo all of those.')
            return false
          }
        },
      })
    }
  }

  async function send(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || busy || !emailVerified) return

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

      /* Deleting is the one thing a misread request (or a task title that
         reads like an instruction) can do that matters, so a batch with any
         removal waits for a yes. Everything else applies straight away, with
         Undo. */
      const removals = result.items.filter((item) => item.action === 'remove')
      if (removals.length > 0) {
        const names = removals.map((item) => `“${tasks.find((t) => t.id === item.taskId)?.title ?? 'a task'}”`)
        const others = result.items.length - removals.length
        say(
          'assistant',
          `Remove ${plural(removals.length, 'task')}: ${names.join(', ')}?${
            others > 0 ? ` I’ll also make the ${plural(others, 'other change')} you asked for.` : ''
          }`,
          { pending: result.items },
        )
        return
      }

      await applyAndReport(result.items)
    } finally {
      setBusy(false)
    }
  }

  const canSend = emailVerified && !busy && draft.trim().length > 0

  return (
    <div
      className="modal modal--sheet"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={panelRef} className="modal__panel ai-chat" role="dialog" aria-modal="true" aria-label="Ask AI">
        <div className="modal__head">
          <h2 className="modal__title">Ask AI</h2>
          <div className="modal__head-actions">
            {messages.length > 0 && (
              <button type="button" className="ghost-button ghost-button--sm" onClick={startOver} disabled={busy}>
                New chat
              </button>
            )}
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
              <CloseIcon />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="ai-chat__scroll">
          {messages.length === 0 && (
            <div className="ai-chat__empty">
              <Mark large />
              <h3 className="ai-chat__greeting">What should I schedule?</h3>
              {emailVerified ? (
                <p className="ai-chat__sub">
                  Tasks only. If something is vague, I'll ask before doing anything, and I'll check before deleting.
                </p>
              ) : (
                /* In place of the sentence above, and in a warning's clothes
                   rather than the same faint grey: nothing can be sent until
                   the address is confirmed, so this empty state is all there is
                   to see — the greyed box below is what it explains. */
                <VerifyNotice id={VERIFY_NOTICE_ID}>
                  Confirm your email address to use AI — the link is in the email we sent when you signed up.
                </VerifyNotice>
              )}
              <ul className="ai-chat__suggestions" aria-label="Examples">
                {SUGGESTIONS.map((text) => (
                  <li key={text}>
                    <button
                      type="button"
                      className="filter-chip"
                      onClick={() => pickSuggestion(text)}
                      disabled={!emailVerified}
                    >
                      {text}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="field__hint ai-chat__disclosure">{AI_DISCLOSURE}</p>
            </div>
          )}

          {/* Always present, so a screen reader is already listening when the
              first message lands. */}
          <div className="ai-chat__transcript" role="log" aria-live="polite">
            {messages.map((m, i) =>
              m.role === 'user' ? (
                // Index as key is safe here: this list only ever appends, in
                // order, for the lifetime of one modal instance — nothing is
                // ever inserted, removed, or reordered.
                // eslint-disable-next-line react/no-array-index-key
                <div key={i} className="ai-chat__turn ai-chat__turn--user">
                  <p className="ai-chat__bubble">{m.content}</p>
                </div>
              ) : (
                // eslint-disable-next-line react/no-array-index-key
                <div key={i} className="ai-chat__turn ai-chat__turn--assistant">
                  <Mark />
                  <div className="ai-chat__body">
                    <p className="ai-chat__text">{m.content}</p>
                    {m.pending &&
                      (m.resolved ? null : (
                        <span className="ai-chat__confirm">
                          <button
                            type="button"
                            className="danger-button danger-button--sm"
                            onClick={() => resolvePending(i, true)}
                            disabled={busy}
                          >
                            Remove
                          </button>
                          <button
                            type="button"
                            className="ghost-button ghost-button--sm"
                            onClick={() => resolvePending(i, false)}
                            disabled={busy}
                          >
                            Keep
                          </button>
                        </span>
                      ))}
                    {m.undo &&
                      (m.undone ? (
                        <p className="ai-chat__undone">Undone.</p>
                      ) : (
                        <button
                          type="button"
                          className="ghost-button ghost-button--sm ai-chat__undo"
                          onClick={() => undoMessage(i)}
                          disabled={m.undoing}
                        >
                          Undo
                        </button>
                      ))}
                  </div>
                </div>
              ),
            )}
            {busy && (
              <div className="ai-chat__turn ai-chat__turn--assistant" role="status">
                <Mark />
                <span className="ai-chat__typing" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="visually-hidden">Thinking…</span>
              </div>
            )}
          </div>
        </div>

        {/* The one place to write: no label (the placeholder and the heading
            above already say what it is), no footer. Closing is the head's
            ×, not a second button down here. */}
        <form className="ai-chat__composer" onSubmit={send}>
          <div className="ai-chat__box">
            <textarea
              ref={inputRef}
              className="ai-chat__input"
              rows={1}
              value={draft}
              disabled={!emailVerified}
              aria-describedby={emailVerified ? undefined : VERIFY_NOTICE_ID}
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
              placeholder={
                !emailVerified
                  ? 'Confirm your email address first'
                  : messages.length === 0
                    ? 'Describe what to schedule…'
                    : 'Reply…'
              }
              aria-label="Message"
            />
            <button type="submit" className="ai-chat__send" aria-label="Send" disabled={!canSend}>
              <ArrowUpIcon />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
