/* The Settings page's own structure — the side navigation of categories, which
 * panel each one shows — and the one behaviour that depended on Settings being a
 * modal. As a dialog, App's window key listener was switched off while it was
 * open (`modalOpen`), so pressing a key to rebind a shortcut could not also *run*
 * that shortcut. As a page nothing switches it off, so the rebinding control has
 * to keep the key to itself — that is the last describe.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  updateSetting: vi.fn(),
  setTheme: vi.fn(),
  templates: [],
  install: { canInstall: false, installed: false },
}))

vi.mock('../src/lib/usePushNotifications.js', () => ({
  usePushNotifications: () => ({
    supported: false,
    permission: 'default',
    denied: false,
    subscribed: false,
    checking: false,
    busy: false,
    enable: vi.fn(),
    disable: vi.fn(),
  }),
}))
vi.mock('../src/state/ToastContext.jsx', () => ({
  useToast: () => ({ pushSuccess: vi.fn(), pushError: vi.fn(), pushWarning: vi.fn(), pushUndo: vi.fn() }),
}))
vi.mock('../src/state/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: { displayName: 'Sam', email: 'sam@example.com', providerData: [{ providerId: 'google.com' }] },
    reauthenticate: vi.fn(),
    deleteAccount: vi.fn(),
  }),
}))
vi.mock('../src/state/ScheduleContext.jsx', async (importOriginal) => {
  const mod = await importOriginal().catch(() => ({}))
  return {
    ...mod,
    TAG_SLOTS: ['blue', 'orange', 'aqua'],
    TAG_ICONS: [],
    useSchedule: () => ({
      loading: false,
      tasks: [],
      events: [],
      tags: [],
      templates: h.templates,
      importData: vi.fn(),
      exportJournal: vi.fn(),
      removeTemplate: vi.fn(),
      addTag: vi.fn(),
      updateTag: vi.fn(),
      removeTag: vi.fn(),
      profile: {},
      updateDigestPreference: vi.fn(),
      updateProfilePhoto: vi.fn(),
      removeProfilePhoto: vi.fn(),
      deleteAllData: vi.fn(),
    }),
  }
})
vi.mock('../src/state/SettingsContext.jsx', async (importOriginal) => {
  const mod = await importOriginal()
  return {
    ...mod,
    useSettings: () => ({
      settings: {
        weekStartsOn: 1,
        landingView: 'dashboard',
        notificationLeadMin: 60,
        workingHours: null,
        shortcuts: { newTask: 'n', newEvent: 'e', jumpToday: 't', prevDate: 'ArrowLeft', nextDate: 'ArrowRight' },
      },
      updateSetting: h.updateSetting,
    }),
  }
})
vi.mock('../src/lib/useInstallPrompt.js', () => ({
  useInstallPrompt: () => ({ ...h.install, promptInstall: vi.fn() }),
}))
vi.mock('../src/state/ThemeContext.jsx', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: h.setTheme }),
}))

import { SettingsView } from '../src/components/views/SettingsView.jsx'
import { SETTINGS_SECTIONS } from '../src/components/settings/sections.js'

beforeEach(() => {
  h.updateSetting.mockClear()
  h.setTheme.mockClear()
  h.templates = []
  h.install = { canInstall: false, installed: false }
})
afterEach(() => vi.restoreAllMocks())

const rowTitles = () => screen.getAllByRole('heading', { level: 4 }).map((el) => el.textContent)

describe('the page', () => {
  it('is titled, in a frame, and not a dialog', () => {
    const { container } = render(<SettingsView />)
    expect(screen.getByRole('heading', { level: 2, name: 'Settings' })).toBeTruthy()
    expect(container.querySelector('.frame.stack')).toBeTruthy()
    expect(container.querySelectorAll('.frame-tick')).toHaveLength(4)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lists the categories in a side navigation, in order', () => {
    render(<SettingsView />)
    const nav = screen.getByRole('navigation', { name: 'Settings sections' })
    const labels = within(nav).getAllByRole('button').map((el) => el.textContent)
    expect(labels).toEqual(['General', 'Appearance', 'Account', 'Tags', 'Notifications', 'Keyboard', 'Your data'])
    expect(labels).toEqual(SETTINGS_SECTIONS.map((section) => section.label))
  })

  it('opens on General and marks it as the current category', () => {
    render(<SettingsView />)
    const nav = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(within(nav).getByRole('button', { current: true }).textContent).toBe('General')
    expect(screen.getByRole('heading', { level: 3, name: 'General' })).toBeTruthy()
  })

  it('shows one category at a time, titled and described', () => {
    render(<SettingsView />)
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1)
    expect(screen.getByText(/Where Cadence opens/)).toBeTruthy()
    // Another category's controls are not on the page.
    expect(screen.queryByRole('group', { name: 'Theme' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Delete account/ })).toBeNull()
  })

  it('switches category from the navigation', () => {
    render(<SettingsView />)
    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }))
    expect(screen.getByRole('heading', { level: 3, name: 'Appearance' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Theme' })).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: 'Landing view' })).toBeNull()
    expect(within(screen.getByRole('navigation', { name: 'Settings sections' })).getByRole('button', { current: true }).textContent).toBe('Appearance')
  })

  it('can be controlled from outside, which is how the avatar menu and the palette land on a category', () => {
    const onSectionChange = vi.fn()
    const { rerender } = render(<SettingsView section="tags" onSectionChange={onSectionChange} />)
    expect(screen.getByRole('heading', { level: 3, name: 'Tags' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard' }))
    expect(onSectionChange).toHaveBeenCalledWith('keyboard')
    rerender(<SettingsView section="account" onSectionChange={onSectionChange} />)
    expect(screen.getByRole('heading', { level: 3, name: 'Account' })).toBeTruthy()
  })

  it('falls back to General for a section it does not know', () => {
    render(<SettingsView section="nonsense" />)
    expect(screen.getByRole('heading', { level: 3, name: 'General' })).toBeTruthy()
  })
})

describe('what each category holds', () => {
  it.each([
    ['general', ['Landing view', 'Week starts on', 'Working hours']],
    ['appearance', ['Theme']],
    ['account', ['Photo', 'Email', 'Sign-in method', 'Delete account']],
    ['tags', ['Your tags', 'New tag']],
    ['notifications', ['Notify ahead of time', 'Push notifications', 'Daily digest email']],
    ['keyboard', ['Keyboard shortcuts']],
    ['data', ['Backup and restore', 'Export for other tools']],
  ])('%s', (section, titles) => {
    render(<SettingsView section={section} />)
    expect(rowTitles()).toEqual(titles)
  })

  it('shows Templates and Install under General only when there is something to show', () => {
    const { unmount } = render(<SettingsView section="general" />)
    expect(rowTitles()).not.toContain('Templates')
    expect(rowTitles()).not.toContain('Install')
    unmount()

    h.install = { canInstall: true, installed: false }
    h.templates = [{ id: 't1', title: 'Weekly review', durationMin: 30 }]
    render(<SettingsView section="general" />)
    expect(rowTitles()).toEqual(['Landing view', 'Week starts on', 'Working hours', 'Templates', 'Install'])
    expect(screen.getByText(/Weekly review/)).toBeTruthy()
  })

  it('still changes the settings it always did', () => {
    const { rerender } = render(<SettingsView section="general" />)
    fireEvent.click(screen.getByRole('button', { name: 'Sunday' }))
    expect(h.updateSetting).toHaveBeenCalledWith('weekStartsOn', 0)
    fireEvent.change(screen.getByRole('combobox', { name: 'Landing view' }), { target: { value: 'week' } })
    expect(h.updateSetting).toHaveBeenCalledWith('landingView', 'week')

    rerender(<SettingsView section="appearance" />)
    fireEvent.click(screen.getByRole('button', { name: 'Light' }))
    expect(h.setTheme).toHaveBeenCalledWith('light')

    rerender(<SettingsView section="notifications" />)
    fireEvent.click(screen.getByRole('button', { name: '30m' }))
    expect(h.updateSetting).toHaveBeenCalledWith('notificationLeadMin', 30)
  })
})

describe('rebinding a shortcut', () => {
  /* App.jsx listens on `window`; a React handler's stopPropagation stops the
     native event on its way up, which is what keeps the key from running. */
  function withWindowListener() {
    const seen = vi.fn()
    window.addEventListener('keydown', seen)
    return { seen, stop: () => window.removeEventListener('keydown', seen) }
  }

  it('binds the pressed key without the app also treating it as a shortcut', () => {
    const { seen, stop } = withWindowListener()
    render(<SettingsView section="keyboard" />)
    const button = screen.getByRole('button', { name: /^New task shortcut: n/ })
    fireEvent.click(button)
    fireEvent.keyDown(button, { key: 'x' })
    stop()
    expect(h.updateSetting).toHaveBeenCalledWith('shortcuts', expect.objectContaining({ newTask: 'x' }))
    expect(seen).not.toHaveBeenCalled()
  })

  it('leaves a key alone when no rebinding is under way', () => {
    const { seen, stop } = withWindowListener()
    render(<SettingsView section="keyboard" />)
    const button = screen.getByRole('button', { name: /^New task shortcut: n/ })
    fireEvent.keyDown(button, { key: 'x' })
    stop()
    expect(h.updateSetting).not.toHaveBeenCalled()
    expect(seen).toHaveBeenCalled()
  })

  it('treats Escape as "stop capturing", not as a command, and binds nothing', () => {
    const { seen, stop } = withWindowListener()
    render(<SettingsView section="keyboard" />)
    const button = screen.getByRole('button', { name: /^New task shortcut: n/ })
    fireEvent.click(button)
    expect(button.textContent).toBe('Press a key…')
    fireEvent.keyDown(button, { key: 'Escape' })
    stop()
    expect(button.textContent).toBe('n')
    expect(h.updateSetting).not.toHaveBeenCalled()
    expect(seen).not.toHaveBeenCalled()
  })

  it('swaps two actions when the key is already taken', () => {
    render(<SettingsView section="keyboard" />)
    const button = screen.getByRole('button', { name: /^New task shortcut: n/ })
    fireEvent.click(button)
    fireEvent.keyDown(button, { key: 'e' })
    expect(h.updateSetting).toHaveBeenCalledWith(
      'shortcuts',
      expect.objectContaining({ newTask: 'e', newEvent: 'n' }),
    )
  })
})

/* On a phone the page is two screens — the list of categories, then the chosen
   one's panel with a Back button. Both are always in the DOM and the stylesheet
   shows one (`data-mobile-screen`), so what can be tested here is the state that
   drives it and the controls that change it. */
describe('on a phone: a list, then a screen', () => {
  const screenOf = (container) => container.querySelector('.settings-page').dataset.mobileScreen

  it('opens on the list of categories', () => {
    const { container } = render(<SettingsView />)
    expect(screenOf(container)).toBe('list')
  })

  it('opens the chosen category as its own screen, and goes back to the list', () => {
    const { container } = render(<SettingsView />)
    fireEvent.click(screen.getByRole('button', { name: 'Tags' }))
    expect(screenOf(container)).toBe('detail')
    expect(screen.getByRole('heading', { level: 3, name: 'Tags' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screenOf(container)).toBe('list')
  })

  it('keeps the category you were on when you go back', () => {
    render(<SettingsView />)
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard' }))
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    const nav = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(within(nav).getByRole('button', { current: true }).textContent).toBe('Keyboard')
  })

  it('has every category as a row and a Back button, whichever screen shows', () => {
    const { container } = render(<SettingsView />)
    expect(container.querySelectorAll('.settings-nav__item')).toHaveLength(7)
    expect(container.querySelectorAll('.settings-nav__chevron')).toHaveLength(7)
    expect(container.querySelector('.settings-back').textContent).toBe('Settings')
  })

  it('can be controlled from outside, which is how "Settings" opens the list and "Account" opens a screen', () => {
    const onSectionChange = vi.fn()
    const onDetailChange = vi.fn()
    const { container, rerender } = render(
      <SettingsView section="account" detail onSectionChange={onSectionChange} onDetailChange={onDetailChange} />,
    )
    expect(screenOf(container)).toBe('detail')
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(onDetailChange).toHaveBeenLastCalledWith(false)
    expect(onSectionChange).not.toHaveBeenCalled()
    rerender(<SettingsView section="account" detail={false} onSectionChange={onSectionChange} onDetailChange={onDetailChange} />)
    expect(screenOf(container)).toBe('list')
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }))
    expect(onSectionChange).toHaveBeenCalledWith('notifications')
    expect(onDetailChange).toHaveBeenLastCalledWith(true)
  })

  describe('scrolling to the top of the new screen', () => {
    const narrow = (matches) => {
      const original = window.matchMedia
      window.matchMedia = (query) => ({ matches, media: query, addEventListener() {}, removeEventListener() {} })
      return () => {
        window.matchMedia = original
      }
    }

    it('does, on a phone, when the screen changes — and not on first showing', () => {
      const restore = narrow(true)
      const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
      render(<SettingsView />)
      expect(scrollTo).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Tags' }))
      expect(scrollTo).toHaveBeenCalledWith(0, 0)
      restore()
    })

    it('does not beside a desktop panel, where nothing changes screen', () => {
      const restore = narrow(false)
      const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
      render(<SettingsView />)
      fireEvent.click(screen.getByRole('button', { name: 'Tags' }))
      expect(scrollTo).not.toHaveBeenCalled()
      restore()
    })
  })
})
