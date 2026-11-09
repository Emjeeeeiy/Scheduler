/* The All items index: one modal listing every task and event, for finding
 * something or clearing things out. What is worth pinning is the layout's
 * promises, not just the data:
 * - one toolbar (search, kind chips with the Trash set apart, tag and date) and
 *   no "Any date" chip that is only the cleared state of the ones beside it;
 * - a row *is* the way in — pressing it opens the item — so there is no Edit
 *   button on every row, and delete is a trash icon, not a second "×";
 * - one leading slot: a task's checkbox, an event's icon;
 * - the bulk delete lives in the foot and its question replaces it in place,
 *   rather than a banner shoving the list down; the repeating-delete warning sits
 *   under the row it is about, not in a paragraph at the foot;
 * - the Trash is a place: Restore, delete for good, Empty trash, each asking first.
 *
 * ScheduleContext / ToastContext are mocked rather than provided — a real
 * ScheduleContext needs Firebase, and this file has nothing to prove about
 * Firestore beyond which functions get called with what.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, todayKey } from '@cadence/shared/date.js'

const TODAY = todayKey()
const YESTERDAY = addDays(TODAY, -1)

const h = vi.hoisted(() => ({
  tasks: [],
  events: [],
  tags: [],
  trashedTasks: [],
  trashedEvents: [],
  removeTask: vi.fn(async () => {}),
  removeEvent: vi.fn(async () => {}),
  removeAllItems: vi.fn(async () => {}),
  restoreItem: vi.fn(async () => {}),
  purgeItem: vi.fn(async () => {}),
  emptyTrash: vi.fn(async () => 2),
  toggleDone: vi.fn(),
  pushError: vi.fn(),
  pushSuccess: vi.fn(),
  pushUndo: vi.fn(),
}))

vi.mock('../src/state/ScheduleContext.jsx', () => ({
  useSchedule: () => ({
    tasks: h.tasks,
    events: h.events,
    tags: h.tags,
    getTag: (id) => h.tags.find((tag) => tag.id === id) ?? null,
    trashedTasks: h.trashedTasks,
    trashedEvents: h.trashedEvents,
    removeTask: h.removeTask,
    removeEvent: h.removeEvent,
    removeAllItems: h.removeAllItems,
    restoreItem: h.restoreItem,
    purgeItem: h.purgeItem,
    emptyTrash: h.emptyTrash,
    toggleDone: h.toggleDone,
  }),
}))
vi.mock('../src/state/ToastContext.jsx', () => ({
  useToast: () => ({ pushError: h.pushError, pushSuccess: h.pushSuccess, pushUndo: h.pushUndo }),
}))

import { ItemManager } from '../src/components/editors/ItemManager.jsx'

const task = (id, title, patch = {}) => ({
  id,
  title,
  tagId: null,
  done: false,
  createdAt: 1,
  date: null,
  startMin: null,
  recurrence: null,
  ...patch,
})
const event = (id, title, patch = {}) => ({
  id,
  title,
  tagId: null,
  createdAt: 1,
  startDate: TODAY,
  endDate: TODAY,
  startMin: null,
  recurrence: null,
  ...patch,
})
const tag = (id, name) => ({ id, name, slot: 'blue', color: 'var(--color-tag-blue)', icon: null })

const onClose = vi.fn()
const onEdit = vi.fn()
const onEditEvent = vi.fn()

beforeEach(() => {
  h.tags = [tag('work', 'Work'), tag('home', 'Home')]
  h.tasks = [
    task('t1', 'Write report', { tagId: 'work', createdAt: 50, date: TODAY, startMin: 570 }),
    task('t2', 'Pay rent', { done: true, createdAt: 40, date: YESTERDAY }),
    // Every day, from a week ago: a rule, listed once, that lands on any date asked about.
    task('t3', 'Standing sync', {
      tagId: 'work',
      createdAt: 30,
      startMin: 540,
      recurrence: { days: [0, 1, 2, 3, 4, 5, 6], anchor: addDays(TODAY, -7) },
    }),
  ]
  h.events = [event('e1', 'Offsite', { tagId: 'work', createdAt: 60, endDate: addDays(TODAY, 2) })]
  h.trashedTasks = [task('d1', 'Old draft', { createdAt: 5 })]
  h.trashedEvents = [event('de1', 'Cancelled meetup', { createdAt: 4, startDate: YESTERDAY, endDate: YESTERDAY })]
  for (const fn of [h.removeTask, h.removeEvent, h.removeAllItems, h.restoreItem, h.purgeItem, h.emptyTrash, h.toggleDone, h.pushError, h.pushSuccess, h.pushUndo, onClose, onEdit, onEditEvent]) fn.mockClear()
})

const open = () => render(<ItemManager onClose={onClose} onEdit={onEdit} onEditEvent={onEditEvent} />)
const titles = (container) => [...container.querySelectorAll('.item-list__title')].map((el) => el.textContent)
const chip = (name) => screen.getByRole('button', { name })
const rowOf = (title) => screen.getByText(title).closest('.item-list__row')

describe('the dialog', () => {
  it('is one dialog named All items, with only a title and Close in its head', () => {
    const { container } = open()
    expect(screen.getByRole('dialog', { name: 'All items' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'All items' })).toBeTruthy()
    const head = container.querySelector('.modal__head')
    expect(within(head).getAllByRole('button').map((el) => el.getAttribute('aria-label'))).toEqual(['Close'])
  })

  it('closes from Close and from the backdrop', () => {
    const { container } = open()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.mouseDown(container.querySelector('.modal'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('asks for the sheet layout, which is what makes it full screen on a phone', () => {
    const { container } = open()
    expect(container.querySelector('.modal.modal--sheet > .modal__panel.item-manager')).toBeTruthy()
  })
})

describe('the toolbar', () => {
  it('lists every task and event, newest first, and says how many of each in the chips', () => {
    const { container } = open()
    expect(titles(container)).toEqual(['Offsite', 'Write report', 'Pay rent', 'Standing sync'])
    for (const name of ['All 4', 'Tasks 3', 'Events 1', 'Trash 2']) expect(chip(name)).toBeTruthy()
    expect(chip('All 4').getAttribute('aria-pressed')).toBe('true')
  })

  it('narrows by kind', () => {
    const { container } = open()
    fireEvent.click(chip('Events 1'))
    expect(titles(container)).toEqual(['Offsite'])
    fireEvent.click(chip('Tasks 3'))
    expect(titles(container)).toEqual(['Write report', 'Pay rent', 'Standing sync'])
  })

  it('searches by title, and says so when nothing matches', () => {
    const { container } = open()
    fireEvent.change(screen.getByRole('textbox', { name: 'Search items by title' }), { target: { value: 'RENT' } })
    expect(titles(container)).toEqual(['Pay rent'])
    fireEvent.change(screen.getByRole('textbox', { name: 'Search items by title' }), { target: { value: 'zzz' } })
    expect(screen.getByText('No items match that.')).toBeTruthy()
  })

  it('narrows by tag', () => {
    const { container } = open()
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by tag' }), { target: { value: 'work' } })
    expect(titles(container)).toEqual(['Offsite', 'Write report', 'Standing sync'])
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by tag' }), { target: { value: 'none' } })
    expect(titles(container)).toEqual(['Pay rent'])
  })

  it('has no "Any date" chip: Today and Yesterday switch off when pressed again', () => {
    const { container } = open()
    expect(screen.queryByRole('button', { name: 'Any date' })).toBeNull()

    fireEvent.click(chip('Today'))
    expect(chip('Today').getAttribute('aria-pressed')).toBe('true')
    // The event runs across today; the rule lands on it; yesterday's task does not.
    expect(titles(container)).toEqual(['Offsite', 'Write report', 'Standing sync'])
    fireEvent.click(chip('Today'))
    expect(chip('Today').getAttribute('aria-pressed')).toBe('false')
    expect(titles(container)).toHaveLength(4)

    fireEvent.click(chip('Yesterday'))
    expect(titles(container)).toEqual(['Pay rent', 'Standing sync'])
    fireEvent.click(chip('Yesterday'))
    expect(titles(container)).toHaveLength(4)
  })

  it('clears a specific date with its own button, shown only while one is set', () => {
    const { container } = open()
    expect(screen.queryByRole('button', { name: 'Clear the date filter' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Filter by a specific date'), { target: { value: YESTERDAY } })
    expect(titles(container)).toEqual(['Pay rent', 'Standing sync'])
    fireEvent.click(screen.getByRole('button', { name: 'Clear the date filter' }))
    expect(titles(container)).toHaveLength(4)
    expect(screen.queryByRole('button', { name: 'Clear the date filter' })).toBeNull()
  })
})

describe('a row', () => {
  it('opens its item when pressed — a task, and an event — with no Edit button on any row', () => {
    open()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    fireEvent.click(screen.getByText('Write report').closest('button'))
    expect(onEdit).toHaveBeenCalledWith(h.tasks[0])
    fireEvent.click(screen.getByText('Offsite').closest('button'))
    expect(onEditEvent).toHaveBeenCalledWith(h.events[0])
  })

  it('has one leading slot: a task its checkbox, an event its icon', () => {
    open()
    expect(within(rowOf('Write report')).getByRole('checkbox', { name: 'Mark "Write report" done' })).toBeTruthy()
    expect(within(rowOf('Offsite')).queryByRole('checkbox')).toBeNull()
    expect(within(rowOf('Offsite')).getByLabelText('Event')).toBeTruthy()
  })

  it('ticks a task off without opening its editor, and cannot tick a repeating one', () => {
    open()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark "Write report" done' }))
    expect(h.toggleDone).toHaveBeenCalledWith('t1')
    expect(onEdit).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: 'Mark "Standing sync" done' }).disabled).toBe(true)
  })

  it('shows a repeating item once, as its rule', () => {
    const { container } = open()
    expect(titles(container).filter((title) => title === 'Standing sync')).toHaveLength(1)
    expect(within(rowOf('Standing sync')).getByText(/Every day/)).toBeTruthy()
  })

  it('deletes with a trash icon, asks first, and offers Undo', async () => {
    open()
    const row = rowOf('Write report')
    // A trash icon, not a second "×" beside the dialog's own Close.
    expect(within(row).getByRole('button', { name: 'Delete Write report' }).title).toBe('Delete')
    fireEvent.click(within(row).getByRole('button', { name: 'Delete Write report' }))
    expect(h.removeTask).not.toHaveBeenCalled()
    fireEvent.click(within(row).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(h.removeTask).toHaveBeenCalledWith('t1'))
    expect(h.pushUndo).toHaveBeenCalledWith('Deleted "Write report".', expect.any(Function))
    await h.pushUndo.mock.calls[0][1]()
    expect(h.restoreItem).toHaveBeenCalledWith('task', 't1')
  })

  it('deletes an event through removeEvent', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Offsite' }))
    fireEvent.click(within(rowOf('Offsite')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(h.removeEvent).toHaveBeenCalledWith('e1'))
  })

  it('can change its mind', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Write report' }))
    fireEvent.click(within(rowOf('Write report')).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Delete Write report' })).toBeTruthy()
    expect(h.removeTask).not.toHaveBeenCalled()
  })

  it('warns that deleting a repeating item removes every occurrence — under that row, not at the foot', () => {
    const { container } = open()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Write report' }))
    expect(screen.queryByText(/rule behind a repeating/)).toBeNull()
    fireEvent.click(within(rowOf('Write report')).getByRole('button', { name: 'Cancel' }))

    fireEvent.click(screen.getByRole('button', { name: 'Delete Standing sync' }))
    const note = within(rowOf('Standing sync')).getByText(/rule behind a repeating task/)
    expect(note.closest('.item-manager__foot')).toBeNull()
    expect(container.querySelector('.item-manager__foot').textContent).not.toMatch(/rule behind/)
  })
})

describe('the foot', () => {
  it('holds the bulk delete — not the head — and says nothing else in the list', () => {
    const { container } = open()
    const foot = container.querySelector('.item-manager__foot')
    expect(within(foot).getByRole('button', { name: 'Delete all' })).toBeTruthy()
    expect(within(container.querySelector('.modal__head')).queryByRole('button', { name: 'Delete all' })).toBeNull()
    // The paragraph that explained what every row already shows is gone.
    expect(screen.queryByText(/appears once here, as the rule itself/)).toBeNull()
    expect(foot.querySelector('.field__hint')).toBeNull()
  })

  it('asks "Move all N items to the Trash?" in place of the button, with the list untouched', async () => {
    const { container } = open()
    fireEvent.click(screen.getByRole('button', { name: 'Delete all' }))
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Move all 4 items to the Trash?')
    // In the foot, below the list — nothing is inserted above it.
    expect(container.querySelector('.item-manager__foot').contains(alert)).toBe(true)
    expect(container.querySelector('.item-manager__toolbar').contains(alert)).toBe(false)
    expect(titles(container)).toHaveLength(4)
    expect(screen.queryByRole('button', { name: 'Empty trash' })).toBeNull()

    fireEvent.click(within(alert).getByRole('button', { name: 'Delete all' }))
    await waitFor(() => expect(h.removeAllItems).toHaveBeenCalledTimes(1))
    expect(h.pushUndo).toHaveBeenCalledWith('Deleted 4 items.', expect.any(Function))
  })

  it('can be cancelled, and says "1 item" for one', () => {
    h.tasks = [task('t1', 'Only one')]
    h.events = []
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Delete all' }))
    expect(screen.getByRole('alert').textContent).toContain('Move all 1 item to the Trash?')
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete all' })).toBeTruthy()
    expect(h.removeAllItems).not.toHaveBeenCalled()
  })

  it('is not there when there is nothing to delete', () => {
    h.tasks = []
    h.events = []
    const { container } = open()
    expect(screen.getByText('Nothing here yet.')).toBeTruthy()
    expect(container.querySelector('.item-manager__foot')).toBeNull()
  })
})

describe('the Trash', () => {
  const openTrash = () => {
    const view = open()
    fireEvent.click(chip('Trash 2'))
    return view
  }

  it('is a place at the end of the kind chips, listing what was deleted with a way back', () => {
    const { container } = openTrash()
    expect(titles(container)).toEqual(['Old draft', 'Cancelled meetup'])
    expect(container.querySelector('.item-manager__kinds').lastElementChild.textContent).toBe('Trash 2')
    expect(within(rowOf('Old draft')).getByRole('button', { name: 'Restore' })).toBeTruthy()
    // A deleted task cannot be ticked off, and a deleted item is not opened for editing.
    expect(within(rowOf('Old draft')).getByRole('checkbox').disabled).toBe(true)
    expect(screen.getByText('Old draft').closest('button')).toBeNull()
  })

  it('restores an item', async () => {
    openTrash()
    fireEvent.click(within(rowOf('Old draft')).getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(h.restoreItem).toHaveBeenCalledWith('task', 'd1'))
    fireEvent.click(within(rowOf('Cancelled meetup')).getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(h.restoreItem).toHaveBeenCalledWith('event', 'de1'))
  })

  it('deletes one for good only after asking', async () => {
    openTrash()
    fireEvent.click(screen.getByRole('button', { name: 'Permanently delete Old draft' }))
    expect(h.purgeItem).not.toHaveBeenCalled()
    fireEvent.click(within(rowOf('Old draft')).getByRole('button', { name: 'Delete for good' }))
    await waitFor(() => expect(h.purgeItem).toHaveBeenCalledWith('task', 'd1'))
  })

  it('says in one line how long things stay, with Empty trash in place of Delete all', () => {
    const { container } = openTrash()
    const foot = container.querySelector('.item-manager__foot')
    expect(within(foot).getByText('Deleted items stay here until you remove them for good.')).toBeTruthy()
    expect(within(foot).getByRole('button', { name: 'Empty trash' })).toBeTruthy()
    expect(within(foot).queryByRole('button', { name: 'Delete all' })).toBeNull()
    expect(screen.queryByText(/no expiry/)).toBeNull()
  })

  it('empties the Trash only after asking, and says how many went', async () => {
    const { container } = openTrash()
    fireEvent.click(screen.getByRole('button', { name: 'Empty trash' }))
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Permanently delete 2 items in the Trash? This cannot be undone.')
    expect(container.querySelector('.item-manager__foot').contains(alert)).toBe(true)
    expect(h.emptyTrash).not.toHaveBeenCalled()
    fireEvent.click(within(alert).getByRole('button', { name: 'Delete for good' }))
    await waitFor(() => expect(h.emptyTrash).toHaveBeenCalledTimes(1))
    expect(h.pushSuccess).toHaveBeenCalledWith('Deleted 2 items for good.')
  })

  it('says so when it is empty, with no foot', () => {
    h.trashedTasks = []
    h.trashedEvents = []
    const { container } = open()
    fireEvent.click(chip('Trash 0'))
    expect(screen.getByText('The Trash is empty.')).toBeTruthy()
    expect(container.querySelector('.item-manager__foot')).toBeNull()
  })
})
