import { useRef, useState } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useSettings } from '../../state/SettingsContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { useModalA11y } from '../../lib/useModalA11y.js'
import { useNow } from '../../lib/useNow.js'
import { addDays } from '../../lib/date.js'
import { planningSlots } from '../../lib/autoSchedule.js'
import { aiScheduleAi } from '../../lib/aiClient.js'
import { CloseIcon } from '../icons.jsx'

// How far ahead real free time is offered to the model, and how many
// windows per day are worth sending — a week is enough for "this week" /
// "next Tuesday" phrasing without the prompt growing without bound, and a
// handful of windows per day is plenty since a day rarely has more than a
// few usefully-sized gaps anyway (see planningSlots, which returns every
// gap down to 1 minute long).
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

const UNREACHABLE_MESSAGE = "Couldn't reach AI — try again in a moment."

/** The command palette's "AI" entry point: a small chat, not a form. One or
    several TASKS (no events — see api/ai-schedule.js) are created directly
    from a plain-language prompt, without ever opening the create-task
    modal — a second, separate door from TaskEditor's own AI enrichment
    (Phase 8), which stays untouched.

    Follows the app's one modal convention exactly: useModalA11y owns the
    focus trap, initial focus, Escape, and body scroll lock on its own — see
    useModalA11y.js's own comment on why onClose is read through a ref
    rather than depended on directly. Nothing here duplicates any of that. */
export function AiChatModal({ onClose }) {
  const { addTask, removeTask, tags, tasks, tasksOn, eventsOn } = useSchedule()
  const { settings } = useSettings()
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

  /** The same real free-time engine TodayView and TaskEditor already build
      their own single-day version of (planningSlots, autoSchedule.js), just
      run once per day across a week instead of for one day. Every window
      this hands the model is real, live data — a placement that doesn't fit
      one of these gets dropped server-side (api/ai-schedule.js's
      sanitizeItem), the same "never trust the model's arithmetic about
      time" rule the rest of this app's AI layer already follows. */
  function buildWeekSlots() {
    // planningSlots calls this itself, once per key it's asked about — it
    // is not handed a pre-built list. Matches TaskEditor.jsx's own
    // dayItems exactly.
    const dayItems = (key) => [
      ...tasksOn(key),
      ...eventsOn(key).filter((e) => Number.isFinite(e.startMin) && e.startDate === e.endDate),
    ]
    const slots = []
    for (let i = 0; i < LOOKAHEAD_DAYS; i += 1) {
      const key = addDays(now.key, i)
      const fromMin = i === 0 ? now.min : 0
      const daySlots = planningSlots({ dayItems, key, workingHours: settings.workingHours, fromMin })
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

  /** Sequential, not Promise.all — a partial failure part-way through is
      far easier to reason about (and to undo) than an unknown subset of
      concurrent writes having landed, the same choice acceptPlan already
      makes for a day-plan's several writes (TodayView.jsx). Draft fields
      are built one at a time from the already-sanitized item, never
      spread — addTask does not strip a stray deletedAt, so passing
      anything through unfiltered is never safe regardless of which layer
      already checked it. */
  async function createItems(items) {
    const created = []
    for (const item of items) {
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
    return created
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
      })

      if (!result) {
        say('assistant', UNREACHABLE_MESSAGE)
        return
      }

      if (result.status === 'ask') {
        say('assistant', result.question)
        return
      }

      let created = []
      try {
        created = await createItems(result.items)
      } catch (caught) {
        console.error('Could not create everything AI proposed.', caught)
        pushError('Could not create all of those. Some may have been made.')
      }

      // Whatever landed (even a partial batch from the catch above) is worth
      // one undo — nothing landing at all is the only case with nothing to
      // offer undo for.
      if (created.length > 0) {
        onClose()
        pushUndo(`Created ${created.length} task${created.length === 1 ? '' : 's'}.`, async () => {
          try {
            for (const id of created) {
              await removeTask(id)
            }
          } catch (caught) {
            console.error('Could not undo the AI-created items.', caught)
            pushError('Could not remove all of those.')
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
            Describe what to schedule — "gym monday 7am, dentist tuesday 3pm, groceries sometime this week." Creates
            tasks; if the request is too vague to work with, it'll ask before creating anything.
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
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
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
