import { useRef, useState } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { DEFAULT_SHORTCUTS, SHORTCUT_ACTIONS, useSettings } from '../../state/SettingsContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { useModalA11y } from '../../lib/useModalA11y.js'
import { useInstallPrompt } from '../../lib/useInstallPrompt.js'
import { durationLabel, minToTimeValue, timeValueToMin, todayKey } from '../../lib/date.js'
import { recurrenceLabel } from '../../lib/recurrence.js'
import { toCsv, toIcs } from '../../lib/exportFormats.js'
import { CloseIcon, DownloadIcon, UploadIcon } from '../icons.jsx'

const WEEK_START_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
]

const LANDING_VIEW_OPTIONS = [
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'today', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'focus', label: 'Focus' },
]

const LEAD_TIME_OPTIONS = [15, 30, 60, 120]

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

/** A key press as something worth storing and showing. Modifiers are refused
    rather than encoded: this is a map of single keys, and the window listener
    that reads it bails out on a modified press anyway (see App.jsx), so
    accepting Ctrl+P here would bind a shortcut that could never fire. */
function bindableKey(event) {
  if (event.key === 'Escape' || event.key === 'Tab') return null
  if (event.metaKey || event.ctrlKey || event.altKey) return null
  if (event.key === ' ') return null
  // A modifier pressed on its own reports itself as the key; waiting for a
  // real one is better than binding "Shift".
  if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return null
  return event.key
}

/** Arrow keys read as symbols; everything else is a literal key. */
function keyLabel(key) {
  const arrows = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' }
  return arrows[key] ?? key
}

/**
 * Per-device preferences, in one place rather than scattered across the
 * views that happen to read them — week start, where the app opens, how
 * far ahead "starting soon" looks — plus a way to get every task/event/tag
 * out of (and back into) Firestore as a plain file. Modeled on
 * ProfileModal's shape (one `.profile.stack` of `.profile__section`s) since
 * both are "a handful of independent settings behind one avatar-adjacent
 * entry point."
 */
export function SettingsModal({ onClose }) {
  const { tasks, events, tags, templates, importData, removeTemplate, profile, updateDigestPreference } =
    useSchedule()
  const { settings, updateSetting } = useSettings()
  const { pushError, pushSuccess } = useToast()
  const { canInstall, installed, promptInstall } = useInstallPrompt()
  const [digestBusy, setDigestBusy] = useState(false)
  const panelRef = useRef(null)
  useModalA11y(panelRef, { onClose })

  const [importing, setImporting] = useState(false)
  const [capturing, setCapturing] = useState(null)
  const fileInputRef = useRef(null)

  /* Rebinding listens on the button itself rather than the window: only one
     row can be capturing at a time, and the button already holds focus from
     the click that started it. */
  function onCaptureKey(actionId, event) {
    /* Tab passes straight through, unhandled: swallowing it would trap focus
       on a button that is waiting for a key it will never accept. Moving
       focus away cancels the capture via onBlur, which is the right outcome. */
    if (event.key === 'Tab') return
    event.preventDefault()
    /* Kept from reaching useModalA11y's window-level listener: while
       capturing, Escape means "stop capturing," and letting it through would
       close the whole Settings dialog on the way past. */
    event.stopPropagation()
    if (event.key === 'Escape') {
      setCapturing(null)
      return
    }
    const key = bindableKey(event)
    if (!key) return
    /* A key already spoken for is swapped, not duplicated — two actions on
       one key would leave the second permanently unreachable, since the
       listener runs the first match and stops. */
    const taken = Object.entries(settings.shortcuts).find(
      ([id, bound]) => id !== actionId && bound === key,
    )
    const next = { ...settings.shortcuts, [actionId]: key }
    if (taken) next[taken[0]] = settings.shortcuts[actionId]
    updateSetting('shortcuts', next)
    setCapturing(null)
  }

  function onExport() {
    download(
      `cadence-export-${todayKey()}.json`,
      JSON.stringify({ exportedAt: new Date().toISOString(), tasks, events, tags }, null, 2),
      'application/json',
    )
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
      const count = await importData({
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        events: Array.isArray(parsed.events) ? parsed.events : [],
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      })
      pushSuccess(`Imported ${count} item${count === 1 ? '' : 's'}.`)
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

  async function onRemoveTemplate(template) {
    try {
      await removeTemplate(template.id)
    } catch (caught) {
      console.error('Could not delete the template.', caught)
      pushError('Could not delete the template. Try again.')
    }
  }

  async function onToggleDigest(enabled) {
    setDigestBusy(true)
    try {
      await updateDigestPreference(enabled)
    } catch (caught) {
      console.error('Could not update the digest setting.', caught)
      pushError('Could not update that setting. Try again.')
    } finally {
      setDigestBusy(false)
    }
  }

  return (
    <div
      className="modal"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={panelRef} className="modal__panel" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="modal__head">
          <h2 className="modal__title">Settings</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="profile stack">
          <section className="profile__section field">
            <span className="field__label">Week starts on</span>
            <p className="field__hint">Which day leads the Week and Month grids.</p>
            <div className="filter-row" role="group" aria-label="Week starts on">
              {WEEK_START_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`filter-chip${settings.weekStartsOn === option.value ? ' filter-chip--on' : ''}`}
                  aria-pressed={settings.weekStartsOn === option.value}
                  onClick={() => updateSetting('weekStartsOn', option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section className="profile__section field">
            <span className="field__label">Landing view</span>
            <p className="field__hint">Where a fresh sign-in, or a reload, opens.</p>
            <select
              className="input"
              value={settings.landingView}
              onChange={(e) => updateSetting('landingView', e.target.value)}
            >
              {LANDING_VIEW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </section>

          <section className="profile__section field">
            <span className="field__label">Notify ahead of time</span>
            <p className="field__hint">
              How soon before a timed task starts it shows up as "starting soon."
            </p>
            <div className="filter-row" role="group" aria-label="Notify ahead of time">
              {LEAD_TIME_OPTIONS.map((min) => (
                <button
                  key={min}
                  type="button"
                  className={`filter-chip${settings.notificationLeadMin === min ? ' filter-chip--on' : ''}`}
                  aria-pressed={settings.notificationLeadMin === min}
                  onClick={() => updateSetting('notificationLeadMin', min)}
                >
                  {min < 60 ? `${min}m` : `${min / 60}h`}
                </button>
              ))}
            </div>
          </section>

          <section className="profile__section field">
            <span className="field__label">Working hours</span>
            <p className="field__hint">
              Scopes the Day view's free-slot finder to this window. Leave either side empty to
              turn it off.
            </p>
            <div className="field-row">
              <label className="field">
                <span className="field__label">Start</span>
                <input
                  type="time"
                  className="input"
                  step={900}
                  value={
                    Number.isFinite(settings.workingHours?.startMin)
                      ? minToTimeValue(settings.workingHours.startMin)
                      : ''
                  }
                  onChange={(e) => {
                    const startMin = timeValueToMin(e.target.value)
                    updateSetting(
                      'workingHours',
                      startMin === null
                        ? null
                        : { startMin, endMin: settings.workingHours?.endMin ?? null },
                    )
                  }}
                />
              </label>
              <label className="field">
                <span className="field__label">End</span>
                <input
                  type="time"
                  className="input"
                  step={900}
                  value={
                    Number.isFinite(settings.workingHours?.endMin)
                      ? minToTimeValue(settings.workingHours.endMin)
                      : ''
                  }
                  onChange={(e) => {
                    const endMin = timeValueToMin(e.target.value)
                    updateSetting(
                      'workingHours',
                      endMin === null
                        ? null
                        : { startMin: settings.workingHours?.startMin ?? null, endMin },
                    )
                  }}
                />
              </label>
            </div>
          </section>

          {(canInstall || installed) && (
            <section className="profile__section field">
              <span className="field__label">Install</span>
              {installed ? (
                <p className="field__hint">
                  Cadence is installed. Your schedule is readable and editable offline — changes
                  sync the next time you're connected.
                </p>
              ) : (
                <>
                  <p className="field__hint">
                    Runs in its own window, off the home screen or dock, and opens without a
                    connection.
                  </p>
                  <div className="tag-list__confirm">
                    <button
                      type="button"
                      className="ghost-button ghost-button--sm button--icon-label"
                      onClick={promptInstall}
                    >
                      <DownloadIcon className="button-icon" />
                      Install Cadence
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          <section className="profile__section field">
            <span className="field__label">Daily digest email</span>
            <p className="field__hint">
              One email each morning with today's plan, anything overdue, and what's coming up.
              Needs the backend pieces in functions/ deployed; see README-functions.md.
            </p>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={profile?.dailyDigestEnabled === true}
                disabled={digestBusy}
                onChange={(e) => onToggleDigest(e.target.checked)}
              />
              Email me a daily digest
            </label>
          </section>

          <section className="profile__section field">
            <span className="field__label">Keyboard shortcuts</span>
            <p className="field__hint">
              Single keys, active when you're not typing in a field. Click one and press the key
              you want; Escape cancels. Binding a key another action already uses swaps the two.
            </p>
            <ul className="shortcut-list">
              {SHORTCUT_ACTIONS.map((action) => (
                <li key={action.id} className="shortcut-list__row">
                  <span className="shortcut-list__label">{action.label}</span>
                  <button
                    type="button"
                    className={`shortcut-list__key${capturing === action.id ? ' shortcut-list__key--capturing' : ''}`}
                    onClick={() => setCapturing(action.id)}
                    onBlur={() => setCapturing((id) => (id === action.id ? null : id))}
                    onKeyDown={(e) => capturing === action.id && onCaptureKey(action.id, e)}
                    aria-label={`${action.label} shortcut: ${keyLabel(settings.shortcuts[action.id])}. Click to rebind.`}
                  >
                    {capturing === action.id ? 'Press a key…' : keyLabel(settings.shortcuts[action.id])}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="ghost-button ghost-button--sm"
              onClick={() => updateSetting('shortcuts', { ...DEFAULT_SHORTCUTS })}
            >
              Reset to defaults
            </button>
          </section>

          {templates.length > 0 && (
            <section className="profile__section field">
              <span className="field__label">Templates</span>
              <p className="field__hint">
                Saved from the task editor's "Save as template" — reachable from anywhere with the
                command palette (Cmd/Ctrl+K), as "New: &lt;title&gt;".
              </p>
              <ul className="tag-list">
                {templates.map((template) => (
                  <li key={template.id} className="tag-list__item">
                    <span className="template-list__title">
                      {template.title} · {durationLabel(template.durationMin)}
                    </span>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => onRemoveTemplate(template)}
                      aria-label={`Delete template "${template.title}"`}
                    >
                      <CloseIcon />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="profile__section field">
            <span className="field__label">Your data</span>
            <p className="field__hint">
              Every task, event, and tag, as a plain JSON file — a backup, or a way to move
              between accounts.
            </p>
            <div className="tag-list__confirm">
              <button type="button" className="ghost-button ghost-button--sm button--icon-label" onClick={onExport}>
                <DownloadIcon className="button-icon" />
                Export
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
            <p className="field__hint">
              Importing adds to what's already here — it never replaces or removes anything.
            </p>
          </section>

          <section className="profile__section field">
            <span className="field__label">Export for other tools</span>
            <p className="field__hint">
              A spreadsheet table, or a calendar file to import into Google Calendar, Apple
              Calendar, or Outlook. Both are one-way — only the JSON export above can be imported
              back into Cadence.
            </p>
            <div className="tag-list__confirm">
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
            <p className="field__hint">
              A repeating item exports as its rule, not as one row per day. Tasks with no date are
              left out of the calendar file, since an entry has to land somewhere.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
