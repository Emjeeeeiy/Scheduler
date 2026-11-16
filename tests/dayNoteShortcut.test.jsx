/* "Open the day's journal note" is a rebindable single-key shortcut, `j` by
 * default, and it was added after people could already have rebound keys.
 *
 * What is worth pinning is the one case a plain defaults-merge gets wrong: a saved
 * map that predates the action and has already given `j` to something else. Two
 * actions on one key leave the later one dead — the window listener runs the
 * first match and stops — so the new action must start UNBOUND instead, and
 * Settings must say so ("None") rather than show a key that belongs to another
 * action. Everyone else simply gets `j`.
 *
 * Runs through the real SettingsProvider and its localStorage restore, which is
 * the path the merge is actually on.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SHORTCUTS, SHORTCUT_ACTIONS, SettingsProvider, useSettings } from '../src/state/SettingsContext.jsx'
import { KeyboardSection } from '../src/components/settings/KeyboardSection.jsx'

const SETTINGS_KEY = 'cadence-app:settings'

// A settings blob from before the action existed: every other shortcut is there.
const { dayNote: _added, ...BEFORE } = DEFAULT_SHORTCUTS

beforeEach(() => localStorage.clear())
afterEach(cleanup)

function store(shortcuts) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ shortcuts }))
}

function Bindings() {
  const { settings } = useSettings()
  return <output data-testid="bindings">{JSON.stringify(settings.shortcuts)}</output>
}

const bindings = () => JSON.parse(screen.getByTestId('bindings').textContent)

describe('the day-note shortcut', () => {
  it('is listed with the other rebindable actions', () => {
    expect(SHORTCUT_ACTIONS.map((action) => action.id)).toContain('dayNote')
    expect(DEFAULT_SHORTCUTS.dayNote).toBe('j')
  })

  it('starts on j for someone who has never opened Settings', () => {
    render(
      <SettingsProvider>
        <Bindings />
      </SettingsProvider>,
    )
    expect(bindings().dayNote).toBe('j')
  })

  it('starts on j for a saved map that predates it and has not used j', () => {
    store({ ...BEFORE, newTask: 'a' })
    render(
      <SettingsProvider>
        <Bindings />
      </SettingsProvider>,
    )
    expect(bindings().dayNote).toBe('j')
    expect(bindings().newTask).toBe('a')
  })

  it('starts unbound when a saved map has already given j to another action', () => {
    store({ ...BEFORE, newEvent: 'j' })
    render(
      <SettingsProvider>
        <Bindings />
      </SettingsProvider>,
    )
    expect(bindings().dayNote).toBeNull()
    // The person's own binding is untouched.
    expect(bindings().newEvent).toBe('j')
  })

  it('keeps a binding the person already chose for it, even a repeat of another', () => {
    // Already in the saved map, so it is theirs: the merge only fills what is missing.
    store({ ...BEFORE, dayNote: 'k' })
    render(
      <SettingsProvider>
        <Bindings />
      </SettingsProvider>,
    )
    expect(bindings().dayNote).toBe('k')
  })

  it('shows an unbound action as "None" in Settings', () => {
    store({ ...BEFORE, newEvent: 'j' })
    render(
      <SettingsProvider>
        <KeyboardSection />
      </SettingsProvider>,
    )
    expect(screen.getByRole('button', { name: /Open the day's journal note shortcut: None\./ }).textContent).toBe(
      'None',
    )
    expect(screen.getByRole('button', { name: /New event shortcut: j\./ }).textContent).toBe('j')
  })
})
