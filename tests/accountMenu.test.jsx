/* The account button and its menu. The button carries the avatar and the name —
 * the name is only drawn where the stylesheet has room for it (the desktop's
 * top-right cluster), but it is always in the button, so clicking it opens the
 * menu — and the menu's Account entry now goes to the Account section of
 * Settings instead of opening a dialog.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  user: null,
  profile: null,
  signOut: vi.fn(),
}))

vi.mock('../src/state/AuthContext.jsx', () => ({
  useAuth: () => ({ user: h.user, signOut: h.signOut }),
}))
vi.mock('../src/state/ScheduleContext.jsx', () => ({
  useSchedule: () => ({ profile: h.profile }),
}))

import { AccountMenu } from '../src/components/shell/AccountMenu.jsx'

const handlers = () => ({
  onNewTask: vi.fn(),
  onOpenTodo: vi.fn(),
  onOpenItems: vi.fn(),
  onOpenSettings: vi.fn(),
  onOpenAccount: vi.fn(),
})

beforeEach(() => {
  h.user = { displayName: 'Sam Rivera', email: 'sam@example.com', photoURL: null }
  h.profile = null
  h.signOut.mockReset()
})
afterEach(cleanup)

describe('the button', () => {
  it('is named for the person, and shows their first initial and their name', () => {
    const { container } = render(<AccountMenu {...handlers()} />)
    const button = screen.getByRole('button', { name: 'Account menu for Sam Rivera' })
    expect(button.querySelector('.avatar').textContent).toBe('S')
    expect(button.querySelector('.account__name').textContent).toBe('Sam Rivera')
    expect(button.getAttribute('title')).toBe('Sam Rivera')
    expect(container.querySelectorAll('.account__trigger')).toHaveLength(1)
  })

  it('falls back to the email, and then to "Signed in"', () => {
    h.user = { displayName: '  ', email: 'sam@example.com' }
    const { unmount } = render(<AccountMenu {...handlers()} />)
    expect(screen.getByRole('button', { name: 'Account menu for sam@example.com' }).querySelector('.account__name').textContent).toBe('sam@example.com')
    unmount()

    h.user = {}
    render(<AccountMenu {...handlers()} />)
    expect(screen.getByRole('button', { name: 'Account menu for Signed in' })).toBeTruthy()
  })

  it('shows the uploaded photo, or the sign-in provider\'s, in place of the initial', () => {
    h.profile = { photoBase64: 'data:image/jpeg;base64,AAAA' }
    const { container, unmount } = render(<AccountMenu {...handlers()} />)
    expect(container.querySelector('.avatar img').getAttribute('src')).toBe('data:image/jpeg;base64,AAAA')
    unmount()

    h.profile = null
    h.user = { displayName: 'Sam', photoURL: 'https://example.test/sam.png' }
    const second = render(<AccountMenu {...handlers()} />)
    expect(second.container.querySelector('.avatar img').getAttribute('src')).toBe('https://example.test/sam.png')
  })

  it('opens the menu when the name is clicked, not only the avatar', () => {
    const { container } = render(<AccountMenu {...handlers()} />)
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(container.querySelector('.account__name'))
    expect(screen.getByRole('menu', { name: 'Account' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Account menu/ }).getAttribute('aria-expanded')).toBe('true')
  })

  it('closes the menu when the button is clicked again', () => {
    render(<AccountMenu {...handlers()} />)
    const button = screen.getByRole('button', { name: /Account menu/ })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('the menu', () => {
  const open = () => fireEvent.click(screen.getByRole('button', { name: /Account menu/ }))

  it('Account goes to the Account section of Settings, and closes the menu', () => {
    const on = handlers()
    render(<AccountMenu {...on} />)
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Account' }))
    expect(on.onOpenAccount).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('opens no dialog of its own any more', () => {
    render(<AccountMenu {...handlers()} />)
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Account' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Log out signs out', () => {
    render(<AccountMenu {...handlers()} />)
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Log out' }))
    expect(h.signOut).toHaveBeenCalledTimes(1)
  })

  it('carries the phone\'s extra entries — and no Tags, which is a Settings category now', () => {
    const on = handlers()
    render(<AccountMenu {...on} />)
    open()
    const labels = screen.getAllByRole('menuitem').map((el) => el.textContent)
    expect(labels).toEqual(['New task', 'To-do', 'All items', 'Settings', 'Account', 'Log out'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }))
    expect(on.onOpenSettings).toHaveBeenCalledTimes(1)
  })
})
