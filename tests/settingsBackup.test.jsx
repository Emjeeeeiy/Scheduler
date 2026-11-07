/* The Settings "Your data" backup: that the JSON export carries the journal, that
 * an export which could not read some notes says so instead of passing for a full
 * backup, and that an import reports the notes it had to skip.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  pushSuccess: vi.fn(),
  pushError: vi.fn(),
  pushWarning: vi.fn(),
  exportJournal: vi.fn(),
  importData: vi.fn(),
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
  useToast: () => ({ pushSuccess: h.pushSuccess, pushError: h.pushError, pushWarning: h.pushWarning }),
}))
vi.mock('../src/state/ScheduleContext.jsx', () => ({
  useSchedule: () => ({
    tasks: [{ id: 't1', title: 'A task' }],
    events: [],
    tags: [],
    templates: [],
    importData: h.importData,
    exportJournal: h.exportJournal,
    removeTemplate: vi.fn(),
    profile: {},
    updateDigestPreference: vi.fn(),
  }),
}))
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
      updateSetting: vi.fn(),
    }),
  }
})
vi.mock('../src/lib/useInstallPrompt.js', () => ({
  useInstallPrompt: () => ({ canInstall: false, installed: false, promptInstall: vi.fn() }),
}))
vi.mock('../src/state/ThemeContext.jsx', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: vi.fn() }),
}))

import { SettingsView } from '../src/components/views/SettingsView.jsx'

let downloaded
beforeEach(() => {
  downloaded = null
  for (const fn of Object.values(h)) fn.mockReset()
  URL.createObjectURL = vi.fn((blob) => {
    downloaded = blob
    return 'blob:backup'
  })
  URL.revokeObjectURL = vi.fn()
  // jsdom would try to navigate on a link click; the download itself is not under test.
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

const readBlob = (blob) =>
  new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsText(blob)
  })

const noteEntry = { title: 'Trip', body: '{"type":"doc","content":[{"type":"paragraph"}]}', createdAt: 1, updatedAt: 2 }

async function exportNow() {
  render(<SettingsView section="data" />)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
  })
  await waitFor(() => expect(downloaded).toBeTruthy())
  return JSON.parse(await readBlob(downloaded))
}

describe('exporting', () => {
  it('puts the journal in the file next to tasks, events and tags', async () => {
    h.exportJournal.mockResolvedValue({ notes: [noteEntry], unreadable: 0 })
    const file = await exportNow()
    expect(file.tasks).toHaveLength(1)
    expect(file.journal).toEqual([noteEntry])
    expect(h.pushWarning).not.toHaveBeenCalled()
  })

  it('warns when some notes could not be read, and still saves the rest', async () => {
    h.exportJournal.mockResolvedValue({ notes: [noteEntry], unreadable: 2 })
    const file = await exportNow()
    expect(file.journal).toHaveLength(1)
    expect(h.pushWarning).toHaveBeenCalledTimes(1)
    expect(h.pushWarning.mock.calls[0][0]).toMatch(/2 journal notes could not be read/)
  })

  it('says so when the journal cannot be read at all, rather than handing over a file that looks complete', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    h.exportJournal.mockRejectedValue(new Error('offline'))
    const file = await exportNow()
    expect(file.tasks).toHaveLength(1)
    expect(file.journal).toEqual([])
    expect(h.pushWarning).toHaveBeenCalledTimes(1)
    expect(h.pushWarning.mock.calls[0][0]).toMatch(/journal could not be read/)
  })

  it('is busy while it reads, so a second click cannot start a second export', async () => {
    let finish
    h.exportJournal.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    render(<SettingsView section="data" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    })
    expect(screen.getByRole('button', { name: 'Exporting…' }).disabled).toBe(true)
    await act(async () => finish({ notes: [], unreadable: 0 }))
    expect(screen.getByRole('button', { name: 'Export' }).disabled).toBe(false)
  })
})

describe('importing', () => {
  async function importFile(contents) {
    const { container } = render(<SettingsView section="data" />)
    const input = container.querySelector('input[type="file"][accept=".json,application/json"]')
    const file = new File([JSON.stringify(contents)], 'backup.json', { type: 'application/json' })
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })
  }

  it('hands the journal notes to the importer, and counts them in the result', async () => {
    h.importData.mockResolvedValue({ count: 3, skippedNotes: 0 })
    await importFile({ tasks: [{ title: 'x' }], journal: [noteEntry, noteEntry] })
    await waitFor(() => expect(h.pushSuccess).toHaveBeenCalledWith('Imported 3 items.'))
    expect(h.importData.mock.calls[0][0].journal).toHaveLength(2)
    expect(h.pushWarning).not.toHaveBeenCalled()
  })

  it('reports the notes it skipped', async () => {
    h.importData.mockResolvedValue({ count: 1, skippedNotes: 2 })
    await importFile({ journal: [noteEntry] })
    await waitFor(() => expect(h.pushSuccess).toHaveBeenCalledWith('Imported 1 item.'))
    expect(h.pushWarning).toHaveBeenCalledTimes(1)
    expect(h.pushWarning.mock.calls[0][0]).toMatch(/2 journal notes were skipped/)
  })

  it('still imports an older backup that has no journal', async () => {
    h.importData.mockResolvedValue({ count: 1, skippedNotes: 0 })
    await importFile({ tasks: [{ title: 'x' }] })
    await waitFor(() => expect(h.importData).toHaveBeenCalled())
    expect(h.importData.mock.calls[0][0].journal).toEqual([])
  })
})
