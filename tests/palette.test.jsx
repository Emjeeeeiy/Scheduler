/* DOM behaviour for the command palette's search half — added when the
 * palette became the app's global search too. The filtering itself is pure,
 * but the parts worth proving are not: that results only appear once the
 * query is worth acting on, that they sort after the fixed commands rather
 * than among them, and that arrowing down crosses from one group into the
 * other as a single list.
 */
import { render, fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CommandPalette } from '../src/components/shell/CommandPalette.jsx'

const ACTIONS = [
  { id: 'view-week', label: 'Go to Week', onRun: vi.fn() },
  { id: 'new-task', label: 'New task', onRun: vi.fn() },
]

/** Stands in for App.jsx's own searchItems: the same "two characters before
    anything matches" rule, over a fixed pair of items. */
const searchItems = (query) => {
  const needle = query.trim().toLowerCase()
  if (needle.length < 2) return []
  return [
    { id: 'search-task-1', label: 'Weekly review', onRun: vi.fn() },
    { id: 'search-task-2', label: 'Weekend plans', onRun: vi.fn() },
  ].filter((item) => item.label.toLowerCase().includes(needle))
}

const type = (value) =>
  fireEvent.change(screen.getByLabelText('Command palette search'), { target: { value } })

describe('CommandPalette search', () => {
  it('shows only commands until the query is worth acting on', () => {
    render(<CommandPalette onClose={vi.fn()} actions={ACTIONS} searchItems={searchItems} />)
    type('w')
    expect(screen.getByText('Go to Week')).toBeTruthy()
    expect(screen.queryByText('Weekly review')).toBeNull()
    expect(screen.queryByText('Your items')).toBeNull()
  })

  it('appends matching items under a heading once the query is long enough', () => {
    render(<CommandPalette onClose={vi.fn()} actions={ACTIONS} searchItems={searchItems} />)
    type('week')
    expect(screen.getByText('Your items')).toBeTruthy()
    expect(screen.getByText('Weekly review')).toBeTruthy()
    expect(screen.getByText('Weekend plans')).toBeTruthy()
  })

  it('puts commands ahead of results, not interleaved with them', () => {
    const { container } = render(
      <CommandPalette onClose={vi.fn()} actions={ACTIONS} searchItems={searchItems} />,
    )
    type('week')
    const labels = [...container.querySelectorAll('.palette__item-label')].map((n) => n.textContent)
    expect(labels.indexOf('Go to Week')).toBeLessThan(labels.indexOf('Weekly review'))
  })

  it('reads the heading as "Matching items" when no command matches', () => {
    render(<CommandPalette onClose={vi.fn()} actions={ACTIONS} searchItems={searchItems} />)
    type('weekend')
    expect(screen.getByText('Matching items')).toBeTruthy()
    expect(screen.queryByText('Go to Week')).toBeNull()
  })

  it('arrows from the commands into the results as one list', () => {
    render(<CommandPalette onClose={vi.fn()} actions={ACTIONS} searchItems={searchItems} />)
    type('week')
    const input = screen.getByLabelText('Command palette search')
    // One command matches "week", so the second press lands on the first result.
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getByText('Weekly review').closest('button').getAttribute('aria-selected')).toBe(
      'true',
    )
  })

  it('runs the selected result on Enter and closes', () => {
    const onClose = vi.fn()
    const onRun = vi.fn()
    render(
      <CommandPalette
        onClose={onClose}
        actions={[]}
        searchItems={() => [{ id: 'only', label: 'Weekly review', onRun }]}
      />,
    )
    type('week')
    fireEvent.keyDown(screen.getByLabelText('Command palette search'), { key: 'Enter' })
    expect(onRun).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('works with no searchItems at all, as a plain command list', () => {
    render(<CommandPalette onClose={vi.fn()} actions={ACTIONS} />)
    type('new')
    expect(screen.getByText('New task')).toBeTruthy()
    expect(screen.queryByText('Your items')).toBeNull()
  })
})
