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
 * Writes copy src/state/ScheduleContext.jsx field for field, because the app
 * will read what lands here:
 *   - timestamps are plain millisecond numbers, not serverTimestamp()
 *   - a new task is built through normalizeTask, then stamped fresh
 *   - ticking off one day of a repeating task writes overrides.<date>, and
 *     un-ticking clears that entry rather than storing done:false
 * Nothing in this file deletes a document.
 */

import { OUTLINE_MAX, findNoteForDay, normalizeNote, normalizeNoteBody, plainTextOf, sortNotes } from '@cadence/shared/journal.js'
import { normalizeEvent, normalizeTag, normalizeTask } from '@cadence/shared/normalize.js'
import { occurrenceOn, parseOccurrenceId } from '@cadence/shared/recurrence.js'
import { ID_PATTERN } from './config.js'
import { McpToolError } from './errors.js'

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

  const taskRef = (id) => {
    if (!ID_PATTERN.test(id)) throw new McpToolError(`"${id}" is not a valid task id.`)
    return tasksCol().doc(id)
  }

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

  /** The Journal note written for `dayKey` (the one the app's "Today" button
      opens), as plain text. Drawings and images are not text and are left out. */
  async function getDayNote(dayKey) {
    // One equality filter needs no composite index; the sorting is done here.
    const snap = await journalCol().where('dayKey', '==', dayKey).get()
    const notes = snap.docs.map((d) => normalizeNote(d.id, d.data()))
    const note = findNoteForDay(sortNotes(notes), dayKey)
    if (!note) return null

    const bodySnap = await journalCol().doc(note.id).collection('content').doc('body').get()
    const body = normalizeNoteBody(bodySnap.exists ? bodySnap.data() : undefined)
    return {
      id: note.id,
      title: note.title,
      updatedAt: note.updatedAt,
      // A body from a newer build, or one that will not parse, is reported as
      // unreadable rather than shown as an empty note.
      readable: body.valid && body.supported,
      text: body.valid && body.supported ? plainTextOf(body.doc, OUTLINE_MAX) : '',
    }
  }

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
      if (!live) {
        throw new McpToolError(
          `${occurrence.dateKey} is not a live occurrence of "${task.title}" — that day may have ` +
            'been edited or skipped on its own. Look up current ids with get_schedule.',
        )
      }
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

  return { listTasks, listEvents, listTags, loadSchedule, getDayNote, addTask, setTaskDone }
}
