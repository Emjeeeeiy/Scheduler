import { useRef, useState } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useSettings } from '../../state/SettingsContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { useModalA11y } from '../../lib/useModalA11y.js'
import { durationLabel, minToTimeValue, timeValueToMin, todayKey } from '../../lib/date.js'
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

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
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
  const { tasks, events, tags, templates, importData, removeTemplate } = useSchedule()
  const { settings, updateSetting } = useSettings()
  const { pushError, pushSuccess } = useToast()
  const panelRef = useRef(null)
  useModalA11y(panelRef, { onClose })

  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef(null)

  function onExport() {
    downloadJson(`cadence-export-${todayKey()}.json`, {
      exportedAt: new Date().toISOString(),
      tasks,
      events,
      tags,
    })
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
        </div>
      </div>
    </div>
  )
}
