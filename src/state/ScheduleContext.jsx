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
  normalizeOverrides,
  normalizeRecurrence,
  occurrenceOn,
  parseOccurrenceId,
} from '../lib/recurrence.js'

const ScheduleContext = createContext(null)

export const DEFAULT_DURATION_MIN = 30

/** A timed event with no end time covers an hour, the same way a task with no
    stated duration covers thirty minutes. */
export const DEFAULT_EVENT_DURATION_MIN = 60

/* An event may legitimately run for months (a sabbatical, a long project), but
   not for centuries. This is a guard against corrupt data, not a product
   limit — see the cap in normalizeEvent. */
const MAX_EVENT_DAYS = 366

/* The colour menu, in validated slot order (see the tag palette note in
   tokens.css). A tag doc stores the slot NAME, not a hex: the two themes need
   different steps of the same hue, and one stored hex could only ever satisfy
   one of them. Slots are handed out in order because that order is what keeps
   adjacent colours distinguishable under colour-vision deficiency. */
export const TAG_SLOTS = [
  'blue',
  'orange',
  'aqua',
  'yellow',
  'magenta',
  'green',
  'violet',
  'red',
]

/* Deterministic ids, so seeding is idempotent: two tabs (or a retry after an
   offline write) converge on the same three docs instead of racing to create
   duplicates. */
const STARTER_TAGS = [
  { id: 'work', name: 'Work', slot: 'blue', order: 0 },
  { id: 'personal', name: 'Personal', slot: 'orange', order: 1 },
  { id: 'study', name: 'Study', slot: 'aqua', order: 2 },
]

/* ---------------------------------------------------------- normalisation -- */

/* A Firestore doc is as untrusted as anything else read off a disk: it may
   predate a field, have been written by an older build, or be half-typed from
   another device. Coerce every field to its expected type here so a single bad
   document can never blank out a calendar. */
function normalizeTask(id, raw) {
  const date = isValidKey(raw?.date) ? raw.date : null
  // A start time without a date is meaningless — such a task belongs in the
  // inbox, not floating on a day that does not exist.
  const startMin = date && Number.isFinite(raw?.startMin) ? clampMin(raw.startMin) : null
  const title = typeof raw?.title === 'string' ? raw.title.trim() : ''
  const recurrence = normalizeRecurrence(raw?.recurrence, date)

  return {
    id,
    title: title || 'Untitled task',
    notes: typeof raw?.notes === 'string' ? raw.notes : '',
    date,
    startMin,
    durationMin: Number.isFinite(raw?.durationMin)
      ? Math.min(24 * 60, Math.max(5, Math.round(raw.durationMin)))
      : DEFAULT_DURATION_MIN,
    tagId: typeof raw?.tagId === 'string' && raw.tagId ? raw.tagId : null,
    done: raw?.done === true,
    completedAt: Number.isFinite(raw?.completedAt) ? raw.completedAt : null,
    recurrence,
    overrides: recurrence ? normalizeOverrides(raw?.overrides) : {},
    createdAt: Number.isFinite(raw?.createdAt) ? raw.createdAt : 0,
    updatedAt: Number.isFinite(raw?.updatedAt) ? raw.updatedAt : 0,
  }
}

/* An event is a commitment, not work to get through: no done state, no
   recurrence, and it may cover a range of days rather than sitting on one.
   Because a timed event still carries startMin and a derived durationMin, it
   flows through layoutDay/visibleWindow exactly like a task does — the grid
   needs no second code path to draw one. */
function normalizeEvent(id, raw) {
  const startDate = isValidKey(raw?.startDate) ? raw.startDate : null
  const rawEnd = isValidKey(raw?.endDate) ? raw.endDate : null
  // An end can never sit before its start; a malformed range collapses to the
  // single day it started on rather than rendering as a bar of negative width.
  let endDate = startDate && rawEnd && rawEnd > startDate ? rawEnd : startDate
  /* And a corrupt far-future end is capped rather than trusted. The month lane
     packer walks a span day by day, so a stray '2999-12-31' would not merely
     draw something wrong — it would spin through ~350,000 iterations per
     render. Bound it here, at the same edge every other field is coerced. */
  if (endDate !== null && daysBetween(startDate, endDate) >= MAX_EVENT_DAYS) {
    endDate = addDays(startDate, MAX_EVENT_DAYS - 1)
  }
  const startMin = startDate && Number.isFinite(raw?.startMin) ? clampMin(raw.startMin) : null
  /* An end *time* only means something inside a single day. Across a range the
     bar covers whole days, and a clock time would be ambiguous about which. */
  const endMin =
    startDate === endDate && startMin !== null && Number.isFinite(raw?.endMin)
      ? clampMin(raw.endMin)
      : null
  const title = typeof raw?.title === 'string' ? raw.title.trim() : ''

  return {
    id,
    title: title || 'Untitled event',
    notes: typeof raw?.notes === 'string' ? raw.notes : '',
    startDate,
    endDate,
    startMin,
    endMin,
    durationMin:
      startMin === null
        ? null
        : endMin !== null && endMin > startMin
          ? endMin - startMin
          : DEFAULT_EVENT_DURATION_MIN,
    tagId: typeof raw?.tagId === 'string' && raw.tagId ? raw.tagId : null,
    createdAt: Number.isFinite(raw?.createdAt) ? raw.createdAt : 0,
    updatedAt: Number.isFinite(raw?.updatedAt) ? raw.updatedAt : 0,
  }
}

function normalizeTag(id, raw) {
  const name = typeof raw?.name === 'string' ? raw.name.trim() : ''
  const slot = TAG_SLOTS.includes(raw?.slot) ? raw.slot : TAG_SLOTS[0]
  return {
    id,
    name: name || 'Untitled',
    slot,
    // Resolved once here so every consumer paints from the themed token and
    // no component has to know how a slot maps to a colour.
    color: `var(--tag-${slot})`,
    order: Number.isFinite(raw?.order) ? raw.order : 0,
  }
}

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

  const value = useMemo(() => {
    const tasksCol = () => collection(db, 'users', uid, 'tasks')
    const taskDoc = (id) => doc(db, 'users', uid, 'tasks', id)
    const tagDoc = (id) => doc(db, 'users', uid, 'tags', id)
    const eventsCol = () => collection(db, 'users', uid, 'events')
    const eventDoc = (id) => doc(db, 'users', uid, 'events', id)

    // Until this user's own snapshots have landed, show nothing rather than
    // whatever the last account left in state.
    const visibleTasks = loading ? [] : tasks
    const visibleTags = loading ? [] : tags
    const visibleEvents = loading ? [] : events

    const tagById = new Map(visibleTags.map((t) => [t.id, t]))

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

    const sortedTags = [...visibleTags].sort(
      (a, b) => a.order - b.order || a.name.localeCompare(b.name),
    )

    /* Sorted once, here, in the order the lane packer wants to consume them:
       earliest first, then longest first so a week-long bar claims its lane
       before a one-day bar can push it down, then id to keep it stable. */
    const sortedEvents = [...visibleEvents].sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        b.endDate.localeCompare(a.endDate) ||
        a.id.localeCompare(b.id),
    )

    /* Day keys are strings precisely so a range test is a string comparison —
       no Date objects, no timezone, no DST. */
    const eventsInRange = (startKey, endKey) =>
      sortedEvents.filter((e) => e.startDate <= endKey && e.endDate >= startKey)

    /* Mirrors dayCache: a month render asks 42 times, and each call would
       otherwise rescan every event. The cache also keeps the returned array
       referentially stable across those calls. */
    const eventDayCache = new Map()
    const eventsOn = (key) => {
      const cached = eventDayCache.get(key)
      if (cached) return cached
      const found = sortedEvents.filter((e) => e.startDate <= key && key <= e.endDate)
      eventDayCache.set(key, found)
      return found
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

    return {
      tasks: visibleTasks,
      tags: sortedTags,
      tagById,
      inbox,
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

      events: sortedEvents,
      eventsOn,
      eventsInRange,
      getEvent: (id) => sortedEvents.find((e) => e.id === id) ?? null,

      async addTask(draft) {
        const stamp = now()
        const date = isValidKey(draft.date) ? draft.date : null
        return addDoc(tasksCol(), {
          title: (draft.title ?? '').trim() || 'Untitled task',
          notes: draft.notes ?? '',
          date,
          startMin: date && Number.isFinite(draft.startMin) ? clampMin(draft.startMin) : null,
          durationMin: Number.isFinite(draft.durationMin)
            ? draft.durationMin
            : DEFAULT_DURATION_MIN,
          tagId: draft.tagId ?? null,
          done: false,
          completedAt: null,
          recurrence: normalizeRecurrence(draft.recurrence, date),
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
          document takes every occurrence with it. */
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
        return deleteDoc(taskDoc(id))
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
          createdAt: stamp,
          updatedAt: stamp,
        })
      },

      async updateEvent(id, patch) {
        return updateDoc(eventDoc(id), { ...patch, updatedAt: now() })
      },

      async removeEvent(id) {
        return deleteDoc(eventDoc(id))
      },

      /** Move a whole event to a new day, keeping its span. `grabOffsetDays`
          is the day-scale twin of the grid's grabOffsetMin: dropping the third
          day of a five-day bar onto Wednesday puts *that day* on Wednesday. */
      async moveEvent(id, toKey, grabOffsetDays = 0) {
        const event = sortedEvents.find((e) => e.id === id)
        if (!event || !isValidKey(toKey)) return undefined
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
        const affected = [
          ...visibleTasks.filter((t) => t.tagId === id).map((t) => taskDoc(t.id)),
          ...sortedEvents.filter((e) => e.tagId === id).map((e) => eventDoc(e.id)),
        ]
        // writeBatch caps at 500 operations, so chunk rather than assume.
        for (let i = 0; i < affected.length; i += 400) {
          const batch = writeBatch(db)
          for (const ref of affected.slice(i, i + 400)) {
            batch.update(ref, { tagId: null, updatedAt: now() })
          }
          await batch.commit()
        }
        return deleteDoc(tagDoc(id))
      },
    }
  }, [uid, tasks, tags, events, loading, error])

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>
}

export function useSchedule() {
  const context = useContext(ScheduleContext)
  if (!context) throw new Error('useSchedule must be used inside <ScheduleProvider>')
  return context
}
