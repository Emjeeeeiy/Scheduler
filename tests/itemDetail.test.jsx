/* ItemDetail's checklist, and specifically the one scenario no amount of
 * reading the code carefully substitutes for watching run: ticking off more
 * than one item on a single OCCURRENCE of a repeating task.
 *
 * The first tick detaches that occurrence into a brand new document (see
 * detachOccurrence in ScheduleContext) — the id this modal opened with stops
 * naming anything live. A second tick that kept targeting the old id would
 * either silently do nothing or throw, and clicking Edit afterward would
 * hand the full form an id nothing can save over. This file exists to prove
 * ItemDetail actually retargets itself instead.
 *
 * ScheduleContext is mocked rather than provided for real, since a real one
 * needs Firebase. The mock reproduces just the one behaviour under test —
 * an occurrence write returning a new id and the document moving out from
 * under its old one — not Firestore's actual detach code, which is
 * ScheduleContext's own responsibility to get right (see its own comments
 * on resolveOccurrence/detachOccurrence).
 */
import { useRef, useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ItemDetail } from '../src/components/editors/ItemDetail.jsx'

const DAY = '2026-08-24'

const BASE_SUBTASKS = [
  { id: 's1', title: 'Warm up', done: false },
  { id: 's2', title: 'Cool down', done: false },
]

const OCCURRENCE = {
  id: `series1~${DAY}`,
  seriesId: 'series1',
  occurrenceDate: DAY,
  title: 'Morning routine',
  notes: '',
  date: DAY,
  startMin: 420,
  durationMin: 30,
  tagId: null,
  recurrence: { freq: 'interval', unit: 'day', everyN: 1, anchor: DAY, until: null },
  overrides: {},
  done: false,
  pinned: false,
  blockedBy: [],
  subtasks: BASE_SUBTASKS,
  priority: 'normal',
}

const SERIES = { ...OCCURRENCE, id: 'series1', seriesId: undefined, occurrenceDate: undefined }

vi.mock('../src/state/ToastContext.jsx', () => ({
  useToast: () => ({ pushError: vi.fn(), pushSuccess: vi.fn() }),
}))

/** A minimal, self-contained stand-in for ScheduleContext's live state.
    `updateTask`'s functional setState form is what keeps this correct
    regardless of when React actually applies a given click's state update
    relative to the next one — there is no closed-over "current state" to
    go stale.

    `__getLatestUpdateTask` is a plain function, not a hook, specifically so
    the test bodies below can read its call history from outside a render —
    calling `useSchedule()` itself from there would break the Rules of Hooks,
    since test code runs with no component fiber active to attach to. */
vi.mock('../src/state/ScheduleContext.jsx', () => {
  let latestUpdateTask = null
  return {
    __getLatestUpdateTask: () => latestUpdateTask,
    useSchedule: () => {
      const [state, setState] = useState({ detachedTask: null })
      const updateTaskRef = useRef(null)
      if (!updateTaskRef.current) {
        updateTaskRef.current = vi.fn(
          (id, patch) =>
            new Promise((resolve, reject) => {
              setState((prev) => {
                if (!prev.detachedTask && id === OCCURRENCE.id) {
                  const detachedTask = {
                    ...OCCURRENCE,
                    ...patch,
                    id: 'detached1',
                    seriesId: undefined,
                    occurrenceDate: undefined,
                    recurrence: null,
                  }
                  queueMicrotask(() => resolve('detached1'))
                  return { detachedTask }
                }
                if (prev.detachedTask && id === prev.detachedTask.id) {
                  const updated = { ...prev.detachedTask, ...patch }
                  queueMicrotask(() => resolve(undefined))
                  return { detachedTask: updated }
                }
                // Anything else is an ordinary, non-occurrence id — the real
                // ScheduleContext's fallback for one of those is a plain,
                // successful update with no detach and nothing to hand back.
                if (id === SERIES.id || id === 'plain1') {
                  queueMicrotask(() => resolve(undefined))
                  return prev
                }
                queueMicrotask(() => reject(new Error(`unexpected updateTask(${id})`)))
                return prev
              })
            }),
        )
      }
      latestUpdateTask = updateTaskRef.current

      return {
        tasks: state.detachedTask ? [SERIES, state.detachedTask] : [SERIES],
        events: [],
        occurrencesOn: (key) => (!state.detachedTask && key === DAY ? [OCCURRENCE] : []),
        getTag: () => null,
        getSeries: (id) => (id === 'series1' ? SERIES : null),
        updateTask: updateTaskRef.current,
        scheduleTask: vi.fn(),
      }
    },
  }
})

const editor = { mode: 'view', kind: 'task', task: OCCURRENCE }

describe('ItemDetail checklist on an occurrence', () => {
  it('shows every item, and ticks the first one against the occurrence id', async () => {
    const onEdit = vi.fn()
    render(<ItemDetail editor={editor} onClose={vi.fn()} onEdit={onEdit} />)

    expect(screen.getByText('Warm up')).toBeTruthy()
    expect(screen.getByText('Cool down')).toBeTruthy()
    expect(screen.getByText('Checklist — 0/2 done')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Warm up'))
    })

    const { __getLatestUpdateTask } = await import('../src/state/ScheduleContext.jsx')
    const calls = __getLatestUpdateTask().mock.calls
    expect(calls[0][0]).toBe(OCCURRENCE.id)
    expect(calls[0][1].subtasks.find((s) => s.id === 's1').done).toBe(true)
    expect(screen.getByText('Checklist — 1/2 done')).toBeTruthy()
  })

  it('retargets the second tick at the document the first one just created', async () => {
    const onEdit = vi.fn()
    render(<ItemDetail editor={editor} onClose={vi.fn()} onEdit={onEdit} />)

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Warm up'))
    })
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Cool down'))
    })

    const { __getLatestUpdateTask } = await import('../src/state/ScheduleContext.jsx')
    const calls = __getLatestUpdateTask().mock.calls
    // Same mock instance throughout (see the module mock's `if
    // (!updateTaskRef.current)` guard), so both clicks land in one call
    // history — the whole point being asserted here.
    expect(calls.length).toBe(2)
    expect(calls[0][0]).toBe(OCCURRENCE.id)
    // The second click must NOT reuse the id the first one detached away
    // from — that id no longer names anything live.
    expect(calls[1][0]).toBe('detached1')
    expect(calls[1][0]).not.toBe(OCCURRENCE.id)

    // And both ticks actually landed, not just the most recent one.
    const finalSubtasks = calls[1][1].subtasks
    expect(finalSubtasks.find((s) => s.id === 's1').done).toBe(true)
    expect(finalSubtasks.find((s) => s.id === 's2').done).toBe(true)
    expect(screen.getByText('Checklist — 2/2 done')).toBeTruthy()
  })

  it('hands Edit the detached document, not the stale occurrence', async () => {
    const onEdit = vi.fn()
    render(<ItemDetail editor={editor} onClose={vi.fn()} onEdit={onEdit} />)

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Warm up'))
    })
    fireEvent.click(screen.getByText('Edit'))

    expect(onEdit).toHaveBeenCalledTimes(1)
    const handedOff = onEdit.mock.calls[0][0]
    expect(handedOff.id).toBe('detached1')
    expect(handedOff.seriesId).toBeUndefined()
    expect(handedOff.occurrenceDate).toBeUndefined()
    // The tick made moments ago must survive the handoff even though the
    // live snapshot this component reads from may not have caught up yet —
    // TaskEditor saves the whole subtasks array it's opened with, so a stale
    // copy here would look like Save silently undid the click.
    expect(handedOff.subtasks.find((s) => s.id === 's1').done).toBe(true)
  })
})

describe('ItemDetail checklist on an ordinary task', () => {
  it('ticks a plain task in place, with no detachment involved', async () => {
    const plainTask = { ...SERIES, id: 'plain1', recurrence: null, subtasks: BASE_SUBTASKS }
    render(
      <ItemDetail
        editor={{ mode: 'view', kind: 'task', task: plainTask }}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Warm up'))
    })

    expect(screen.getByText('Checklist — 1/2 done')).toBeTruthy()
    const { __getLatestUpdateTask } = await import('../src/state/ScheduleContext.jsx')
    // The click targeted the task's own id directly — no detour through
    // resolveOccurrence/detachOccurrence, because there was never an
    // occurrence id here to resolve in the first place.
    expect(__getLatestUpdateTask()).toHaveBeenCalledWith('plain1', expect.anything())
  })
})
