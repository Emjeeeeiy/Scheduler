import { DAY_LONG, DAY_SHORT, weekdayOrder, weekdayOf } from '../../lib/date.js'
import { LAST, MONTHLY, WEEKLY, presetOf, recurrenceForPreset } from '../../lib/recurrence.js'
import { useSettings } from '../../state/SettingsContext.jsx'

const PRESETS = [
  { id: 'none', label: 'Never' },
  { id: 'daily', label: 'Every day' },
  { id: 'weekdays', label: 'Weekdays' },
  { id: 'weekends', label: 'Weekends' },
  { id: 'custom', label: 'Pick days' },
  { id: 'monthly', label: 'Monthly' },
]

const NTHS = [
  { id: 1, label: 'First' },
  { id: 2, label: 'Second' },
  { id: 3, label: 'Third' },
  { id: 4, label: 'Fourth' },
  { id: LAST, label: 'Last' },
]

/** The weekday toggles behind "Pick days". Initials repeat (T/T, S/S), so the
    accessible name is always the full day and never the letter on the key. */
function WeekdayPicker({ days, onChange }) {
  const { settings } = useSettings()
  return (
    <div className="weekday-picker" role="group" aria-label="Days to repeat on">
      {weekdayOrder(settings.weekStartsOn).map((day) => {
        const on = days.includes(day)
        return (
          <button
            key={day}
            type="button"
            className={`weekday-picker__day${on ? ' weekday-picker__day--on' : ''}`}
            aria-pressed={on}
            aria-label={DAY_LONG[day]}
            title={DAY_LONG[day]}
            onClick={() => {
              const next = on ? days.filter((d) => d !== day) : [...days, day].sort()
              // Clearing the last day would leave a repeat that repeats on
              // nothing; "Never" is the control for that.
              if (next.length > 0) onChange(next)
            }}
          >
            <span aria-hidden="true">{DAY_SHORT[day].slice(0, 1)}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * The Repeat control, shared by the task and event editors so a rule is chosen
 * the same way for both and the two can never drift into different vocabularies.
 *
 * Monthly deliberately offers only *which* occurrence, not which weekday: the
 * weekday comes from the date in the form above. Letting both be picked makes
 * "the 2nd Saturday" selectable on a Tuesday — a rule that contradicts the day
 * it is attached to, and one the anchor would then never match.
 */
export function RepeatPicker({ date, recurrence, onChange, disabled = false, hint }) {
  const preset = presetOf(recurrence)
  const weekday = date ? weekdayOf(date) : null

  return (
    <div className="field repeat">
      <span className="field__label" id="repeat-label">
        Repeat
      </span>

      <div className="repeat__presets" role="group" aria-labelledby="repeat-label">
        {PRESETS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`filter-chip${preset === option.id ? ' filter-chip--on' : ''}`}
            aria-pressed={preset === option.id}
            disabled={disabled || !date}
            onClick={() => onChange(recurrenceForPreset(option.id, date))}
          >
            {option.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <WeekdayPicker
          days={recurrence.days}
          onChange={(days) => onChange({ freq: WEEKLY, days, anchor: date })}
        />
      )}

      {preset === 'monthly' && (
        <div className="repeat__presets" role="group" aria-label="Which one of the month">
          {NTHS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`filter-chip${recurrence.nth === option.id ? ' filter-chip--on' : ''}`}
              aria-pressed={recurrence.nth === option.id}
              onClick={() => onChange({ freq: MONTHLY, weekday, nth: option.id, anchor: date })}
            >
              {option.label} {weekday === null ? '' : DAY_SHORT[weekday]}
            </button>
          ))}
        </div>
      )}

      {hint && <span className="field__hint">{hint}</span>}
    </div>
  )
}
