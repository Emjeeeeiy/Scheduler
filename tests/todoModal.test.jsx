/* TodoModal replaced the standalone To-do page: same undated task pool the
 * Day view's Inbox reads (see ScheduleContext's `inbox`), same
 * check-stays-checked-until-deleted behaviour, now reachable as a modal from
 * the sidebar instead of a full view. The things worth watching run rather
 * than just reading:
 * - Adding trims the title and calls addTask with no date (inbox-bound).
 * - Checking a task off calls toggleDone WITHOUT closing the modal or
 *   opening its editor — a different gesture from clicking the row.
 * - A checked-off item stays in the list, struck through, until deleted.
 * - Clicking a row, or "Add with details…", closes the modal first —
 *   this app never stacks two dialogs (see useModalA11y's single focus
 *   trap), so opening the task editor has to mean closing this one.
 * - Deleting calls the same soft-delete + undo-toast pattern ItemManager
 *   uses, not a hard delete, and does not close the modal.
 *
 * ScheduleContext/ToastContext are mocked rather than provided for real —
 * a real ScheduleContext needs Firebase, and this file has nothing to prove
 * about Firestore beyond which functions get called with what.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TodoModal } from '../src/components/calendar/TodoModal.jsx'

let mockInbox = []

const addTask = vi.fn(async () => {})
const toggleDone = vi.fn()
const removeTask = vi.fn(async () => {})
const restoreItem = vi.fn(async () => {})
const pushError = vi.fn()
const pushUndo = vi.fn()
const onClose = vi.fn()
const onEdit = vi.fn()
const onCreate = vi.fn()

vi.mock('../src/state/ScheduleContext.jsx', () => ({
  useSchedule: () => ({
    get inbox() {
      return mockInbox
    },
    addTask,
    toggleDone,
    removeTask,
    restoreItem,
    getTag: () => null,
  }),
}))

vi.mock('../src/state/ToastContext.jsx', () => ({
  useToast: () => ({ pushError, pushUndo, pushSuccess: vi.fn(), dismiss: vi.fn() }),
}))

beforeEach(() => {
  mockInbox = [
    { id: 't-open', title: 'Drink water', tagId: null, done: false },
    { id: 't-done', title: 'Call Mom', tagId: null, done: true },
  ]
  addTask.mockClear()
  toggleDone.mockClear()
  removeTask.mockClear()
  restoreItem.mockClear()
  pushError.mockClear()
  pushUndo.mockClear()
  onClose.mockClear()
  onEdit.mockClear()
  onCreate.mockClear()
})

describe('TodoModal', () => {
  it('shows open and done items together, done ones struck through', () => {
    render(<TodoModal onClose={onClose} onEdit={onEdit} onCreate={onCreate} />)
    expect(screen.getByText('Drink water')).toBeTruthy()
    const doneItem = screen.getByText('Call Mom')
    expect(doneItem.closest('li').className).toContain('inbox-item--done')
  })

  it('adds a trimmed title with no date on submit', () => {
    render(<TodoModal onClose={onClose} onEdit={onEdit} onCreate={onCreate} />)
    const input = screen.getByLabelText('New to-do')
    fireEvent.change(input, { target: { value: '  Read a chapter  ' } })
    fireEvent.submit(input.closest('form'))
    expect(addTask).toHaveBeenCalledWith({ title: 'Read a chapter' })
    expect(input.value).toBe('')
  })

  it('checking a task off toggles done without closing or opening the editor', () => {
    render(<TodoModal onClose={onClose} onEdit={onEdit} onCreate={onCreate} />)
    fireEvent.click(screen.getByLabelText('Mark "Drink water" done'))
    expect(toggleDone).toHaveBeenCalledWith('t-open')
    expect(onEdit).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('clicking a row closes the modal and opens its editor', () => {
    render(<TodoModal onClose={onClose} onEdit={onEdit} onCreate={onCreate} />)
    fireEvent.click(screen.getByText('Drink water'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 't-open' }))
  })

  it('"Add with details…" closes the modal and opens the create form', () => {
    render(<TodoModal onClose={onClose} onEdit={onEdit} onCreate={onCreate} />)
    fireEvent.click(screen.getByText('Add with details…'))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onCreate).toHaveBeenCalledWith({})
  })

  it('deleting soft-deletes, offers undo, and leaves the modal open', async () => {
    render(<TodoModal onClose={onClose} onEdit={onEdit} onCreate={onCreate} />)
    fireEvent.click(screen.getByLabelText('Delete "Drink water"'))
    await waitFor(() => expect(removeTask).toHaveBeenCalledWith('t-open'))
    expect(pushUndo).toHaveBeenCalledWith(expect.stringContaining('Drink water'), expect.any(Function))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Escape closes the modal', () => {
    render(<TodoModal onClose={onClose} onEdit={onEdit} onCreate={onCreate} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
