import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  FieldPath,
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase.js'
import { useAuth } from './AuthContext.jsx'
import { addDays, clampMin, daysBetween, isValidKey } from '../lib/date.js'
import {
  eventOccurrenceOn,
  normalizeRecurrence,
  occurrenceOn,
  parseOccurrenceId,
} from '../lib/recurrence.js'
import {
  DEFAULT_DURATION_MIN,
  DEFAULT_EVENT_DURATION_MIN,
  TAG_ICONS,
  TAG_SLOTS,
  normalizeEvent,
  normalizeFocusSession,
  normalizeTag,
  normalizeTask,
  normalizeTemplate,
} from '../lib/normalize.js'

const ScheduleContext = createContext(null)

// Re-exported so every existing `import { DEFAULT_DURATION_MIN } from
// '.../ScheduleContext.jsx'` (etc.) keeps working — normalize.js is now
// where these are actually defined (see tests/normalize.test.js), not a
// second, competing source of truth.
export { DEFAULT_DURATION_MIN, DEFAULT_EVENT_DURATION_MIN, TAG_ICONS, TAG_SLOTS }

/* Deterministic ids, so seeding is idempotent: two tabs (or a retry after an
   offline write) converge on the same three docs instead of racing to create
   duplicates. */
const STARTER_TAGS = [
  { id: 'work', name: 'Work', slot: 'blue', order: 0 },
  { id: 'personal', name: 'Personal', slot: 'orange', order: 1 },
  { id: 'study', name: 'Study', slot: 'aqua', order: 2 },
]

/* Timestamps are plain millisecond numbers rather than serverTimestamp().
   serverTimestamp() resolves to null in the local snapshot until the server
   acknowledges it, which makes freshly-created tasks sort unpredictably and
   breaks ordering entirely while offline. Every write here comes from one
   person's own devices, so the client clock is the right trade. */
const now = () => Date.now()

/* --------------------------------------------------------------- provider -- */

export function ScheduleProvider({ children }) {
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const [tasks, setTasks] = useState([])
  const [tags, setTags] = useState([])
  const [events, setEvents] = useState([])
  const [templates, setTemplates] = useState([])
  const [focusSessions, setFocusSessions] = useState([])
  const [profile, setProfile] = useState(null)
  const [readyUid, setReadyUid] = useState(null)
  const [error, setError] = useState(null)

  /* Derived, not a setState at the top of the effect: "loading" just means the
     snapshots currently in state are not this user's yet. That also makes a
     uid switch safe — the previous account's tasks can never flash on screen,
     because they are filtered out below until the new listeners report in. */
  const loading = uid !== null && readyUid !== uid

  useEffect(() => {
    if (!uid) return undefined

    let tasksReady = false
    let tagsReady = false
    let eventsReady = false
    /* Every branch below — including every error branch — must mark its own
       flag before calling this. A listener that fails without doing so leaves
       the app on "loading" forever rather than showing what it does have. */
    const markReady = () => {
      if (tasksReady && tagsReady && eventsReady) setReadyUid(uid)
    }

    /* One listener over the whole collection, sliced in memory by each view.
       A personal scheduler is hundreds of docs, so this buys instant view
       switching with no composite indexes and no refetch — revisit with a
       date-range query only if this ever passes a few thousand tasks. */
    const unsubscribeTasks = onSnapshot(
      collection(db, 'users', uid, 'tasks'),
      (snapshot) => {
        setTasks(snapshot.docs.map((d) => normalizeTask(d.id, d.data())))
        tasksReady = true
        markReady()
      },
      (caught) => {
        console.error('Could not read tasks.', caught)
        setError(caught.message ?? 'Could not read tasks.')
        tasksReady = true
        markReady()
      },
    )

    const unsubscribeTags = onSnapshot(
      collection(db, 'users', uid, 'tags'),
      (snapshot) => {
        setTags(snapshot.docs.map((d) => normalizeTag(d.id, d.data())))
        // Seed starter tags only once the server has confirmed the collection is
        // genuinely empty — an empty cached snapshot on a cold start would
        // otherwise re-create tags the user had deliberately deleted.
        if (snapshot.empty && !snapshot.metadata.fromCache) {
          for (const tag of STARTER_TAGS) {
            const { id, ...rest } = tag
            setDoc(doc(db, 'users', uid, 'tags', id), rest).catch((caught) =>
              console.warn('Could not seed starter tags.', caught),
            )
          }
        }
        tagsReady = true
        markReady()
      },
      (caught) => {
        console.error('Could not read tags.', caught)
        setError(caught.message ?? 'Could not read tags.')
        tagsReady = true
        markReady()
      },
    )

    const unsubscribeEvents = onSnapshot(
      collection(db, 'users', uid, 'events'),
      (snapshot) => {
        setEvents(
          snapshot.docs
            .map((d) => normalizeEvent(d.id, d.data()))
            // An event with no valid start date cannot be placed anywhere in
            // the UI, so it is dropped rather than given an invented day.
            .filter((e) => e.startDate !== null),
        )
        eventsReady = true
        markReady()
      },
      (caught) => {
        console.error('Could not read events.', caught)
        setError(caught.message ?? 'Could not read events.')
        eventsReady = true
        markReady()
      },
    )

    return () => {
      unsubscribeTasks()
      unsubscribeTags()
      unsubscribeEvents()
    }
  }, [uid])

  /* Its own effect, deliberately outside the tasks/tags/events gate above:
     the profile doc (display photo today) is decorative, not something the
     rest of the app needs to be "ready" before rendering. A Google account
     never gets one written until the first photo upload, so a missing doc
     is normal, not an error. */
  useEffect(() => {
    if (!uid) return undefined
    return onSnapshot(
      doc(db, 'users', uid),
      (snap) => setProfile(snap.exists() ? snap.data() : null),
      (caught) => console.error('Could not read the profile doc.', caught),
    )
  }, [uid])

  /* Also its own effect, same reasoning as profile above: saved templates
     are a convenience for the "new task" flow, not core scheduling data —
     nothing should sit on "Loading your schedule…" waiting for them. */
  useEffect(() => {
    if (!uid) return undefined
    return onSnapshot(
      collection(db, 'users', uid, 'templates'),
      (snapshot) => setTemplates(snapshot.docs.map((d) => normalizeTemplate(d.id, d.data()))),
      (caught) => console.error('Could not read templates.', caught),
    )
  }, [uid])

  /* Same reasoning again: focus-session history feeds Focus Mode's own
     stats strip and the Dashboard's per-tag focus breakdown, neither of
     which the rest of the app needs to be "ready" before rendering. */
  useEffect(() => {
    if (!uid) return undefined
    return onSnapshot(
      collection(db, 'users', uid, 'focusSessions'),
      (snapshot) =>
        setFocusSessions(snapshot.docs.map((d) => normalizeFocusSession(d.id, d.data()))),
      (caught) => console.error('Could not read focus sessions.', caught),
    )
  }, [uid])

  const value = useMemo(() => {
    const tasksCol = () => collection(db, 'users', uid, 'tasks')
    const taskDoc = (id) => doc(db, 'users', uid, 'tasks', id)
    const tagDoc = (id) => doc(db, 'users', uid, 'tags', id)
    const eventsCol = () => collection(db, 'users', uid, 'events')
    const eventDoc = (id) => doc(db, 'users', uid, 'events', id)

    // Until this user's own snapshots have landed, show nothing rather than
    // whatever the last account left in state.
    const liveTasks = loading ? [] : tasks
    const liveTags = loading ? [] : tags
    const liveEvents = loading ? [] : events

    /* Deleting is a stamp, not a deleteDoc (see removeTask): the document
       stays put with a `deletedAt` on it and drops out here, once, ahead of
       every bucket, cache, and lookup built below. That is the whole point of
       filtering at this single seam — nothing downstream has to remember that
       trash exists, and no future caller can forget to exclude it. */
    const visibleTasks = liveTasks.filter((t) => t.deletedAt === null)
    const visibleEvents = liveEvents.filter((e) => e.deletedAt === null)
    const trashedTasks = liveTasks.filter((t) => t.deletedAt !== null)
    const trashedEvents = liveEvents.filter((e) => e.deletedAt !== null)

    /* A tag files under another tag by id, and nothing stops a stored pair of
       documents from pointing at each other. Resolved once here, where the
       whole set is in hand: a parent that does not exist, or one whose chain
       leads back to the tag itself, is treated as no parent at all rather
       than left to hang every consumer that walks upward. */
    const rawTagById = new Map(liveTags.map((t) => [t.id, t]))
    const parentOf = (tag) => {
      const seen = new Set([tag.id])
      let parentId = tag.parentId
      while (parentId) {
        if (seen.has(parentId)) return null
        const parent = rawTagById.get(parentId)
        if (!parent) return null
        if (parent.id === tag.id) return null
        seen.add(parentId)
        // Walking the rest of the chain is what proves this link is safe to
        // keep — a cycle three tags up still invalidates the first hop.
        parentId = parent.parentId
      }
      return tag.parentId
    }
    const visibleTags = liveTags.map((tag) => ({ ...tag, parentId: parentOf(tag) }))

    /* Flattened depth-first, so a child sits directly under its own parent
       rather than wherever its `order` alone would have put it, and each tag
       carries the `depth` the lists and pickers indent by. Every tag is
       reachable exactly once: parentOf already rewrote any unresolvable or
       looping parent to null, so nothing can be stranded under a missing
       root and this walk always terminates. */
    const byOrder = (a, b) => a.order - b.order || a.name.localeCompare(b.name)
    const childrenOf = new Map()
    for (const tag of visibleTags) {
      const bucket = childrenOf.get(tag.parentId)
      if (bucket) bucket.push(tag)
      else childrenOf.set(tag.parentId, [tag])
    }
    for (const bucket of childrenOf.values()) bucket.sort(byOrder)
    const sortedTags = []
    const walkTags = (parentId, depth) => {
      for (const tag of childrenOf.get(parentId) ?? []) {
        sortedTags.push({ ...tag, depth })
        walkTags(tag.id, depth + 1)
      }
    }
    walkTags(null, 0)

    const tagById = new Map(sortedTags.map((t) => [t.id, t]))

    // All-day items (no startMin) sort ahead of timed blocks; ties by creation
    // so a day's order never shuffles between renders.
    const byTimeOfDay = (a, b) =>
      (a.startMin ?? -1) - (b.startMin ?? -1) ||
      a.createdAt - b.createdAt ||
      a.id.localeCompare(b.id)

    /* Pre-bucket by day once per snapshot. Every view would otherwise filter the
       full array on each render — the month grid alone would do it 42 times.

       A repeating task's document is a rule, not a thing on the calendar, so it
       is held aside here and expanded per day below rather than bucketed on its
       anchor date. */
    const series = []
    const tasksByDate = new Map()
    const inbox = []
    for (const task of visibleTasks) {
      if (task.recurrence) {
        series.push(task)
        continue
      }
      if (task.date === null) {
        inbox.push(task)
        continue
      }
      const bucket = tasksByDate.get(task.date)
      if (bucket) bucket.push(task)
      else tasksByDate.set(task.date, [task])
    }
    for (const bucket of tasksByDate.values()) bucket.sort(byTimeOfDay)
    inbox.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))

    const seriesById = new Map(series.map((s) => [s.id, s]))

    const occurrencesOn = (key) => {
      const out = []
      for (const parent of series) {
        const occurrence = occurrenceOn(parent, key)
        if (occurrence) out.push(occurrence)
      }
      return out
    }

    /* Cached per snapshot: a month render asks for 42 days, and every one of
       them would otherwise rebuild and re-sort its merged list. The cache also
       keeps the returned array referentially stable across those calls. */
    const dayCache = new Map()
    const tasksOn = (key) => {
      const cached = dayCache.get(key)
      if (cached) return cached
      const fixed = tasksByDate.get(key) ?? []
      const merged =
        series.length === 0 ? fixed : [...fixed, ...occurrencesOn(key)].sort(byTimeOfDay)
      dayCache.set(key, merged)
      return merged
    }

    /* Repeating events are held aside exactly as repeating tasks are: the
       document is a rule, not a thing on the calendar, so it is never placed
       on its anchor date — it is expanded per day below. */
    const eventSeries = []
    const fixedEvents = []
    for (const event of visibleEvents) {
      if (event.recurrence) eventSeries.push(event)
      else fixedEvents.push(event)
    }
    const eventSeriesById = new Map(eventSeries.map((s) => [s.id, s]))

    /* Sorted once, here, in the order the lane packer wants to consume them:
       earliest first, then longest first so a week-long bar claims its lane
       before a one-day bar can push it down, then id to keep it stable. */
    const bySpan = (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      b.endDate.localeCompare(a.endDate) ||
      a.id.localeCompare(b.id)
    const sortedEvents = [...fixedEvents].sort(bySpan)

    const eventOccurrencesOn = (key) => {
      const out = []
      for (const parent of eventSeries) {
        const occurrence = eventOccurrenceOn(parent, key)
        if (occurrence) out.push(occurrence)
      }
      return out
    }

    /* Mirrors dayCache: a month render asks 42 times, and each call would
       otherwise rescan every event. The cache also keeps the returned array
       referentially stable across those calls. */
    const eventDayCache = new Map()
    const eventsOn = (key) => {
      const cached = eventDayCache.get(key)
      if (cached) return cached
      const fixed = sortedEvents.filter((e) => e.startDate <= key && key <= e.endDate)
      const merged =
        eventSeries.length === 0 ? fixed : [...fixed, ...eventOccurrencesOn(key)].sort(bySpan)
      eventDayCache.set(key, merged)
      return merged
    }

    /* Day keys are strings precisely so a range test is a string comparison —
       no Date objects, no timezone, no DST.

       Occurrences have to be walked day by day rather than range-tested: a rule
       has no start and end to compare against. That is bounded work — callers
       ask for a week or a month grid, never an open range — and it goes through
       eventsOn so the day cache absorbs the repeat visits a month render makes. */
    const eventsInRange = (startKey, endKey) => {
      const fixed = sortedEvents.filter((e) => e.startDate <= endKey && e.endDate >= startKey)
      if (eventSeries.length === 0) return fixed
      const expanded = []
      for (let key = startKey; key <= endKey; key = addDays(key, 1)) {
        expanded.push(...eventOccurrencesOn(key))
      }
      return [...fixed, ...expanded].sort(bySpan)
    }

    /* An id from the UI can name a real document or one day of a series. Every
       mutation below resolves it first, because the two need different writes:
       a document is edited in place, a day of a series is an exception recorded
       on its parent. */
    const resolveOccurrence = (id) => {
      const parsed = parseOccurrenceId(id)
      if (!parsed) return null
      const parent = seriesById.get(parsed.seriesId)
      if (!parent) return null
      return { parent, dateKey: parsed.dateKey, task: occurrenceOn(parent, parsed.dateKey) }
    }

    /* A day key is not a legal dotted field path — it starts with a digit and
       contains hyphens — so the override map is always addressed by FieldPath. */
    const overrideAt = (dateKey) => new FieldPath('overrides', dateKey)

    /** Editing or moving one day of a series takes that day out of it: the
        occurrence is written out as its own ordinary task and the series marks
        the date taken. "This occurrence only" is the whole contract — the rule
        never changes shape because one morning did. */
    const detachOccurrence = async ({ parent, dateKey, task }, patch) => {
      const stamp = now()
      const {
        id: _id,
        seriesId: _seriesId,
        occurrenceDate: _occurrenceDate,
        recurrence: _recurrence,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...fields
      } = task
      const batch = writeBatch(db)
      batch.set(doc(tasksCol()), {
        ...fields,
        ...patch,
        recurrence: null,
        overrides: {},
        createdAt: stamp,
        updatedAt: stamp,
      })
      batch.update(taskDoc(parent.id), overrideAt(dateKey), { detached: true }, 'updatedAt', stamp)
      return batch.commit()
    }

    /* The event twins of the two above. Same contract, one document collection
       over: an event id from the UI can name a real document or one day of a
       repeating event, and the two need different writes. */
    const resolveEventOccurrence = (id) => {
      const parsed = parseOccurrenceId(id)
      if (!parsed) return null
      const parent = eventSeriesById.get(parsed.seriesId)
      if (!parent) return null
      return { parent, dateKey: parsed.dateKey, event: eventOccurrenceOn(parent, parsed.dateKey) }
    }

    const detachEventOccurrence = async ({ parent, dateKey, event }, patch) => {
      const stamp = now()
      const {
        id: _id,
        seriesId: _seriesId,
        occurrenceDate: _occurrenceDate,
        recurrence: _recurrence,
        durationMin: _durationMin,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...fields
      } = event
      const batch = writeBatch(db)
      batch.set(doc(eventsCol()), {
        ...fields,
        ...patch,
        recurrence: null,
        overrides: {},
        createdAt: stamp,
        updatedAt: stamp,
      })
      batch.update(eventDoc(parent.id), overrideAt(dateKey), { detached: true }, 'updatedAt', stamp)
      return batch.commit()
    }

    return {
      tasks: visibleTasks,
      tags: sortedTags,
      tagById,
      inbox,
      /* Deleted, not gone — the Trash section of the item index. Newest
         first, since the thing you want back is almost always the thing you
         just deleted. */
      trashedTasks: [...trashedTasks].sort((a, b) => b.deletedAt - a.deletedAt),
      trashedEvents: [...trashedEvents].sort((a, b) => b.deletedAt - a.deletedAt),
      profile,
      templates,
      focusSessions,
      loading,
      error,

      getTag: (id) => (id ? tagById.get(id) ?? null : null),
      /* tasksOn stays task-only, deliberately and permanently. Merging events
         into it would put them straight into dayStats, overdueTasks,
         upcomingTasks and every future caller by default — the exact leak
         keeping events in their own collection exists to prevent. Views
         compose tasksOn and eventsOn; nothing else does it for them. */
      tasksOn,
      occurrencesOn,
      getSeries: (id) => seriesById.get(id) ?? null,

      /* Like `tasks`, this is the DOCUMENTS — a repeating event appears once,
         as its rule. Views that draw days use eventsOn/eventsInRange, which
         expand; the item index wants the rule itself. */
      events: [...fixedEvents, ...eventSeries].sort(bySpan),
      eventsOn,
      eventsInRange,
      getEvent: (id) => visibleEvents.find((e) => e.id === id) ?? null,
      getEventSeries: (id) => eventSeriesById.get(id) ?? null,

      /* Built from normalizeTask itself rather than re-deriving each field's
         validation by hand a second time — that duplication is exactly how
         a task created through addTask and the same task re-read off
         Firestore a moment later could end up validated two different ways.
         done/completedAt/overrides/timestamps still get this call's own
         fresh-task values, applied after the spread so they always win: a
         new task is never created already done, with exceptions, or on
         someone else's clock. */
      async addTask(draft) {
        const stamp = now()
        const date = isValidKey(draft.date) ? draft.date : null
        const { id: _id, done: _done, completedAt: _completedAt, overrides: _overrides, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } =
          normalizeTask('new', { ...draft, date })
        return addDoc(tasksCol(), {
          ...fields,
          done: false,
          completedAt: null,
          overrides: {},
          createdAt: stamp,
          updatedAt: stamp,
        })
      },

      async updateTask(id, patch) {
        const occurrence = resolveOccurrence(id)
        if (occurrence) return detachOccurrence(occurrence, patch)
        return updateDoc(taskDoc(id), { ...patch, updatedAt: now() })
      },

      async toggleDone(id) {
        const occurrence = resolveOccurrence(id)
        if (occurrence) {
          const done = !occurrence.task.done
          return updateDoc(
            taskDoc(occurrence.parent.id),
            overrideAt(occurrence.dateKey),
            /* Un-ticking clears the entry rather than storing done:false, so a
               series document stays proportional to the days actually ticked
               off and not to how long the habit has been running. */
            done ? { done: true, completedAt: now() } : deleteField(),
            'updatedAt',
            now(),
          )
        }
        const task = visibleTasks.find((t) => t.id === id)
        if (!task) return undefined
        const done = !task.done
        return updateDoc(taskDoc(id), {
          done,
          completedAt: done ? now() : null,
          updatedAt: now(),
        })
      },

      /** Deleting one day of a series skips that day; deleting the series
          document takes every occurrence with it.
          A document delete is a `deletedAt` stamp, not a deleteDoc: the row
          leaves every view at once (the filter sits at the top of this memo)
          but stays recoverable from the Trash indefinitely, rather than for
          the six seconds an undo toast is on screen. Skipping one day of a
          series is NOT a document delete and gets no trash entry — there is
          no document to restore, only an override to clear, which is what
          un-skipping that day already does. */
      async removeTask(id) {
        const occurrence = resolveOccurrence(id)
        if (occurrence) {
          return updateDoc(
            taskDoc(occurrence.parent.id),
            overrideAt(occurrence.dateKey),
            { detached: true },
            'updatedAt',
            now(),
          )
        }
        return updateDoc(taskDoc(id), { deletedAt: now(), updatedAt: now() })
      },

      /** Drop a task into a slot — the one write the week grid and the inbox
          both go through, so scheduling behaves identically wherever it starts. */
      async scheduleTask(id, { date, startMin, durationMin }) {
        const patch = { date: isValidKey(date) ? date : null }
        patch.startMin =
          patch.date !== null && Number.isFinite(startMin) ? clampMin(startMin) : null
        if (Number.isFinite(durationMin)) patch.durationMin = durationMin

        const occurrence = resolveOccurrence(id)
        if (occurrence) return detachOccurrence(occurrence, patch)
        return updateDoc(taskDoc(id), { ...patch, updatedAt: now() })
      },

      async unscheduleTask(id) {
        const patch = { date: null, startMin: null }
        const occurrence = resolveOccurrence(id)
        if (occurrence) return detachOccurrence(occurrence, patch)
        return updateDoc(taskDoc(id), { ...patch, updatedAt: now() })
      },

      /* Events carry no recurrence, so none of the occurrence machinery above
         applies: an event id is always a real document id. */
      async addEvent(draft) {
        const stamp = now()
        const startDate = isValidKey(draft.startDate) ? draft.startDate : null
        if (startDate === null) throw new Error('An event needs a start date.')
        const endDate =
          isValidKey(draft.endDate) && draft.endDate > startDate ? draft.endDate : startDate
        const startMin = Number.isFinite(draft.startMin) ? clampMin(draft.startMin) : null
        return addDoc(eventsCol(), {
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
          // Only a single-day event may repeat — see normalizeEvent.
          recurrence:
            startDate === endDate ? normalizeRecurrence(draft.recurrence, startDate) : null,
          overrides: {},
          createdAt: stamp,
          updatedAt: stamp,
        })
      },

      async updateEvent(id, patch) {
        const occurrence = resolveEventOccurrence(id)
        if (occurrence) return detachEventOccurrence(occurrence, patch)
        return updateDoc(eventDoc(id), { ...patch, updatedAt: now() })
      },

      /** The event twin of removeTask, soft-delete included. */
      async removeEvent(id) {
        const occurrence = resolveEventOccurrence(id)
        if (occurrence) {
          return updateDoc(
            eventDoc(occurrence.parent.id),
            overrideAt(occurrence.dateKey),
            { detached: true },
            'updatedAt',
            now(),
          )
        }
        return updateDoc(eventDoc(id), { deletedAt: now(), updatedAt: now() })
      },

      /** Move a whole event to a new day, keeping its span. `grabOffsetDays`
          is the day-scale twin of the grid's grabOffsetMin: dropping the third
          day of a five-day bar onto Wednesday puts *that day* on Wednesday. */
      async moveEvent(id, toKey, grabOffsetDays = 0) {
        if (!isValidKey(toKey)) return undefined
        /* Dragging one day of a repeating event takes it out of the series
           rather than moving the rule — the same contract a task's occurrence
           has. An occurrence is a single day, so its span is the day it lands on. */
        const occurrence = resolveEventOccurrence(id)
        if (occurrence) {
          return detachEventOccurrence(occurrence, { startDate: toKey, endDate: toKey })
        }
        const event = sortedEvents.find((e) => e.id === id)
        if (!event) return undefined
        const startDate = addDays(toKey, -grabOffsetDays)
        // Shift both ends by the same delta so the span is preserved by
        // construction rather than recomputed and rounded.
        const delta = daysBetween(event.startDate, startDate)
        return updateDoc(eventDoc(id), {
          startDate,
          endDate: addDays(event.endDate, delta),
          updatedAt: now(),
        })
      },

      async addTag(draft) {
        return addDoc(collection(db, 'users', uid, 'tags'), {
          name: (draft.name ?? '').trim() || 'Untitled',
          // Default to the next unused slot so the palette is consumed in the
          // order that keeps colours separable, rather than piling onto blue.
          slot:
            draft.slot ??
            TAG_SLOTS.find((s) => !visibleTags.some((t) => t.slot === s)) ??
            TAG_SLOTS[visibleTags.length % TAG_SLOTS.length],
          icon: TAG_ICONS.includes(draft.icon) ? draft.icon : null,
          order: visibleTags.length,
        })
      },

      async updateTag(id, patch) {
        return updateDoc(tagDoc(id), patch)
      },

      /** Work outlives the label you filed it under: clear the tag from its
          tasks rather than deleting the history along with it. Events wear the
          same tags, so they are swept in the same pass — a tag deleted out
          from under an event would otherwise leave it painting from a token
          that no longer resolves. */
      async removeTag(id) {
        /* Swept from the live documents rather than the visible ones: a
           trashed task still wears its tag, and restoring it later to a tag
           that no longer exists would leave it painting from a token that
           resolves to nothing. */
        const affected = [
          ...liveTasks.filter((t) => t.tagId === id).map((t) => taskDoc(t.id)),
          ...liveEvents.filter((e) => e.tagId === id).map((e) => eventDoc(e.id)),
        ]
        // writeBatch caps at 500 operations, so chunk rather than assume.
        for (let i = 0; i < affected.length; i += 400) {
          const batch = writeBatch(db)
          for (const ref of affected.slice(i, i + 400)) {
            batch.update(ref, { tagId: null, updatedAt: now() })
          }
          await batch.commit()
        }
        /* Children are lifted to the top level rather than left pointing at a
           document that no longer exists. Reading already treats an
           unresolvable parent as none (see parentOf), so this only keeps the
           stored data honest — but a stale id that reads as null is exactly
           the kind of thing that survives an export and confuses the next
           reader of the file. */
        const orphans = liveTags.filter((t) => t.parentId === id)
        if (orphans.length > 0) {
          const batch = writeBatch(db)
          for (const child of orphans) batch.update(tagDoc(child.id), { parentId: null })
          await batch.commit()
        }
        return deleteDoc(tagDoc(id))
      },

      /** A saved "new task" starting point — see normalizeTemplate. Used
          from TaskEditor's "Save as template" and consumed by the command
          palette's per-template "New: <title>" entries. */
      async addTemplate(draft) {
        return addDoc(collection(db, 'users', uid, 'templates'), {
          title: (draft.title ?? '').trim() || 'Untitled template',
          tagId: draft.tagId ?? null,
          durationMin: Number.isFinite(draft.durationMin) ? draft.durationMin : DEFAULT_DURATION_MIN,
          priority: draft.priority ?? 'normal',
          createdAt: now(),
        })
      },

      async removeTemplate(id) {
        return deleteDoc(doc(db, 'users', uid, 'templates', id))
      },

      /** Written once, from FocusMode, the moment a focus round (not a
          break) completes. Never updated or read back individually — only
          aggregated, by Focus Mode's own stats strip and the Dashboard's
          per-tag breakdown. */
      async addFocusSession({ date, taskId, tagId, minutes }) {
        return addDoc(collection(db, 'users', uid, 'focusSessions'), {
          date,
          taskId: taskId ?? null,
          tagId: tagId ?? null,
          minutes,
          completedAt: now(),
        })
      },

      /** Sends every task and event to the Trash — including the rule behind
          each repeating series, which stands for every one of its
          occurrences. This is the "delete all" action in the item index; it
          is recoverable, item by item or all at once, from the Trash. */
      async removeAllItems() {
        const stamp = now()
        const refs = [
          ...visibleTasks.map((t) => taskDoc(t.id)),
          ...fixedEvents.map((e) => eventDoc(e.id)),
          ...eventSeries.map((e) => eventDoc(e.id)),
        ]
        // writeBatch caps at 500 operations, so chunk rather than assume.
        for (let i = 0; i < refs.length; i += 400) {
          const batch = writeBatch(db)
          for (const ref of refs.slice(i, i + 400)) {
            batch.update(ref, { deletedAt: stamp, updatedAt: stamp })
          }
          await batch.commit()
        }
      },

      /** Puts a trashed task or event back exactly where it was — clearing
          the stamp is the whole restore, because a soft delete never took
          anything off the document in the first place. */
      async restoreItem(kind, id) {
        const ref = kind === 'event' ? eventDoc(id) : taskDoc(id)
        return updateDoc(ref, { deletedAt: null, updatedAt: now() })
      },

      /** The delete a soft delete deferred. Irreversible — the caller is
          expected to confirm first. */
      async purgeItem(kind, id) {
        return deleteDoc(kind === 'event' ? eventDoc(id) : taskDoc(id))
      },

      /** Empties the Trash for good. Reads the trashed lists rather than
          re-querying: a document is only in them because a snapshot already
          reported it with a stamp on. */
      async emptyTrash() {
        const refs = [
          ...trashedTasks.map((t) => taskDoc(t.id)),
          ...trashedEvents.map((e) => eventDoc(e.id)),
        ]
        for (let i = 0; i < refs.length; i += 400) {
          const batch = writeBatch(db)
          for (const ref of refs.slice(i, i + 400)) batch.delete(ref)
          await batch.commit()
        }
        return refs.length
      },

      /** A file picked for the profile photo arrives already resized to a
          small square JPEG data URI (see ProfileModal) — this just writes it.
          `merge: true` because a Google account may have no `users/{uid}` doc
          at all until its first upload. */
      async updateProfilePhoto(base64) {
        return setDoc(doc(db, 'users', uid), { photoBase64: base64 }, { merge: true })
      },

      async removeProfilePhoto() {
        return updateDoc(doc(db, 'users', uid), { photoBase64: deleteField() })
      },

      /** Everything this account owns in Firestore — tasks, events (including
          every repeat rule), tags, and the profile doc itself. Deliberately
          broader than removeAllItems (which leaves the tag palette alone):
          this backs account deletion, where nothing should survive. Must run
          — and finish — while still signed in, since deleteAccount() (see
          firebase.js) ends the session, and the security rules refuse a
          write to this uid's tree the moment it does.

          Reads the RAW `tasks`/`events`/`tags` state, deliberately not
          `visibleTasks`/`fixedEvents`/`eventSeries` (which blank themselves
          to `[]` while `loading` is true — right for "don't flash the last
          account's data," wrong here, where it would make this resolve
          having silently deleted nothing. The caller is expected to hold off
          calling this until `loading` is false, so every doc these
          snapshots know about is actually in state to be listed. */
      async deleteAllData() {
        const refs = [
          ...tasks.map((t) => taskDoc(t.id)),
          ...events.map((e) => eventDoc(e.id)),
          ...tags.map((t) => tagDoc(t.id)),
        ]
        for (let i = 0; i < refs.length; i += 400) {
          const batch = writeBatch(db)
          for (const ref of refs.slice(i, i + 400)) batch.delete(ref)
          await batch.commit()
        }
        return deleteDoc(doc(db, 'users', uid))
      },

      /** Restores a JSON backup (see SettingsModal's export). Deliberately
          not built on addTask/addEvent/addTag: those exist for *creating*
          a fresh item and hardcode fresh-item defaults (done: false, no
          overrides) — an import needs to preserve exactly what was
          exported, done state and recurrence overrides included, so it
          writes full documents directly. Every item still goes through
          normalizeTask/normalizeEvent/normalizeTag first, the same
          untrusted-input treatment a Firestore snapshot gets, so a
          hand-edited or corrupted export file can't write garbage. */
      async importData({ tasks: importedTasks = [], events: importedEvents = [], tags: importedTags = [] }) {
        const stamp = now()
        const strip = ({ id: _id, ...rest }) => rest

        const writes = [
          ...importedTags.map((raw) => ({
            ref: doc(collection(db, 'users', uid, 'tags')),
            data: strip(normalizeTag('tmp', raw)),
          })),
          ...importedTasks.map((raw) => {
            const normalized = strip(normalizeTask('tmp', raw))
            return {
              ref: doc(tasksCol()),
              data: { ...normalized, createdAt: normalized.createdAt || stamp, updatedAt: stamp },
            }
          }),
          ...importedEvents.map((raw) => {
            const normalized = strip(normalizeEvent('tmp', raw))
            return {
              ref: doc(eventsCol()),
              data: { ...normalized, createdAt: normalized.createdAt || stamp, updatedAt: stamp },
            }
          }),
        ]

        for (let i = 0; i < writes.length; i += 400) {
          const batch = writeBatch(db)
          for (const { ref, data } of writes.slice(i, i + 400)) batch.set(ref, data)
          await batch.commit()
        }
        return writes.length
      },
    }
  }, [uid, tasks, tags, events, templates, focusSessions, profile, loading, error])

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>
}

export function useSchedule() {
  const context = useContext(ScheduleContext)
  if (!context) throw new Error('useSchedule must be used inside <ScheduleProvider>')
  return context
}
