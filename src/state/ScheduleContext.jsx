import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase.js'
import { useAuth } from './AuthContext.jsx'
import { clampMin, isValidKey } from '../lib/date.js'

const ScheduleContext = createContext(null)

export const DEFAULT_DURATION_MIN = 30

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
    const markReady = () => {
      if (tasksReady && tagsReady) setReadyUid(uid)
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

    return () => {
      unsubscribeTasks()
      unsubscribeTags()
    }
  }, [uid])

  const value = useMemo(() => {
    const tasksCol = () => collection(db, 'users', uid, 'tasks')
    const taskDoc = (id) => doc(db, 'users', uid, 'tasks', id)
    const tagDoc = (id) => doc(db, 'users', uid, 'tags', id)

    // Until this user's own snapshots have landed, show nothing rather than
    // whatever the last account left in state.
    const visibleTasks = loading ? [] : tasks
    const visibleTags = loading ? [] : tags

    const tagById = new Map(visibleTags.map((t) => [t.id, t]))

    /* Pre-bucket by day once per snapshot. Every view would otherwise filter the
       full array on each render — the month grid alone would do it 42 times. */
    const tasksByDate = new Map()
    const inbox = []
    for (const task of visibleTasks) {
      if (task.date === null) {
        inbox.push(task)
        continue
      }
      const bucket = tasksByDate.get(task.date)
      if (bucket) bucket.push(task)
      else tasksByDate.set(task.date, [task])
    }
    // All-day items (no startMin) sort ahead of timed blocks; ties by creation
    // so a day's order never shuffles between renders.
    for (const bucket of tasksByDate.values()) {
      bucket.sort(
        (a, b) =>
          (a.startMin ?? -1) - (b.startMin ?? -1) ||
          a.createdAt - b.createdAt ||
          a.id.localeCompare(b.id),
      )
    }
    inbox.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))

    const sortedTags = [...visibleTags].sort(
      (a, b) => a.order - b.order || a.name.localeCompare(b.name),
    )

    return {
      tasks: visibleTasks,
      tags: sortedTags,
      tagById,
      tasksByDate,
      inbox,
      loading,
      error,

      getTag: (id) => (id ? tagById.get(id) ?? null : null),
      tasksOn: (key) => tasksByDate.get(key) ?? [],

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
          createdAt: stamp,
          updatedAt: stamp,
        })
      },

      async updateTask(id, patch) {
        return updateDoc(taskDoc(id), { ...patch, updatedAt: now() })
      },

      async toggleDone(id) {
        const task = visibleTasks.find((t) => t.id === id)
        if (!task) return undefined
        const done = !task.done
        return updateDoc(taskDoc(id), {
          done,
          completedAt: done ? now() : null,
          updatedAt: now(),
        })
      },

      async removeTask(id) {
        return deleteDoc(taskDoc(id))
      },

      /** Drop a task into a slot — the one write the week grid and the inbox
          both go through, so scheduling behaves identically wherever it starts. */
      async scheduleTask(id, { date, startMin, durationMin }) {
        const patch = { date: isValidKey(date) ? date : null, updatedAt: now() }
        patch.startMin =
          patch.date !== null && Number.isFinite(startMin) ? clampMin(startMin) : null
        if (Number.isFinite(durationMin)) patch.durationMin = durationMin
        return updateDoc(taskDoc(id), patch)
      },

      async unscheduleTask(id) {
        return updateDoc(taskDoc(id), { date: null, startMin: null, updatedAt: now() })
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
          tasks rather than deleting the history along with it. */
      async removeTag(id) {
        const affected = visibleTasks.filter((t) => t.tagId === id)
        // writeBatch caps at 500 operations, so chunk rather than assume.
        for (let i = 0; i < affected.length; i += 400) {
          const batch = writeBatch(db)
          for (const task of affected.slice(i, i + 400)) {
            batch.update(taskDoc(task.id), { tagId: null, updatedAt: now() })
          }
          await batch.commit()
        }
        return deleteDoc(tagDoc(id))
      },
    }
  }, [uid, tasks, tags, loading, error])

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>
}

export function useSchedule() {
  const context = useContext(ScheduleContext)
  if (!context) throw new Error('useSchedule must be used inside <ScheduleProvider>')
  return context
}
