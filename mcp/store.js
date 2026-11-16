/* The MCP layer's only door to Firestore, scoped to ONE account.
 *
 * firebase-admin bypasses firestore.rules entirely, so nothing here is guarded
 * by the database: every path is built from the `uid` this store was created
 * with (from MCP_USER_UID, never from a request), and every id that arrives
 * from a tool call is checked against ID_PATTERN before it becomes part of a
 * path. `db`, `deleteField` and `fieldPath` are injected so the same code runs
 * against the Admin SDK in production and an in-memory fake in tests — the
 * pattern functions/lib/runDailyDigest.js already uses.
 *
 * Writes copy src/state/ScheduleContext.jsx and src/state/useJournal.js field
 * for field, because the app will read what lands here:
 *   - timestamps are plain millisecond numbers, not serverTimestamp()
 *   - a new task or event is built the way addTask / addEvent build it
 *   - ticking off one day of a repeating task writes overrides.<date>, and
 *     un-ticking clears that entry rather than storing done:false
 *   - a note is two documents (metadata + body), written together
 *
 * NOTHING HERE HARD-DELETES. Every delete is what the app's own delete is: a
 * `deletedAt` stamp (the item moves to the Trash and can be restored), or, for
 * one day of a repeating item, a `detached` override that skips just that day.
 */

import { clampMin, daysBetween, isValidKey } from '@cadence/shared/date.js'
import {
  SCHEMA_VERSION,
  TITLE_MAX,
  bodyBytes,
  bodyLimitState,
  dayNoteDraft,
  findNoteForDay,
  noteDisplayTitle,
  normalizeNote,
  normalizeNoteBody,
  normalizePaper,
  sortNotes,
  summarizeDoc,
} from '@cadence/shared/journal.js'
import { MAX_EVENT_DAYS, normalizeEvent, normalizeTag, normalizeTask } from '@cadence/shared/normalize.js'
import { eventOccurrenceOn, occurrenceOn, parseOccurrenceId } from '@cadence/shared/recurrence.js'
import { ID_PATTERN } from './config.js'
import { McpToolError } from './errors.js'
import { appendBlocks, blocksFromText, docFromText, noteToText } from './journalText.js'

/** How much of a note one read returns. The day sheet resource uses less. */
export const NOTE_READ_LIMIT = 20_000
const DAY_SHEET_NOTE_LIMIT = 8_000

const notLiveOccurrence = (day, title) =>
  new McpToolError(
    `${day} is not a live occurrence of "${title}" — that day may have been edited or skipped on ` +
      'its own. Look up current ids with get_schedule.',
  )

/**
 * @param db           a Firestore-shaped client (Admin SDK or the test fake)
 * @param uid          the one account this store may touch
 * @param deleteField  `() => <FieldValue.delete() sentinel>`
 * @param fieldPath    `(...segments) => <FieldPath>` — a day key is not a legal
 *                     dotted path (digits, hyphens), so overrides are addressed
 *                     by FieldPath exactly as ScheduleContext does
 * @param now          `() => ms`
 */
export function createScheduleStore({ db, uid, deleteField, fieldPath, now = () => Date.now() }) {
  const userDoc = () => db.collection('users').doc(uid)
  const tasksCol = () => userDoc().collection('tasks')
  const eventsCol = () => userDoc().collection('events')
  const tagsCol = () => userDoc().collection('tags')
  const journalCol = () => userDoc().collection('journal')

  const checkedId = (id, what) => {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) throw new McpToolError(`"${id}" is not a valid ${what} id.`)
    return id
  }
  const taskRef = (id) => tasksCol().doc(checkedId(id, 'task'))
  const eventRef = (id) => eventsCol().doc(checkedId(id, 'event'))
  const noteRef = (id) => journalCol().doc(checkedId(id, 'note'))
  const bodyRef = (id) => noteRef(id).collection('content').doc('body')

  /* ------------------------------------------------------------- reading -- */

  /** Trashed documents are hidden at this seam, the same way ScheduleContext
      hides them at its own — nothing downstream has to remember trash exists. */
  async function listTasks() {
    const snap = await tasksCol().get()
    return snap.docs.map((d) => normalizeTask(d.id, d.data())).filter((t) => t.deletedAt === null)
  }

  async function listEvents() {
    const snap = await eventsCol().get()
    return snap.docs
      .map((d) => normalizeEvent(d.id, d.data()))
      .filter((e) => e.deletedAt === null && e.startDate !== null)
  }

  async function listTags() {
    const snap = await tagsCol().get()
    return snap.docs
      .map((d) => normalizeTag(d.id, d.data()))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
  }

  /** Tasks, events and tags together — what every read tool needs. */
  async function loadSchedule() {
    const [tasks, events, tags] = await Promise.all([listTasks(), listEvents(), listTags()])
    return { tasks, events, tags }
  }

  /* ------------------------------------------------------------- journal -- */

  /** Live notes, pinned first then most recently edited — metadata only, so it
      stays cheap however long the notes are. */
  async function listNotes() {
    const snap = await journalCol().get()
    return sortNotes(snap.docs.map((d) => normalizeNote(d.id, d.data())).filter((n) => n.deletedAt === null))
  }

  /** The live note written for `dayKey` — the one the app's "Today" button opens. */
  async function findNoteByDay(dayKey) {
    if (!isValidKey(dayKey)) throw new McpToolError('The date must be YYYY-MM-DD.')
    // One equality filter needs no composite index; the sorting is done here.
    const snap = await journalCol().where('dayKey', '==', dayKey).get()
    const notes = snap.docs.map((d) => normalizeNote(d.id, d.data()))
    return findNoteForDay(sortNotes(notes), dayKey)
  }

  /** A note's text. A body from a newer build, or one that will not parse, is
      reported as unreadable rather than shown as an empty note. */
  async function readNote(note, limit) {
    const bodySnap = await bodyRef(note.id).get()
    const body = normalizeNoteBody(bodySnap.exists ? bodySnap.data() : undefined)
    const readable = body.valid && body.supported
    const { text, truncated } = readable ? noteToText(body.doc, limit) : { text: '', truncated: false }
    return {
      id: note.id,
      title: note.title,
      dayKey: note.dayKey,
      pinned: note.pinned,
      hasDrawing: note.hasDrawing,
      updatedAt: note.updatedAt,
      readable,
      text,
      truncated,
    }
  }

  /** The Journal note for a day, as plain text, or null — what the day sheet shows. */
  async function getDayNote(dayKey) {
    const note = await findNoteByDay(dayKey)
    return note ? readNote(note, DAY_SHEET_NOTE_LIMIT) : null
  }

  /** One note by id or by day. */
  async function getNote({ id, dayKey }) {
    let note
    if (id) {
      const snap = await noteRef(id).get()
      if (!snap.exists) throw new McpToolError(`No note with id "${id}".`)
      note = normalizeNote(snap.id, snap.data())
      if (note.deletedAt !== null) throw new McpToolError(`"${noteDisplayTitle(note)}" is in the trash.`)
    } else {
      note = await findNoteByDay(dayKey)
      if (!note) throw new McpToolError(`There is no note for ${dayKey}.`)
    }
    return readNote(note, NOTE_READ_LIMIT)
  }

  /** A note is two documents written together — metadata for the list, body for
      the editor — exactly as useJournal.createNote does. */
  async function createNote({ title = '', text = '', dayKey = null }) {
    if (dayKey !== null) {
      const existing = await findNoteByDay(dayKey)
      if (existing) {
        throw new McpToolError(
          `${dayKey} already has a note ("${noteDisplayTitle(existing)}", id ${existing.id}). ` +
            'Use append_to_journal_note to add to it.',
        )
      }
    }
    const doc = docFromText(text)
    const json = JSON.stringify(doc)
    const bytes = bodyBytes(json)
    if (bodyLimitState(bytes) === 'full') throw new McpToolError('That text is too large for one note.')

    const { excerpt, hasDrawing } = summarizeDoc(doc)
    const stamp = now()
    // A note for a day starts titled with that day, as the app's own does.
    const name = (title.trim() || (dayKey ? dayNoteDraft(dayKey).title : '')).slice(0, TITLE_MAX)

    const ref = journalCol().doc()
    const batch = db.batch()
    batch.set(ref, {
      title: name,
      excerpt,
      dayKey,
      pinned: false,
      hasDrawing,
      bytes,
      // The app's default paper is a client-side setting the server cannot see.
      paper: normalizePaper(undefined),
      createdAt: stamp,
      updatedAt: stamp,
      deletedAt: null,
    })
    batch.set(ref.collection('content').doc('body'), { json, schemaVersion: SCHEMA_VERSION, updatedAt: stamp })
    await batch.commit()
    return { id: ref.id, title: name, dayKey }
  }

  /**
   * Adds text to the end of an existing note, in one transaction: read the body,
   * append, write the body and the metadata derived from it together — what the
   * editor's own save writes. If the note is open in the app and has unsaved
   * typing, the app's existing "changed on another device" choice covers it.
   *
   * Refused, writing nothing, when the note is gone or trashed, when its body is
   * one this build cannot read (the app opens those read-only and never saves
   * them), or when the result would not fit.
   */
  async function appendToNote({ id, dayKey, text }) {
    const blocks = blocksFromText(text)
    if (blocks.length === 0) throw new McpToolError('There was no text to add.')

    let noteId = id
    if (!noteId) {
      const found = await findNoteByDay(dayKey)
      if (!found) throw new McpToolError(`There is no note for ${dayKey}. Use create_journal_note to start one.`)
      noteId = found.id
    }
    const metaRef = noteRef(noteId)
    const body = bodyRef(noteId)
    const stamp = now()

    return db.runTransaction(async (tx) => {
      const [metaSnap, bodySnap] = await Promise.all([tx.get(metaRef), tx.get(body)])
      if (!metaSnap.exists) throw new McpToolError(`No note with id "${noteId}".`)
      const note = normalizeNote(metaSnap.id, metaSnap.data())
      if (note.deletedAt !== null) throw new McpToolError(`"${noteDisplayTitle(note)}" is in the trash.`)

      const current = normalizeNoteBody(bodySnap.exists ? bodySnap.data() : undefined)
      if (!current.valid || !current.supported) {
        throw new McpToolError(
          `"${noteDisplayTitle(note)}" can't be edited from here: its text is in a form this version ` +
            'of Cadence cannot read. Nothing was changed.',
        )
      }

      const doc = appendBlocks(current.doc, blocks)
      const json = JSON.stringify(doc)
      const bytes = bodyBytes(json)
      if (bodyLimitState(bytes) === 'full') {
        throw new McpToolError(`That would make "${noteDisplayTitle(note)}" too large to save. Nothing was changed.`)
      }

      const { excerpt, hasDrawing } = summarizeDoc(doc)
      tx.set(body, { json, schemaVersion: SCHEMA_VERSION, updatedAt: stamp })
      tx.update(metaRef, { excerpt, hasDrawing, bytes, updatedAt: stamp })
      return { id: noteId, title: note.title, dayKey: note.dayKey, bytes }
    })
  }

  /** The app's trashNote: a stamp, so the note can be restored from the Trash. */
  async function trashNote(id) {
    const ref = noteRef(id)
    const snap = await ref.get()
    if (!snap.exists) throw new McpToolError(`No note with id "${id}".`)
    const note = normalizeNote(snap.id, snap.data())
    if (note.deletedAt !== null) return { id, title: noteDisplayTitle(note), changed: false }
    await ref.update({ deletedAt: now() })
    return { id, title: noteDisplayTitle(note), changed: true }
  }

  /* ------------------------------------------------------- task writes -- */

  /** Mirrors ScheduleContext.addTask: validated through normalizeTask rather
      than a second hand-written copy of the same rules, then stamped fresh —
      a new task is never created done, with exceptions, or on another clock. */
  async function addTask(draft) {
    const stamp = now()
    const {
      id: _id,
      done: _done,
      completedAt: _completedAt,
      overrides: _overrides,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...fields
    } = normalizeTask('new', draft)
    const stored = {
      ...fields,
      done: false,
      completedAt: null,
      overrides: {},
      createdAt: stamp,
      updatedAt: stamp,
    }
    const ref = await tasksCol().add(stored)
    return normalizeTask(ref.id, stored)
  }

  /**
   * Idempotent: asking for the state a task is already in writes nothing and
   * reports `changed: false`.
   *
   * @param id  a task id, or `seriesId~YYYY-MM-DD` for one day of a repeating
   *            task (the ids get_schedule reports)
   */
  async function setTaskDone(id, done) {
    const occurrence = parseOccurrenceId(id)
    const ref = taskRef(occurrence ? occurrence.seriesId : id)
    const snap = await ref.get()
    if (!snap.exists) throw new McpToolError(`No task with id "${id}".`)

    const task = normalizeTask(snap.id, snap.data())
    if (task.deletedAt !== null) throw new McpToolError(`"${task.title}" is in the trash.`)

    if (occurrence) {
      const live = task.recurrence ? occurrenceOn(task, occurrence.dateKey) : null
      if (!live) throw notLiveOccurrence(occurrence.dateKey, task.title)
      if (live.done === done) return { id, title: task.title, date: occurrence.dateKey, done, changed: false }

      const stamp = now()
      const at = fieldPath('overrides', occurrence.dateKey)
      // Un-ticking clears the entry, so a series document stays proportional
      // to the days actually ticked off, not to how long the habit has run.
      if (done) await ref.update(at, { done: true, completedAt: stamp }, 'updatedAt', stamp)
      else await ref.update(at, deleteField(), 'updatedAt', stamp)
      return { id, title: task.title, date: occurrence.dateKey, done, changed: true }
    }

    if (task.recurrence) {
      throw new McpToolError(
        `"${task.title}" repeats, so it has no single done state. Pass the id of one day — ` +
          `"${task.id}~YYYY-MM-DD" — as get_schedule reports it.`,
      )
    }
    if (task.done === done) return { id, title: task.title, date: task.date, done, changed: false }

    const stamp = now()
    await ref.update({ done, completedAt: done ? stamp : null, updatedAt: stamp })
    return { id, title: task.title, date: task.date, done, changed: true }
  }

  /**
   * Mirrors ScheduleContext.removeTask. Deleting one day of a repeating task
   * skips that day (no Trash entry — there is no document to restore, only an
   * override to clear); deleting a document, a repeating series included, stamps
   * `deletedAt`, which moves it to the Trash. Repeating a delete is a no-op.
   *
   * @return {{ id, title, changed, outcome: 'moved-to-trash' | 'skipped-day' |
   *            'already-in-trash' | 'already-gone', date?, repeats? }}
   */
  async function deleteTask(id) {
    const occurrence = parseOccurrenceId(id)
    const ref = taskRef(occurrence ? occurrence.seriesId : id)
    const snap = await ref.get()
    if (!snap.exists) throw new McpToolError(`No task with id "${id}".`)

    const task = normalizeTask(snap.id, snap.data())
    if (task.deletedAt !== null) return { id, title: task.title, changed: false, outcome: 'already-in-trash' }

    if (occurrence) {
      const day = occurrence.dateKey
      if (task.overrides?.[day]?.detached) {
        return { id, title: task.title, date: day, changed: false, outcome: 'already-gone' }
      }
      if (!task.recurrence || !occurrenceOn(task, day)) throw notLiveOccurrence(day, task.title)
      const stamp = now()
      await ref.update(fieldPath('overrides', day), { detached: true }, 'updatedAt', stamp)
      return { id, title: task.title, date: day, changed: true, outcome: 'skipped-day' }
    }

    const stamp = now()
    await ref.update({ deletedAt: stamp, updatedAt: stamp })
    return { id, title: task.title, changed: true, outcome: 'moved-to-trash', repeats: task.recurrence != null }
  }

  /* ------------------------------------------------------ event writes -- */

  /** Mirrors ScheduleContext.addEvent. A repeating event is not offered here —
      an end time and a repeat rule each have constraints the app's editor
      enforces, and a one-off covers what an assistant is asked for. */
  async function addEvent(draft) {
    const startDate = isValidKey(draft.startDate) ? draft.startDate : null
    if (startDate === null) throw new McpToolError('An event needs a start date.')
    const endDate = isValidKey(draft.endDate) && draft.endDate > startDate ? draft.endDate : startDate
    // normalizeEvent would quietly shorten an absurd span on every read; say so
    // now instead of storing something that does not read back as it was given.
    if (daysBetween(startDate, endDate) >= MAX_EVENT_DAYS) {
      throw new McpToolError(`An event can span at most ${MAX_EVENT_DAYS} days.`)
    }
    const startMin = Number.isFinite(draft.startMin) ? clampMin(draft.startMin) : null

    const stamp = now()
    const stored = {
      title: (draft.title ?? '').trim() || 'Untitled event',
      notes: draft.notes ?? '',
      startDate,
      endDate,
      startMin,
      endMin:
        startDate === endDate && startMin !== null && Number.isFinite(draft.endMin)
          ? clampMin(draft.endMin)
          : null,
      tagId: draft.tagId ?? null,
      recurrence: null,
      overrides: {},
      createdAt: stamp,
      updatedAt: stamp,
    }
    const ref = await eventsCol().add(stored)
    return normalizeEvent(ref.id, stored)
  }

  /** The event twin of deleteTask, mirroring ScheduleContext.removeEvent. */
  async function deleteEvent(id) {
    const occurrence = parseOccurrenceId(id)
    const ref = eventRef(occurrence ? occurrence.seriesId : id)
    const snap = await ref.get()
    if (!snap.exists) throw new McpToolError(`No event with id "${id}".`)

    const event = normalizeEvent(snap.id, snap.data())
    if (event.deletedAt !== null) return { id, title: event.title, changed: false, outcome: 'already-in-trash' }

    if (occurrence) {
      const day = occurrence.dateKey
      if (event.overrides?.[day]?.detached) {
        return { id, title: event.title, date: day, changed: false, outcome: 'already-gone' }
      }
      if (!event.recurrence || !eventOccurrenceOn(event, day)) throw notLiveOccurrence(day, event.title)
      const stamp = now()
      await ref.update(fieldPath('overrides', day), { detached: true }, 'updatedAt', stamp)
      return { id, title: event.title, date: day, changed: true, outcome: 'skipped-day' }
    }

    const stamp = now()
    await ref.update({ deletedAt: stamp, updatedAt: stamp })
    return { id, title: event.title, changed: true, outcome: 'moved-to-trash', repeats: event.recurrence != null }
  }

  return {
    listTasks,
    listEvents,
    listTags,
    loadSchedule,
    listNotes,
    getNote,
    getDayNote,
    createNote,
    appendToNote,
    trashNote,
    addTask,
    setTaskDone,
    deleteTask,
    addEvent,
    deleteEvent,
  }
}
