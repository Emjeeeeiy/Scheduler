/* The Tags section of Settings — what used to be the Tag manager dialog. The
 * behaviour is the old dialog's, so these pin it down in its new home: adding
 * (once, however fast), renaming in place, the per-tag editor, and deleting with
 * an Undo that puts the tag back.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TAG_ICONS, TAG_SLOTS } from '@cadence/shared/normalize.js'

const h = vi.hoisted(() => ({
  tags: [],
  tasks: [],
  addTag: vi.fn(),
  updateTag: vi.fn(),
  removeTag: vi.fn(),
  importData: vi.fn(),
  pushError: vi.fn(),
  pushUndo: vi.fn(),
}))

vi.mock('../src/state/ToastContext.jsx', () => ({
  useToast: () => ({ pushError: h.pushError, pushUndo: h.pushUndo }),
}))
vi.mock('../src/state/ScheduleContext.jsx', async () => {
  const { TAG_ICONS: icons, TAG_SLOTS: slots } = await import('@cadence/shared/normalize.js')
  return {
    TAG_ICONS: icons,
    TAG_SLOTS: slots,
    useSchedule: () => ({
      tags: h.tags,
      tasks: h.tasks,
      addTag: h.addTag,
      updateTag: h.updateTag,
      removeTag: h.removeTag,
      importData: h.importData,
    }),
  }
})

import { TagsSection } from '../src/components/settings/TagsSection.jsx'

const tag = (id, name, extra = {}) => ({
  id,
  name,
  slot: TAG_SLOTS[0],
  color: `var(--color-tag-${TAG_SLOTS[0]})`,
  icon: null,
  parentId: null,
  depth: 0,
  goalMinutes: null,
  ...extra,
})

beforeEach(() => {
  for (const fn of [h.addTag, h.updateTag, h.removeTag, h.importData, h.pushError, h.pushUndo]) fn.mockReset()
  h.addTag.mockResolvedValue(undefined)
  h.removeTag.mockResolvedValue(undefined)
  h.importData.mockResolvedValue({ count: 1, skippedNotes: 0 })
  h.tags = []
  h.tasks = []
})

describe('the list', () => {
  it('says so when there are no tags', () => {
    render(<TagsSection />)
    expect(screen.getByText('No tags yet. Add one below.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'New tag' })).toBeTruthy()
  })

  it('lists every tag with how many tasks use it', () => {
    h.tags = [tag('a', 'Work'), tag('b', 'Home', { slot: TAG_SLOTS[1] })]
    h.tasks = [{ tagId: 'a' }, { tagId: 'a' }, { tagId: 'b' }, { tagId: null }]
    render(<TagsSection />)
    expect(screen.getByRole('textbox', { name: 'Rename Work' }).value).toBe('Work')
    expect(screen.getByRole('textbox', { name: 'Rename Home' }).value).toBe('Home')
    // A short sentence, not a bare number the row's hint had to explain.
    expect(screen.getByText('2 tasks')).toBeTruthy()
    expect(screen.getByText('1 task')).toBeTruthy()
  })

  it('does not need a paragraph to say what the count is, or how the next colour is picked', () => {
    render(<TagsSection />)
    expect(screen.queryByText(/The number is how many/)).toBeNull()
    expect(screen.queryByText(/palette's own order/)).toBeNull()
  })

  it('renames a tag in place', () => {
    h.tags = [tag('a', 'Work')]
    render(<TagsSection />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Rename Work' }), { target: { value: 'Office' } })
    expect(h.updateTag).toHaveBeenCalledWith('a', { name: 'Office' })
  })

  it('indents a nested tag by its depth', () => {
    h.tags = [tag('a', 'Work'), tag('b', 'Meetings', { parentId: 'a', depth: 1 })]
    const { container } = render(<TagsSection />)
    const rows = container.querySelectorAll('.tag-list__group')
    expect(rows[0].style.paddingLeft).toBe('')
    expect(rows[1].style.paddingLeft).toBe('18px')
  })
})

describe('adding a tag', () => {
  const add = (value) => {
    fireEvent.change(screen.getByRole('textbox', { name: 'New tag name' }), { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
  }

  it('files a trimmed name under the next unused colour, and clears the field', async () => {
    h.tags = [tag('a', 'Work', { slot: TAG_SLOTS[0] })]
    render(<TagsSection />)
    await act(async () => add('  Reading  '))
    expect(h.addTag).toHaveBeenCalledWith({ name: 'Reading', slot: TAG_SLOTS[1], icon: null })
    expect(screen.getByRole('textbox', { name: 'New tag name' }).value).toBe('')
  })

  it('uses the colour and icon that were picked', async () => {
    render(<TagsSection />)
    const colours = within(screen.getByRole('group', { name: 'Colour for the new tag' }))
    fireEvent.click(colours.getByRole('button', { name: TAG_SLOTS[3] }))
    const icons = within(screen.getByRole('group', { name: 'Icon for the new tag' }))
    fireEvent.click(icons.getByRole('button', { name: TAG_ICONS[2] }))
    await act(async () => add('Gym'))
    expect(h.addTag).toHaveBeenCalledWith({ name: 'Gym', slot: TAG_SLOTS[3], icon: TAG_ICONS[2] })
  })

  it('ignores an empty name', async () => {
    render(<TagsSection />)
    await act(async () => add('   '))
    expect(h.addTag).not.toHaveBeenCalled()
  })

  it('files a tag once, however fast Add is pressed', async () => {
    let finish
    h.addTag.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    render(<TagsSection />)
    fireEvent.change(screen.getByRole('textbox', { name: 'New tag name' }), { target: { value: 'Once' } })
    const button = screen.getByRole('button', { name: 'Add' })
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.submit(button.closest('form'))
    await act(async () => finish())
    expect(h.addTag).toHaveBeenCalledTimes(1)
  })

  it('says so, and gives the name back, when it could not be saved', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.addTag.mockRejectedValue(new Error('offline'))
    render(<TagsSection />)
    await act(async () => add('Lost'))
    expect(h.pushError).toHaveBeenCalledWith('Could not add the tag. Try again.')
    expect(screen.getByRole('textbox', { name: 'New tag name' }).value).toBe('Lost')
  })
})

describe('editing a tag', () => {
  beforeEach(() => {
    h.tags = [tag('a', 'Work'), tag('b', 'Meetings', { parentId: 'a', depth: 1 }), tag('c', 'Home', { goalMinutes: 180 })]
  })

  const open = (name) => {
    const row = screen.getByRole('textbox', { name: `Rename ${name}` }).closest('.tag-list__group')
    fireEvent.click(within(row).getByRole('button', { name: 'Edit' }))
    return row
  }

  it('opens its colour, icon and options, and closes again', () => {
    render(<TagsSection />)
    const row = open('Work')
    expect(within(row).getByRole('group', { name: 'Colour for Work' })).toBeTruthy()
    expect(within(row).getByRole('group', { name: 'Icon for Work' })).toBeTruthy()
    expect(within(row).getByRole('group', { name: 'Options for Work' })).toBeTruthy()
    fireEvent.click(within(row).getByRole('button', { name: 'Close' }))
    expect(within(row).queryByRole('group', { name: 'Colour for Work' })).toBeNull()
  })

  it('changes the colour and the icon', () => {
    render(<TagsSection />)
    const row = open('Work')
    fireEvent.click(within(within(row).getByRole('group', { name: 'Colour for Work' })).getByRole('button', { name: TAG_SLOTS[2] }))
    expect(h.updateTag).toHaveBeenCalledWith('a', { slot: TAG_SLOTS[2] })
    fireEvent.click(within(within(row).getByRole('group', { name: 'Icon for Work' })).getByRole('button', { name: TAG_ICONS[0] }))
    expect(h.updateTag).toHaveBeenCalledWith('a', { icon: TAG_ICONS[0] })
  })

  it('sets a weekly goal in whole hours, and clears it', () => {
    render(<TagsSection />)
    fireEvent.change(within(open('Work')).getByRole('spinbutton'), { target: { value: '6' } })
    expect(h.updateTag).toHaveBeenCalledWith('a', { goalMinutes: 360 })
    // Home already has a 3-hour goal; emptying the field removes it (null, not 0).
    const goal = within(open('Home')).getByRole('spinbutton')
    expect(goal.value).toBe('3')
    fireEvent.change(goal, { target: { value: '' } })
    expect(h.updateTag).toHaveBeenCalledWith('c', { goalMinutes: null })
  })

  it('never offers a tag as its own parent, or a parent beneath itself', () => {
    render(<TagsSection />)
    const row = open('Work')
    const options = [...within(row).getByRole('combobox').querySelectorAll('option')].map((o) => o.textContent.replace(/^[—\s]+/, ''))
    // Work cannot go under Work, nor under Meetings (which is already under it).
    expect(options).toEqual(['Top level', 'Home'])
  })

  it('nests a tag under another', () => {
    render(<TagsSection />)
    const row = open('Home')
    fireEvent.change(within(row).getByRole('combobox'), { target: { value: 'a' } })
    expect(h.updateTag).toHaveBeenCalledWith('c', { parentId: 'a' })
  })
})

describe('deleting a tag', () => {
  beforeEach(() => {
    h.tags = [tag('a', 'Work'), tag('b', 'Home')]
  })

  it('asks first, and says the tasks are kept', () => {
    render(<TagsSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Work' }))
    expect(screen.getByText(/keeps its tasks — they simply become untagged/)).toBeTruthy()
    expect(h.removeTag).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(h.removeTag).not.toHaveBeenCalled()
  })

  it('removes it and offers Undo, which puts the very same tag back', async () => {
    render(<TagsSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Work' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete' })))
    expect(h.removeTag).toHaveBeenCalledWith('a')
    expect(h.pushUndo).toHaveBeenCalledTimes(1)
    const [message, undo] = h.pushUndo.mock.calls[0]
    expect(message).toBe('Deleted "Work".')
    await act(async () => undo())
    expect(h.importData).toHaveBeenCalledWith({ tags: [expect.objectContaining({ id: 'a', name: 'Work' })] })
  })

  it('reports a delete that failed, and offers no Undo for it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.removeTag.mockRejectedValue(new Error('nope'))
    render(<TagsSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Work' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete' })))
    expect(h.pushError).toHaveBeenCalledWith('Could not delete the tag. Try again.')
    expect(h.pushUndo).not.toHaveBeenCalled()
  })
})
