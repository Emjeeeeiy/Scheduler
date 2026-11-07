import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useSettings } from '../../state/SettingsContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { useInstallPrompt } from '../../lib/useInstallPrompt.js'
import { durationLabel, minToTimeValue, timeValueToMin } from '@cadence/shared/date.js'
import { CloseIcon, DownloadIcon } from '../icons.jsx'
import { Row } from './SettingsParts.jsx'

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
  { value: 'journal', label: 'Journal' },
]

/** Where Cadence opens, how the week is laid out, the hours the free-slot finder
    works inside, the saved templates, and installing the app. */
export function GeneralSection() {
  const { templates, removeTemplate } = useSchedule()
  const { settings, updateSetting } = useSettings()
  const { pushError } = useToast()
  const { canInstall, installed, promptInstall } = useInstallPrompt()

  async function onRemoveTemplate(template) {
    try {
      await removeTemplate(template.id)
    } catch (caught) {
      console.error('Could not delete the template.', caught)
      pushError('Could not delete the template. Try again.')
    }
  }

  return (
    <>
      <Row title="Landing view" hint="Where a fresh sign-in, or a reload, opens.">
        <select
          className="input"
          aria-label="Landing view"
          value={settings.landingView}
          onChange={(e) => updateSetting('landingView', e.target.value)}
        >
          {LANDING_VIEW_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Row>

      <Row title="Week starts on" hint="Which day leads the Week and Month grids.">
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
      </Row>

      <Row
        title="Working hours"
        hint="Scopes the Day view's free-slot finder to this window. Leave either side empty to turn it off."
      >
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
                  startMin === null ? null : { startMin, endMin: settings.workingHours?.endMin ?? null },
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
                  endMin === null ? null : { startMin: settings.workingHours?.startMin ?? null, endMin },
                )
              }}
            />
          </label>
        </div>
      </Row>

      {templates.length > 0 && (
        <Row
          title="Templates"
          hint={
            <>
              Saved from the task editor's "Save as template" — reachable from anywhere with the
              command palette (Cmd/Ctrl+K), as "New: &lt;title&gt;".
            </>
          }
        >
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
        </Row>
      )}

      {(canInstall || installed) && (
        <Row
          title="Install"
          hint={
            installed
              ? "Cadence is installed. Your schedule is readable and editable offline — changes sync the next time you're connected."
              : 'Runs in its own window, off the home screen or dock, and opens without a connection.'
          }
        >
          {!installed && (
            <div className="settings-actions">
              <button
                type="button"
                className="ghost-button ghost-button--sm button--icon-label"
                onClick={promptInstall}
              >
                <DownloadIcon className="button-icon" />
                Install Cadence
              </button>
            </div>
          )}
        </Row>
      )}
    </>
  )
}
