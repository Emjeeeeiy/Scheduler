import { useEffect, useState } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { todayKey } from '../../lib/date.js'
import { usePersistentState } from '../../lib/usePersistentState.js'
import { FrameTicks } from '../shell/FrameTicks.jsx'
import { CheckIcon, PauseIcon, PlayIcon, ResetIcon } from '../icons.jsx'

/** The technique's own shape: 25 to focus, 5 to breathe, and — every fourth
    round — a longer break before the cycle starts over. Persisted so the
    lengths you actually work with stick around; the running countdown itself
    does not (see FocusMode below). */
const DEFAULT_SETTINGS = { focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4 }
const SETTINGS_KEY = 'cadence-app:focus-settings'

const PHASE_LABEL = { focus: 'Focus session', short: 'Short break', long: 'Long break' }
const PHASE_FIELD = { focus: 'focusMin', short: 'shortMin', long: 'longMin' }

const FIELDS = [
  { key: 'focusMin', label: 'Focus' },
  { key: 'shortMin', label: 'Short break' },
  { key: 'longMin', label: 'Long break' },
  { key: 'longEvery', label: 'Rounds before a long break' },
]

function clampSetting(key, raw) {
  const n = Math.round(Number(raw))
  if (!Number.isFinite(n) || n < 1) return DEFAULT_SETTINGS[key]
  return Math.min(n, key === 'longEvery' ? 12 : 180)
}

function durationFor(phase, settings) {
  const minutes = phase === 'focus' ? settings.focusMin : phase === 'short' ? settings.shortMin : settings.longMin
  return minutes * 60
}

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/* A focus round ending gets the alarm — stop, get up, take the break. A
   break ending gets the lighter notification ping — a nudge back, not a
   demand. Both live in public/ so they're served as plain static files,
   unbundled. */
const SOUND_FOR_PHASE = {
  focus: '/sounds/alarm.wav',
  short: '/sounds/notification.wav',
  long: '/sounds/notification.wav',
}

function playSound(phase) {
  try {
    new Audio(SOUND_FOR_PHASE[phase]).play().catch(() => {
      /* Autoplay can still be refused in edge cases (e.g. a muted tab) —
         the on-screen phase change and any OS notification still land. */
    })
  } catch {
    /* `Audio` can be unavailable in some embedded contexts; not fatal. */
  }
}

function notify(phase) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const title = phase === 'focus' ? 'Focus session complete' : 'Break is over — back to it'
  const body = phase === 'focus' ? 'Time for a break.' : 'Your next focus round is ready.'
  new Notification(title, { body })
}

export function FocusMode({ onEdit }) {
  const { tasksOn, toggleDone } = useSchedule()
  const [settings, setSettings] = usePersistentState(SETTINGS_KEY, DEFAULT_SETTINGS, (stored) => ({
    ...DEFAULT_SETTINGS,
    ...stored,
  }))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [taskId, setTaskId] = useState(null)

  const [phase, setPhase] = useState('focus')
  const [completed, setCompleted] = useState(0)
  const [running, setRunning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(() => durationFor('focus', settings))

  const openTasks = tasksOn(todayKey()).filter((t) => !t.done)
  // A stale id — the task finished or got edited elsewhere, or it's simply a
  // new day's list — just quietly stops resolving to anything; nothing here
  // needs to notice and clear it.
  const task = openTasks.find((t) => t.id === taskId) ?? null
  const selectedTaskId = task ? taskId : ''

  // Anchored to the wall clock rather than counted in ticks, so a
  // backgrounded or throttled tab still lands on the correct remaining time
  // instead of drifting behind it. `secondsLeft` seeds this only at the
  // instant Start is pressed — it is deliberately not a dependency, since
  // every tick's own setSecondsLeft call would otherwise re-arm the anchor
  // and the countdown would never advance. The phase completing is handled
  // right here, inside the tick that discovers it, rather than in a second
  // effect reacting to `secondsLeft` hitting zero — that would fire on every
  // render the countdown produces, not just the one where it actually ends.
  useEffect(() => {
    if (!running) return undefined
    const endAt = Date.now() + secondsLeft * 1000
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((endAt - Date.now()) / 1000))
      if (left > 0) {
        setSecondsLeft(left)
        return
      }
      clearInterval(id)
      setRunning(false)
      setSecondsLeft(0)
      playSound(phase)
      notify(phase)
      if (phase === 'focus') {
        setCompleted((c) => {
          const finished = c + 1
          const next = finished % settings.longEvery === 0 ? 'long' : 'short'
          setPhase(next)
          setSecondsLeft(durationFor(next, settings))
          return finished
        })
      } else {
        setPhase('focus')
        setSecondsLeft(durationFor('focus', settings))
      }
    }, 250)
    return () => clearInterval(id)
  }, [running])

  const total = durationFor(phase, settings)
  const pct = total > 0 ? Math.round(((total - secondsLeft) / total) * 100) : 0
  const roundInCycle = (completed % settings.longEvery) + (phase === 'focus' ? 1 : 0)

  function toggleRunning() {
    setRunning((r) => !r)
  }

  function reset() {
    setRunning(false)
    setSecondsLeft(durationFor(phase, settings))
  }

  function updateField(key, raw) {
    const value = clampSetting(key, raw)
    setSettings((s) => ({ ...s, [key]: value }))
    // A round not yet started should track its own length as you type it;
    // one already counting down keeps running on the value it started with.
    if (!running && PHASE_FIELD[phase] === key) setSecondsLeft(value * 60)
  }

  async function finishTask() {
    if (!task) return
    await toggleDone(task.id)
    setTaskId(null)
  }

  return (
    <div className="focus-page frame stack">
      <FrameTicks />

      <div className="section-head">
        <div>
          <h2 className="section-head__title">Focus mode</h2>
          <p className="section-head__sub">
            {phase === 'long'
              ? `Cycle complete — ${settings.longEvery} rounds done`
              : `Round ${roundInCycle} of ${settings.longEvery}`}
            {completed > 0 && ` · ${completed} completed this session`}
          </p>
        </div>
        <button
          type="button"
          className="ghost-button ghost-button--sm"
          onClick={() => setSettingsOpen((v) => !v)}
        >
          {settingsOpen ? 'Close' : 'Session lengths'}
        </button>
      </div>

      {settingsOpen && (
        <div className="focus__settings">
          {FIELDS.map((field) => (
            <label className="field" key={field.key}>
              <span className="field__label">{field.label}</span>
              <input
                className="input"
                type="number"
                min="1"
                max={field.key === 'longEvery' ? 12 : 180}
                value={settings[field.key]}
                onChange={(e) => updateField(field.key, e.target.value)}
              />
            </label>
          ))}
        </div>
      )}

      <div className="focus__task-row">
        <span className="field__label">Focusing on</span>
        <div className="focus__task-picker">
          <select
            className="input"
            value={selectedTaskId}
            onChange={(e) => setTaskId(e.target.value || null)}
          >
            <option value="">
              {openTasks.length === 0 ? 'Nothing open today' : 'No task selected'}
            </option>
            {openTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          {task && (
            <button
              type="button"
              className="icon-button"
              title="Mark done"
              aria-label="Mark done"
              onClick={finishTask}
            >
              <CheckIcon />
            </button>
          )}
        </div>
        {task && (
          <button type="button" className="focus__task-open" onClick={() => onEdit?.(task)}>
            {task.title}
          </button>
        )}
      </div>

      <div className="focus__timer">
        <p className="focus__phase">{PHASE_LABEL[phase]}</p>
        <p className="focus__clock">{formatClock(secondsLeft)}</p>

        <span className="hero__load-track focus__track">
          <span className="hero__load-fill" style={{ width: `${pct}%` }} />
        </span>

        <div className="focus__controls">
          <button type="button" className="primary-button focus__toggle" onClick={toggleRunning}>
            {running ? <PauseIcon className="button-icon" /> : <PlayIcon className="button-icon" />}
            {running ? 'Pause' : secondsLeft === total ? 'Start' : 'Resume'}
          </button>
          <button type="button" className="ghost-button" onClick={reset}>
            <ResetIcon className="button-icon" />
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
