/* The Settings page's categories, in the order its side navigation lists them.
 *
 * Plain data in its own file so App.jsx can validate a remembered section (and
 * the palette can name one) without pulling in the panels themselves. `blurb` is
 * the line under the panel's title: what lives here, in the words someone would
 * look for it by. */

export const SETTINGS_SECTIONS = [
  {
    id: 'general',
    label: 'General',
    blurb: 'Where Cadence opens, how the week runs, and the hours you work.',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    blurb: 'How Cadence looks on this device.',
  },
  {
    id: 'account',
    label: 'Account',
    blurb: 'Your photo, how you sign in, and deleting your account.',
  },
  {
    id: 'tags',
    label: 'Tags',
    blurb: 'The categories your tasks and events are filed under.',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    blurb: 'Reminders on this device, and the morning email.',
  },
  {
    id: 'keyboard',
    label: 'Keyboard',
    blurb: 'The single-key shortcuts, and the keys they use.',
  },
  {
    id: 'data',
    label: 'Your data',
    blurb: 'A backup you can restore, and exports for other tools.',
  },
]

export const DEFAULT_SETTINGS_SECTION = 'general'

export const isSettingsSection = (value) => SETTINGS_SECTIONS.some((section) => section.id === value)
