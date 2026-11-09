import { useRef, useState } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { todayKey } from '@cadence/shared/date.js'
import { recurrenceLabel } from '@cadence/shared/recurrence.js'
import { toCsv, toIcs } from '@cadence/shared/exportFormats.js'
import { DownloadIcon, UploadIcon } from '../icons.jsx'
import { Row } from './SettingsParts.jsx'

function download(filename, text, type) {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Getting every task, event, tag and journal note out of (and back into)
    Firestore as a plain file, plus the one-way exports other tools read. */
export function DataSection() {
  const { tasks, events, tags, importData, exportJournal } = useSchedule()
  const { pushError, pushSuccess, pushWarning } = useToast()
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const fileInputRef = useRef(null)

  async function onExport() {
    setExporting(true)
    /* The journal is read on demand (note bodies are not held in memory). If
       that fails the rest is still worth saving — but the file must not pass
       for a complete backup, so the gap is reported, not hidden. */
    let journal = []
    let missing = 0
    try {
      const result = await exportJournal()
      journal = result.notes
      missing = result.unreadable
    } catch (caught) {
      console.error('Could not read the journal for the export.', caught)
      missing = -1
    }
    download(
      `cadence-export-${todayKey()}.json`,
      JSON.stringify({ exportedAt: new Date().toISOString(), tasks, events, tags, journal }, null, 2),
      'application/json',
    )
    setExporting(false)
    if (missing === -1) {
      pushWarning('Exported your tasks, events and tags — but your journal could not be read, so it is not in the file.')
    } else if (missing > 0) {
      pushWarning(
        `Exported, but ${missing} journal note${missing === 1 ? '' : 's'} could not be read (open ${missing === 1 ? 'it' : 'them'} once while online, then export again).`,
      )
    }
  }

  function onExportCsv() {
    download(
      `cadence-${todayKey()}.csv`,
      toCsv({ tasks, events, tags }, recurrenceLabel),
      'text/csv;charset=utf-8',
    )
  }

  function onExportIcs() {
    download(`cadence-${todayKey()}.ics`, toIcs({ tasks, events, tags }), 'text/calendar;charset=utf-8')
  }

  async function onImportFile(event) {
    const file = event.target.files?.[0]
    event.target.value = '' // same file picked twice still fires onChange
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const { count, skippedNotes } = await importData({
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        events: Array.isArray(parsed.events) ? parsed.events : [],
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        journal: Array.isArray(parsed.journal) ? parsed.journal : [],
      })
      pushSuccess(`Imported ${count} item${count === 1 ? '' : 's'}.`)
      if (skippedNotes > 0) {
        pushWarning(
          `${skippedNotes} journal note${skippedNotes === 1 ? ' was' : 's were'} skipped — unreadable, too large, or from a newer version of Cadence.`,
        )
      }
    } catch (caught) {
      console.error('Could not import data.', caught)
      pushError(
        caught instanceof SyntaxError
          ? 'That file is not valid JSON.'
          : 'Could not import that file. Try again.',
      )
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <Row
        title="Backup and restore"
        hint="Every task, event, tag, and journal note, as a plain JSON file — a backup, or a way to move between accounts."
        below={
          <p className="field__hint">
            Importing adds to what's already here — it never replaces or removes anything.
          </p>
        }
      >
        <div className="settings-actions">
          <button
            type="button"
            className="ghost-button ghost-button--sm button--icon-label"
            onClick={onExport}
            disabled={exporting}
          >
            <DownloadIcon className="button-icon" />
            {exporting ? 'Exporting…' : 'Export'}
          </button>
          <button
            type="button"
            className="ghost-button ghost-button--sm button--icon-label"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            <UploadIcon className="button-icon" />
            {importing ? 'Importing…' : 'Import'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="visually-hidden"
            onChange={onImportFile}
            aria-label="Choose a Cadence export file"
          />
        </div>
      </Row>

      <Row
        title="Export for other tools"
        hint="A spreadsheet table, or a calendar file to import into Google Calendar, Apple Calendar, or Outlook. Both are one-way — only the JSON export above can be imported back into Cadence."
        below={
          <p className="field__hint">
            A repeating item exports as its rule, not as one row per day. Tasks with no date are
            left out of the calendar file, since an entry has to land somewhere.
          </p>
        }
      >
        <div className="settings-actions">
          <button
            type="button"
            className="ghost-button ghost-button--sm button--icon-label"
            onClick={onExportCsv}
          >
            <DownloadIcon className="button-icon" />
            CSV
          </button>
          <button
            type="button"
            className="ghost-button ghost-button--sm button--icon-label"
            onClick={onExportIcs}
          >
            <DownloadIcon className="button-icon" />
            Calendar (.ics)
          </button>
        </div>
      </Row>
    </>
  )
}
