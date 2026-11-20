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
import { ArrowUpIcon, ClockIcon, CloseIcon, WarningIcon } from '../icons.jsx'
import { TagGlyph } from '../editors/TagGlyph.jsx'
import { changesContext, describeChanges, firstNameOf, greetingFor, ideasContext, skippedNote } from './aiChatChanges.js'
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
// These windows are only a guide now, for choosing a time when none was
// stated ("tomorrow afternoon"). A time someone DOES state is kept whatever the
// windows say (api/ai-schedule.js), so sending more of them would buy nothing
// and bring the latency back.
const MAX_SLOTS_PER_DAY = 2

// The most one message can be — the same number as CAPS.messageChars in
// api/_lib/aiInput.js, which clips anything longer without a word (it used to
// be 2000, and the end of a detailed message, where the times often are, never
// reached the model). The box stops here instead, and counts down near it.
const MAX_MESSAGE_CHARS = 4000
const COUNT_FROM = 300

const CHANGE_VERBS = { create: 'Added', update: 'Changed', remove: 'Removed' }

// Same cap as enrich-task.js's own MAX_HISTORY — enough of this account's
// tagging pattern to be useful without dominating the prompt.
const MAX_HISTORY = 15
// How many of the account's current open (not done) tasks are offered as
// real update/remove targets — see api/ai-schedule.js's own MAX_EXISTING.
const MAX_EXISTING = 40

// Said when no answer came back (offline, a timeout, Gemini busy), with a Try
// again button under it. It is marked `failed` and never sent back to the model as
// something the assistant said: it used to be, and the next reply then carried on
// from an error as if it had been part of the conversation.
const FAILED_MESSAGE = "Sorry, I couldn't get an answer just now."

// What an idea's row says where a change's row says Added / Changed / Removed.
const IDEA_VERB = 'Idea'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/** One message as the route reads it: who said it and what. An assistant turn that
    changed things carries a plain-text account of them (`context`), which is what
    the model needs to resolve "make that 8pm instead" — and, if the person undid
    them since, says so. The rest of a message's state (rows, undo, the batch
    awaiting a yes) is for the screen, not the request. */
function modelMessage(message) {
  if (!message.context) return { role: message.role, content: message.content }
  return {
    role: message.role,
    content: message.undone ? `${message.context}\n(All of that was undone.)` : message.context,
  }
}

// What the composer's disabled controls point at, so a screen reader that reaches
// one hears why it is disabled.
const VERIFY_NOTICE_ID = 'verify-ai-chat'

// What the empty state offers. They are examples to start from, not actions: they
// fill the composer and wait, because a message can be a real change (or a delete)
// and should be read, and perhaps changed, before it is sent.
const SUGGESTIONS = ['What should I do today?', 'Gym Monday 7am', 'Move dentist to 4pm']

/** What the assistant did, one row per change (see aiChatChanges.js). Words carry
    every distinction — a verb, a day, a time, a tag's name beside its dot, and a
    warning's icon alongside its sentence — never colour alone. */
function ChangeList({ rows, undone = false, idea = null }) {
  return (
    <ul
      className={`ai-chat__changes${undone ? ' ai-chat__changes--undone' : ''}`}
      aria-label={idea ? 'Ideas' : 'Changes'}
    >
      {rows.map((row, i) => {
        const detail = (
          <>
            <p className="ai-chat__change-head">
              <span className="ai-chat__change-verb">{idea ? IDEA_VERB : CHANGE_VERBS[row.action]}</span>
              <span className="ai-chat__change-title">{row.title}</span>
            </p>
            {(row.meta.length > 0 || row.tag) && (
              <p className="ai-chat__change-line">
                {row.meta.join(' · ')}
                {row.tag && (
                  <>
                    {row.meta.length > 0 && ' · '}
                    <span className="ai-chat__change-tag">
                      <TagGlyph tag={row.tag} className="ai-chat__change-dot" />
                      {row.tag.name}
                    </span>
                  </>
                )}
              </p>
            )}
            {row.changes.map((line) => (
              <p key={line} className="ai-chat__change-line">
                {line}
              </p>
            ))}
            {row.note && <p className="ai-chat__change-line">{row.note}</p>}
            {row.warnings.map((warning) => (
              <p key={warning} className="ai-chat__change-warn">
                <WarningIcon className="ai-chat__change-warn-icon" /> {warning}
              </p>
            ))}
          </>
        )
        return (
          // Append-only for the life of one message, like the transcript itself.
          // eslint-disable-next-line react/no-array-index-key
          <li key={i} className={`ai-chat__change${idea ? ' ai-chat__change--idea' : ''}`}>
            {idea ? <div className="ai-chat__change-main">{detail}</div> : detail}
            {idea &&
              (idea.added.includes(i) ? (
                <span className="ai-chat__idea-added">Added</span>
              ) : (
                <button
                  type="button"
                  className="ghost-button ghost-button--sm ai-chat__idea-add"
                  aria-label={`Add ${row.title}`}
                  onClick={() => idea.onAdd(i)}
                  disabled={idea.disabled}
                >
                  Add
                </button>
              ))}
          </li>
        )
      })}
    </ul>
  )
}

/** The assistant's mark: the brand's clock, frozen, in a ring — the small round
    avatar every chat puts beside the other side's words. */
function Mark({ large = false }) {
  return (
    <span className={`ai-chat__mark${large ? ' ai-chat__mark--lg' : ''}`} aria-hidden="true">
      <ClockIcon live={false} />
    </span>
  )
}

/** The command palette's "AI" entry point: a small chat, not a form. It talks about
    the day, and one or several TASKS (no events — see api/ai-schedule.js) can be
    created, changed, or removed directly from a plain-language prompt, without
    ever opening the create-task modal — a second, separate door from
    TaskEditor's own AI enrichment (Phase 8), which stays untouched. When someone
    is stuck it offers a few ideas, each of which becomes a task only on its own
    Add.

    Follows the app's one modal convention exactly: useModalA11y owns the
    focus trap, initial focus, Escape, and body scroll lock on its own — see
    useModalA11y.js's own comment on why onClose is read through a ref
    rather than depended on directly. Nothing here duplicates any of that. */
export function AiChatModal({ onClose }) {
  const { addTask, updateTask, removeTask, restoreItem, tags, tasks, tasksOn, eventsOn } = useSchedule()
  const { pushError } = useToast()
  // The AI route only serves confirmed addresses (api/_lib/auth.js).
  const { emailVerified, user } = useAuth()
  // Only this one word of the account's name is ever sent, to greet someone by.
  const firstName = firstNameOf(user?.displayName)
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
      await applyAndReport(target.pending, target.rows, target.skipped)
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
  /** What is already on a day with a start time: its tasks and its timed
      single-day events (a multi-day or all-day event holds no particular
      hour). The free-time windows are the gaps between these, and a stated
      time is checked against them for a clash. */
  function timedItemsOn(key) {
    return [
      ...tasksOn(key),
      ...eventsOn(key).filter((e) => Number.isFinite(e.startMin) && e.startDate === e.endDate),
    ]
  }

  function buildWeekSlots() {
    const slots = []
    for (let i = 0; i < LOOKAHEAD_DAYS; i += 1) {
      const key = addDays(now.key, i)
      const fromMin = i === 0 ? now.min : 0
      const daySlots = freeSlots(timedItemsOn(key), fromMin, MINUTES_PER_DAY, 1)
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

  /** The reply's items as rows (aiChatChanges.js), judged against the plan as it is
      right now — so an idea added a minute after it was offered is checked for a
      clash with what is on the day by then, not when it was suggested. */
  function rowsFor(items) {
    return describeChanges(items, { tasks, tags, dayItems: timedItemsOn, today: now.key, nowMin: now.min })
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
  async function applyItems(items, outcome) {
    // Filled in as it goes, not returned at the end: a write that fails part way
    // throws, and what had already landed must still be reported and undoable —
    // returning the lists would have lost them with the throw.
    const { created, removed, updated } = outcome

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
  }

  /** Applies a batch and reports it: one line saying how many, the rows saying
      what, and one Undo for all of it. `rows` and `skipped` describe the reply
      (aiChatChanges.js); both are optional so a caller with only items still works.

      `text` is the assistant's own sentence about what it did, shown as the line
      when EVERYTHING landed; a batch that stopped part way is described by the
      count instead, because the sentence was written for all of it. `onUndone`
      runs after a successful Undo (an idea that was added becomes addable again).
      Returns how many changes landed. */
  async function applyAndReport(items, rows = [], skipped = 0, text = null, onUndone = null) {
    const outcome = { created: [], removed: [], updated: [] }
    try {
      await applyItems(items, outcome)
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
      // Items are applied in order and a failure stops the loop, so what landed
      // is the first `total` of them: the list never claims more than happened.
      const applied = rows.slice(0, total)

      say('assistant', text && total === items.length ? text : summary, {
        rows: applied,
        skipped,
        // What the assistant did, in words, for the NEXT request: without it the
        // model sees "Done — created 1." and nothing to match "make that 8pm" to.
        context: [summary, changesContext(applied)].filter(Boolean).join('\n'),
        // Resolves to whether it worked, so the message can say "Undone" (or
        // keep its button) honestly.
        undo: async () => {
          try {
            for (const id of created) await removeTask(id)
            for (const id of removed) await restoreItem('task', id)
            for (const { id, reverse } of updated) await updateTask(id, reverse)
            onUndone?.()
            return true
          } catch (caught) {
            console.error('Could not undo the AI-applied changes.', caught)
            pushError('Could not undo all of those.')
            return false
          }
        },
      })
    }
    return total
  }

  /** What the route reads of a conversation: words only. The messages in state also
      carry rows, undo functions, ideas and the batch awaiting a yes, none of which
      the route reads — and an assistant turn says what it DID (its context), not
      just that it did. A line that only reported a failure is left out entirely:
      it is not something the assistant said. */
  function conversationOf(list) {
    return list.filter((m) => !m.failed).map(modelMessage)
  }

  async function send(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || busy || !emailVerified) return

    const nextMessages = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setDraft('')
    await ask(nextMessages)
  }

  /** Puts a conversation to the route and shows what comes back: words (a reply), a
      change (an act), or a few ideas to choose from (a suggestion). Used by Send
      and by Try again, which asks the same thing a second time. */
  async function ask(conversation) {
    setBusy(true)

    try {
      const result = await aiScheduleAi({
        messages: conversationOf(conversation),
        firstName,
        today: now.key,
        nowMin: now.min,
        tags: tags.map((t) => ({ id: t.id, name: t.name })),
        slots: buildWeekSlots(),
        history: buildHistory(),
        existingTasks: buildExistingTasks(),
      })

      // Nothing came back (offline, a timeout, Gemini busy). Said as a person
      // would, with a way to ask again — not as a status line, and not sent to the
      // model next turn (see conversationOf).
      if (!result) {
        say('assistant', FAILED_MESSAGE, { failed: true })
        return
      }

      // `question` is what a server from before replies had a clarifying question
      // called; a page and the API can be different versions for a moment around a
      // deploy, so it is still read rather than shown as a failure.
      const text = [result.reply, result.question].find((value) => typeof value === 'string' && value.trim()) ?? ''
      const items = Array.isArray(result.items) ? result.items : []

      if (result.status === 'suggest' && items.length > 0) {
        // Ideas change nothing: they wait, each with its own Add. What was offered
        // goes back to the model as words, marked as not added yet.
        const rows = rowsFor(items)
        const intro = text || 'Here are a few ideas for you.'
        say('assistant', intro, {
          suggestions: items,
          rows,
          added: [],
          context: [intro, ideasContext(rows)].join('\n'),
        })
        return
      }

      if (result.status !== 'act' || items.length === 0) {
        if (text) say('assistant', text)
        else say('assistant', FAILED_MESSAGE, { failed: true })
        return
      }

      // Described BEFORE anything is applied: an update shows what a task was
      // from the task as it is now, and a clash is judged against today's plan.
      const skipped = Number.isInteger(result.skipped) ? result.skipped : 0
      const rows = rowsFor(items)

      /* Deleting is the one thing a misread request (or a task title that
         reads like an instruction) can do that matters, so a batch with any
         removal waits for a yes. Everything else applies straight away, with
         Undo. The same list that will report the change is shown first, so the
         yes is to what is about to happen, not to a count. */
      const removals = items.filter((item) => item.action === 'remove')
      if (removals.length > 0) {
        const names = removals.map((item) => `“${tasks.find((t) => t.id === item.taskId)?.title ?? 'a task'}”`)
        const others = items.length - removals.length
        say(
          'assistant',
          `Remove ${plural(removals.length, 'task')}: ${names.join(', ')}?${
            others > 0 ? ` I’ll also make the ${plural(others, 'other change')} you asked for.` : ''
          }`,
          { pending: items, rows, skipped },
        )
        return
      }

      await applyAndReport(items, rows, skipped, text || null)
    } finally {
      setBusy(false)
    }
  }

  /** Try again under a failure: the same conversation, asked a second time. Only the
      newest line offers it — an older one's moment has passed. */
  async function retry(index) {
    const target = messages[index]
    if (!target?.failed || target.retried || busy || !emailVerified) return
    patchMessage(index, { retried: true })
    await ask(messages.slice(0, index))
  }

  /** Which of a message's ideas have been added: marked when added, and unmarked if
      that Add is undone, so an idea taken back can be taken again. */
  function setAdded(index, ids, added) {
    setMessages((prev) =>
      prev.map((m, i) => {
        if (i !== index) return m
        return { ...m, added: added ? [...new Set([...m.added, ...ids])] : m.added.filter((n) => !ids.includes(n)) }
      }),
    )
  }

  /** Add one idea, or several (Add all). Each becomes a real task only here, on a
      tap, reported and undoable like any other change. */
  async function addIdeas(index, which) {
    const target = messages[index]
    if (!target?.suggestions || busy) return
    const todo = which.filter((n) => !target.added.includes(n))
    if (todo.length === 0) return
    const items = todo.map((n) => target.suggestions[n])

    setBusy(true)
    try {
      const text = items.length === 1 ? `Added “${items[0].title}”.` : null
      const landed = await applyAndReport(items, rowsFor(items), 0, text, () => setAdded(index, todo, false))
      // Items land in order and a failure stops the loop, so the first `landed`.
      setAdded(index, todo.slice(0, landed), true)
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
              <h3 className="ai-chat__greeting">{greetingFor(now.min, firstName)}</h3>
              {emailVerified ? (
                <p className="ai-chat__sub">
                  Ask me to add, move or clear tasks — or for ideas when you're stuck. I'll check before deleting
                  anything.
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
                    {m.rows?.length > 0 && !m.suggestions && <ChangeList rows={m.rows} undone={m.undone} />}
                    {m.suggestions && (
                      <>
                        <ChangeList
                          rows={m.rows}
                          idea={{ added: m.added, disabled: busy, onAdd: (n) => addIdeas(i, [n]) }}
                        />
                        {m.suggestions.length - m.added.length >= 2 && (
                          <button
                            type="button"
                            className="ghost-button ghost-button--sm"
                            onClick={() => addIdeas(i, m.suggestions.map((_, n) => n))}
                            disabled={busy}
                          >
                            {m.added.length === 0 ? 'Add all' : 'Add the rest'}
                          </button>
                        )}
                      </>
                    )}
                    {m.failed && !m.retried && i === messages.length - 1 && (
                      <button
                        type="button"
                        className="ghost-button ghost-button--sm"
                        onClick={() => retry(i)}
                        disabled={busy || !emailVerified}
                      >
                        Try again
                      </button>
                    )}
                    {skippedNote(m.skipped) && <p className="ai-chat__skipped">{skippedNote(m.skipped)}</p>}
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
              maxLength={MAX_MESSAGE_CHARS}
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
                    ? 'Ask about your day…'
                    : 'Reply…'
              }
              aria-label="Message"
            />
            <button type="submit" className="ai-chat__send" aria-label="Send" disabled={!canSend}>
              <ArrowUpIcon />
            </button>
          </div>
          {/* Only near the limit: a counter on every message is noise, but a
              box that silently stops taking text is worse. */}
          {draft.length > MAX_MESSAGE_CHARS - COUNT_FROM && (
            <p className="ai-chat__count" role="status">
              {plural(MAX_MESSAGE_CHARS - draft.length, 'character')} left
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
