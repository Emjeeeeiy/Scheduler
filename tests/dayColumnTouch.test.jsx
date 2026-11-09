/* A block on a phone must never be moved or resized by a thumb that was only
 * scrolling or reading. These pin the contract that makes that so:
 *
 * - at rest on a touch screen a block is not draggable and its edge grips do
 *   nothing, so a scroll that starts on an edge writes nothing;
 * - holding a block (about half a second, without travelling) arms it; a tap
 *   still opens the editor, and a scroll never arms anything;
 * - only an armed block can be dragged (its body, to move; a grip, to resize),
 *   each gesture is one snapped write, and each can be undone;
 * - anything else — a tap elsewhere, Escape, another block, six idle seconds —
 *   puts it back, and the tap that does so does not also create a task;
 * - a mouse is unchanged: its handles resize without arming.
 *
 * The grid is 8:00–18:00 in a 600px column (1px a minute), so a pointer's
 * distance in pixels is its distance in minutes.
 */
import { act, cleanup, createEvent, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DayColumn } from '../src/components/calendar/DayColumn.jsx'
import { DRAG_TASK } from '../src/lib/dnd.js'

const mocks = vi.hoisted(() => ({
  scheduleTask: vi.fn(),
  toggleDone: vi.fn(),
  pushUndo: vi.fn(),
  pushError: vi.fn(),
}))

vi.mock('../src/state/ScheduleContext.jsx', () => ({
  useSchedule: () => ({
    scheduleTask: mocks.scheduleTask,
    toggleDone: mocks.toggleDone,
    getTag: (id) => (id === 'work' ? { id: 'work', name: 'Work', color: 'var(--color-tag-blue)' } : null),
  }),
}))
vi.mock('../src/state/ToastContext.jsx', () => ({
  useToast: () => ({ pushUndo: mocks.pushUndo, pushError: mocks.pushError }),
}))

const DAY = '2026-08-24'
const WINDOW_START = 8 * 60
const WINDOW_END = 18 * 60

const standup = {
  id: 't1',
  title: 'Standup',
  date: DAY,
  startMin: 9 * 60,
  durationMin: 60,
  done: false,
  tagId: null,
  recurrence: null,
}
const review = { ...standup, id: 't2', title: 'Review', startMin: 14 * 60 }

const onEdit = vi.fn()
const onCreate = vi.fn()

function stubMedia(coarse) {
  window.matchMedia = vi.fn((query) => ({
    matches: coarse && query === '(pointer: coarse)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

function renderColumn(tasks = [standup], { coarse = true, peekOnTouch = false } = {}) {
  stubMedia(coarse)
  return render(
    <DayColumn
      peekOnTouch={peekOnTouch}
      dateKey={DAY}
      tasks={tasks}
      windowStart={WINDOW_START}
      windowEnd={WINDOW_END}
      hourMarkList={[WINDOW_START, WINDOW_START + 60]}
      onEdit={onEdit}
      onCreate={onCreate}
    />,
  )
}

const blocks = (container) => [...container.querySelectorAll('button.block')]
const handle = (container, edge, index = 0) =>
  container.querySelectorAll(`.block__handle--${edge}`)[index]
const surface = (container) => container.querySelector('.day-column__surface')

const touch = (type, element, init = {}) =>
  fireEvent[type](element, { pointerType: 'touch', pointerId: 1, button: 0, ...init })
const mouse = (type, element, init = {}) =>
  fireEvent[type](element, { pointerType: 'mouse', pointerId: 1, button: 0, ...init })

/** Hold a block long enough to arm it, then let go. */
function arm(container, index = 0, y = 100) {
  const block = blocks(container)[index]
  touch('pointerDown', block, { clientX: 20, clientY: y })
  act(() => {
    vi.advanceTimersByTime(450)
  })
  touch('pointerUp', block, { clientX: 20, clientY: y })
  // The click a browser sends after the release must not open the editor.
  fireEvent.click(block)
  return block
}

/** jsdom's drop is a bare Event, which has no clientY of its own. */
function drop(element, { clientY, payload }) {
  const event = createEvent.drop(element, {
    dataTransfer: { types: [DRAG_TASK], getData: () => JSON.stringify(payload) },
  })
  Object.defineProperty(event, 'clientY', { value: clientY })
  fireEvent(element, event)
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.scheduleTask.mockReset().mockResolvedValue(undefined)
  mocks.pushUndo.mockReset()
  mocks.pushError.mockReset()
  mocks.toggleDone.mockReset()
  onEdit.mockReset()
  onCreate.mockReset()
  Object.defineProperty(navigator, 'vibrate', { value: vi.fn(), configurable: true, writable: true })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const isSurface = this.classList?.contains('day-column__surface')
    const height = isSurface ? 600 : 0
    return { top: 0, left: 0, right: 100, bottom: height, width: 100, height, x: 0, y: 0, toJSON() {} }
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  delete window.matchMedia
})

describe('a block at rest on a touch screen', () => {
  it('is not draggable, so a long press cannot pick it up', () => {
    const { container } = renderColumn()
    expect(blocks(container)[0].getAttribute('draggable')).toBe('false')
  })

  it('stays draggable with a mouse', () => {
    const { container } = renderColumn([standup], { coarse: false })
    expect(blocks(container)[0].getAttribute('draggable')).toBe('true')
  })

  it('does nothing when a thumb drags an idle edge grip', () => {
    const { container } = renderColumn()
    const grip = handle(container, 'bottom')
    touch('pointerDown', grip, { clientY: 120 })
    touch('pointerMove', grip, { clientY: 150 })
    touch('pointerUp', grip, { clientY: 150 })
    expect(mocks.scheduleTask).not.toHaveBeenCalled()
    expect(container.querySelector('.block--resizing')).toBeNull()
  })

  it('opens the editor on a plain tap, and stays at rest', () => {
    const { container } = renderColumn()
    const block = blocks(container)[0]
    touch('pointerDown', block, { clientY: 100 })
    touch('pointerUp', block, { clientY: 100 })
    fireEvent.click(block)
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(block.classList.contains('block--armed')).toBe(false)
  })
})

describe('arming', () => {
  it('arms after a hold of about half a second, and not a moment sooner', () => {
    const { container } = renderColumn()
    const block = blocks(container)[0]
    touch('pointerDown', block, { clientX: 20, clientY: 100 })
    act(() => {
      vi.advanceTimersByTime(449)
    })
    expect(block.classList.contains('block--armed')).toBe(false)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(block.classList.contains('block--armed')).toBe(true)
    expect(handle(container, 'top').classList.contains('block__handle--armed')).toBe(true)
    expect(handle(container, 'bottom').classList.contains('block__handle--armed')).toBe(true)
    expect(navigator.vibrate).toHaveBeenCalled()
  })

  it('does not open the editor on the release that arms it', () => {
    const { container } = renderColumn()
    arm(container)
    expect(onEdit).not.toHaveBeenCalled()
    // ...but the next tap on it does.
    act(() => {
      vi.advanceTimersByTime(400)
    })
    const block = blocks(container)[0]
    touch('pointerDown', block, { clientY: 100 })
    touch('pointerUp', block, { clientY: 100 })
    fireEvent.click(block)
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('never arms when the finger travels first — that was a scroll', () => {
    const { container } = renderColumn()
    const block = blocks(container)[0]
    touch('pointerDown', block, { clientX: 20, clientY: 100 })
    touch('pointerMove', block, { clientX: 20, clientY: 115 })
    act(() => {
      vi.advanceTimersByTime(800)
    })
    expect(block.classList.contains('block--armed')).toBe(false)
  })

  it('never arms when the browser takes the touch for scrolling', () => {
    const { container } = renderColumn()
    const block = blocks(container)[0]
    touch('pointerDown', block, { clientY: 100 })
    touch('pointerCancel', block)
    act(() => {
      vi.advanceTimersByTime(800)
    })
    expect(block.classList.contains('block--armed')).toBe(false)
  })

  it('arms only one block at a time', () => {
    const { container } = renderColumn([standup, review])
    arm(container, 0)
    const second = blocks(container)[1]
    touch('pointerDown', second, { clientY: 400 })
    expect(blocks(container)[0].classList.contains('block--armed')).toBe(false)
    act(() => {
      vi.advanceTimersByTime(450)
    })
    expect(second.classList.contains('block--armed')).toBe(true)
  })
})

describe('moving an armed block', () => {
  it('follows the finger and commits one write, snapped to 15 minutes', async () => {
    const { container } = renderColumn()
    const block = arm(container)
    touch('pointerDown', block, { clientY: 100 })
    touch('pointerMove', block, { clientY: 130 })
    // Live, before the finger lifts: 9:00 + 30m.
    expect(block.style.top).toBe(`${((570 - WINDOW_START) / (WINDOW_END - WINDOW_START)) * 100}%`)
    expect(mocks.scheduleTask).not.toHaveBeenCalled()
    touch('pointerUp', block, { clientY: 130 })
    await flush()
    expect(mocks.scheduleTask).toHaveBeenCalledTimes(1)
    expect(mocks.scheduleTask).toHaveBeenCalledWith('t1', { date: DAY, startMin: 570 })
    // The click after a drag must not open the editor.
    fireEvent.click(block)
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('snaps to the nearest quarter hour', async () => {
    const { container } = renderColumn()
    const block = arm(container)
    touch('pointerDown', block, { clientY: 100 })
    touch('pointerMove', block, { clientY: 108 }) // 9:08 -> 9:15
    touch('pointerUp', block, { clientY: 108 })
    await flush()
    expect(mocks.scheduleTask).toHaveBeenCalledWith('t1', { date: DAY, startMin: 555 })
  })

  it('stays inside the grid, however far it is dragged', async () => {
    const { container } = renderColumn()
    let block = arm(container)
    touch('pointerDown', block, { clientY: 100 })
    touch('pointerMove', block, { clientY: 5000 })
    touch('pointerUp', block, { clientY: 5000 })
    await flush()
    // The latest start that still ends by 18:00.
    expect(mocks.scheduleTask).toHaveBeenLastCalledWith('t1', { date: DAY, startMin: WINDOW_END - 60 })

    block = blocks(container)[0]
    act(() => {
      vi.advanceTimersByTime(400)
    })
    touch('pointerDown', block, { clientY: 100 })
    touch('pointerMove', block, { clientY: -5000 })
    touch('pointerUp', block, { clientY: -5000 })
    await flush()
    expect(mocks.scheduleTask).toHaveBeenLastCalledWith('t1', { date: DAY, startMin: WINDOW_START })
  })

  it('writes nothing for a press that went nowhere', async () => {
    const { container } = renderColumn()
    const block = arm(container)
    touch('pointerDown', block, { clientY: 100 })
    touch('pointerMove', block, { clientY: 101 })
    touch('pointerUp', block, { clientY: 101 })
    await flush()
    expect(mocks.scheduleTask).not.toHaveBeenCalled()
  })

  it('offers Undo, and Undo puts it back', async () => {
    const { container } = renderColumn()
    const block = arm(container)
    touch('pointerDown', block, { clientY: 100 })
    touch('pointerMove', block, { clientY: 130 })
    touch('pointerUp', block, { clientY: 130 })
    await flush()
    expect(mocks.pushUndo).toHaveBeenCalledTimes(1)
    const [message, undo] = mocks.pushUndo.mock.calls[0]
    expect(message).toContain('Standup')
    expect(message).toContain('9:30 AM')
    mocks.scheduleTask.mockClear()
    await undo()
    expect(mocks.scheduleTask).toHaveBeenCalledWith('t1', { date: DAY, startMin: 9 * 60 })
  })

  it('offers no Undo for one day of a repeating task, which would need a detach to reverse', async () => {
    const repeating = { ...standup, recurrence: { days: [1], anchor: DAY } }
    const { container } = renderColumn([repeating])
    const block = arm(container)
    touch('pointerDown', block, { clientY: 100 })
    touch('pointerMove', block, { clientY: 130 })
    touch('pointerUp', block, { clientY: 130 })
    await flush()
    expect(mocks.scheduleTask).toHaveBeenCalledTimes(1)
    expect(mocks.pushUndo).not.toHaveBeenCalled()
  })

  it('says so when the write fails', async () => {
    mocks.scheduleTask.mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = renderColumn()
    const block = arm(container)
    touch('pointerDown', block, { clientY: 100 })
    touch('pointerMove', block, { clientY: 130 })
    touch('pointerUp', block, { clientY: 130 })
    await flush()
    expect(mocks.pushError).toHaveBeenCalled()
    expect(mocks.pushUndo).not.toHaveBeenCalled()
  })
})

describe('resizing an armed block', () => {
  it('drags the bottom grip to a new length, with one snapped write', async () => {
    const { container } = renderColumn()
    arm(container)
    const grip = handle(container, 'bottom')
    touch('pointerDown', grip, { clientY: 120 })
    touch('pointerMove', grip, { clientY: 150 }) // the end moves from 10:00 to 10:30
    touch('pointerUp', grip, { clientY: 150 })
    await flush()
    expect(mocks.scheduleTask).toHaveBeenCalledTimes(1)
    expect(mocks.scheduleTask).toHaveBeenCalledWith('t1', {
      date: DAY,
      startMin: 9 * 60,
      durationMin: 90,
    })
  })

  it('drags the top grip, keeping the end where it was', async () => {
    const { container } = renderColumn()
    arm(container)
    const grip = handle(container, 'top')
    touch('pointerDown', grip, { clientY: 60 })
    touch('pointerMove', grip, { clientY: 30 }) // the start moves from 9:00 to 8:30
    touch('pointerUp', grip, { clientY: 30 })
    await flush()
    expect(mocks.scheduleTask).toHaveBeenCalledWith('t1', {
      date: DAY,
      startMin: 8 * 60 + 30,
      durationMin: 90,
    })
  })

  it('never goes below fifteen minutes', async () => {
    const { container } = renderColumn()
    arm(container)
    const grip = handle(container, 'bottom')
    touch('pointerDown', grip, { clientY: 120 })
    touch('pointerMove', grip, { clientY: 0 })
    touch('pointerUp', grip, { clientY: 0 })
    await flush()
    expect(mocks.scheduleTask).toHaveBeenCalledWith('t1', {
      date: DAY,
      startMin: 9 * 60,
      durationMin: 15,
    })
  })

  it('writes nothing when the grip is let go where it was', async () => {
    const { container } = renderColumn()
    arm(container)
    const grip = handle(container, 'bottom')
    touch('pointerDown', grip, { clientY: 120 })
    touch('pointerUp', grip, { clientY: 120 })
    await flush()
    expect(mocks.scheduleTask).not.toHaveBeenCalled()
    expect(mocks.pushUndo).not.toHaveBeenCalled()
  })

  it('offers Undo that restores the old length', async () => {
    const { container } = renderColumn()
    arm(container)
    const grip = handle(container, 'bottom')
    touch('pointerDown', grip, { clientY: 120 })
    touch('pointerMove', grip, { clientY: 150 })
    touch('pointerUp', grip, { clientY: 150 })
    await flush()
    const [message, undo] = mocks.pushUndo.mock.calls[0]
    expect(message).toContain('Resized')
    mocks.scheduleTask.mockClear()
    await undo()
    expect(mocks.scheduleTask).toHaveBeenCalledWith('t1', {
      date: DAY,
      startMin: 9 * 60,
      durationMin: 60,
    })
  })
})

describe('putting a block back', () => {
  const armed = (container) => blocks(container)[0].classList.contains('block--armed')

  it('a tap on empty grid disarms it and does not also create a task', () => {
    const { container } = renderColumn()
    arm(container)
    touch('pointerDown', surface(container), { clientY: 300 })
    touch('pointerUp', surface(container), { clientY: 300 })
    expect(armed(container)).toBe(false)
    expect(onCreate).not.toHaveBeenCalled()

    // The very next tap on empty grid is an ordinary one again.
    act(() => {
      vi.advanceTimersByTime(10)
    })
    touch('pointerDown', surface(container), { clientY: 300 })
    touch('pointerUp', surface(container), { clientY: 300 })
    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('Escape disarms it', () => {
    const { container } = renderColumn()
    arm(container)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(armed(container)).toBe(false)
  })

  it('goes back to rest after six idle seconds', () => {
    const { container } = renderColumn()
    arm(container)
    act(() => {
      vi.advanceTimersByTime(5999)
    })
    expect(armed(container)).toBe(true)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(armed(container)).toBe(false)
  })

  it('a tap on the armed block opens its editor and disarms it', () => {
    const { container } = renderColumn()
    const block = arm(container)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    touch('pointerDown', block, { clientY: 100 })
    touch('pointerUp', block, { clientY: 100 })
    fireEvent.click(block)
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(armed(container)).toBe(false)
  })
})

describe('with a mouse', () => {
  it('resizes from the edge handle without arming, as before', async () => {
    const { container } = renderColumn([standup], { coarse: false })
    const grip = handle(container, 'bottom')
    mouse('pointerDown', grip, { clientY: 120 })
    mouse('pointerMove', grip, { clientY: 150 })
    mouse('pointerUp', grip, { clientY: 150 })
    await flush()
    expect(mocks.scheduleTask).toHaveBeenCalledWith('t1', {
      date: DAY,
      startMin: 9 * 60,
      durationMin: 90,
    })
    expect(mocks.pushUndo).toHaveBeenCalledTimes(1)
  })

  it('does not arm from a held press', () => {
    const { container } = renderColumn([standup], { coarse: false })
    const block = blocks(container)[0]
    mouse('pointerDown', block, { clientY: 100 })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(block.classList.contains('block--armed')).toBe(false)
  })

  it('offers Undo for a block dropped somewhere new', async () => {
    const { container } = renderColumn([standup], { coarse: false })
    const column = container.querySelector('.day-column')
    const payload = {
      id: 't1',
      grabOffsetMin: 0,
      title: 'Standup',
      recurring: false,
      from: { date: DAY, startMin: 9 * 60 },
    }
    drop(column, { clientY: 200, payload }) // 8:00 + 200m = 11:20 -> 11:15
    await flush()
    expect(mocks.scheduleTask).toHaveBeenCalledWith('t1', { date: DAY, startMin: 11 * 60 + 15 })
    const [message, undo] = mocks.pushUndo.mock.calls[0]
    expect(message).toContain('11:15 AM')
    mocks.scheduleTask.mockClear()
    await undo()
    expect(mocks.scheduleTask).toHaveBeenCalledWith('t1', { date: DAY, startMin: 9 * 60 })
  })

  it('offers no Undo for something that came from the inbox', async () => {
    const { container } = renderColumn([standup], { coarse: false })
    const column = container.querySelector('.day-column')
    drop(column, { clientY: 200, payload: { id: 'inbox-1', grabOffsetMin: 0 } })
    await flush()
    expect(mocks.scheduleTask).toHaveBeenCalledTimes(1)
    expect(mocks.pushUndo).not.toHaveBeenCalled()
  })
})

describe('the title card, in a column too narrow to print a title', () => {
  const worker = { ...standup, tagId: 'work' }
  const tap = (block) => {
    touch('pointerDown', block, { clientY: 100 })
    touch('pointerUp', block, { clientY: 100 })
    fireEvent.click(block)
  }
  const card = (container) => container.querySelector('.block-peek')

  it('says what the block is when it is tapped, instead of opening the editor', () => {
    const { container } = renderColumn([worker], { peekOnTouch: true })
    tap(blocks(container)[0])
    expect(onEdit).not.toHaveBeenCalled()
    expect(card(container)).toBeTruthy()
    expect(card(container).textContent).toContain('Standup')
    // The time, the length and the tag, which the bar does not print.
    expect(card(container).textContent).toContain('9:00 AM')
    expect(card(container).textContent).toContain('1h')
    expect(card(container).textContent).toContain('Work')
  })

  it('opens the editor from its Edit button, and goes away', () => {
    const { container } = renderColumn([worker], { peekOnTouch: true })
    tap(blocks(container)[0])
    fireEvent.click(card(container).querySelector('.primary-button'))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit.mock.calls[0][0].id).toBe('t1')
    expect(card(container)).toBeNull()
  })

  it('ticks the task off from the card', () => {
    const { container } = renderColumn([worker], { peekOnTouch: true })
    tap(blocks(container)[0])
    fireEvent.click(card(container).querySelector('.ghost-button'))
    expect(mocks.toggleDone).toHaveBeenCalledWith('t1')
    expect(card(container)).toBeNull()
  })

  it('closes on Escape, on its close button, and on a tap elsewhere - which creates nothing', () => {
    const { container } = renderColumn([worker], { peekOnTouch: true })
    tap(blocks(container)[0])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(card(container)).toBeNull()

    tap(blocks(container)[0])
    fireEvent.click(card(container).querySelector('[aria-label="Close"]'))
    expect(card(container)).toBeNull()

    tap(blocks(container)[0])
    touch('pointerDown', surface(container), { clientY: 300 })
    touch('pointerUp', surface(container), { clientY: 300 })
    expect(card(container)).toBeNull()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('is not used for a block that is armed, which goes straight to its editor', () => {
    const { container } = renderColumn([worker], { peekOnTouch: true })
    arm(container)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    tap(blocks(container)[0])
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(card(container)).toBeNull()
  })

  it('is not used where the column prints its titles', () => {
    const { container } = renderColumn([worker], { peekOnTouch: false })
    tap(blocks(container)[0])
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(card(container)).toBeNull()
  })

  it('is not used with a mouse, which has a tooltip and a click', () => {
    const { container } = renderColumn([worker], { coarse: false, peekOnTouch: true })
    fireEvent.click(blocks(container)[0])
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(card(container)).toBeNull()
  })
})
