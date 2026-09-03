import { useEffect, useRef, useState } from 'react'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { todayKey, weekKeys } from '../../lib/date.js'
import { focusByTag, focusStatsFor } from '../../lib/stats.js'
import { usePersistentState } from '../../lib/usePersistentState.js'
import { useSettings } from '../../state/SettingsContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { FrameTicks } from '../shell/FrameTicks.jsx'
import { CheckIcon, CloseIcon, PauseIcon, PlayIcon, ResetIcon } from '../icons.jsx'

/** The technique's own shape: 25 to focus, 5 to breathe, and — every fourth
    round — a longer break before the cycle starts over. Persisted so the
    lengths you actually work with stick around; the running countdown itself
    does not (see FocusMode below). `autoStart` is here too, not in
    SettingsContext — it is specific to how this one page behaves, the same
    reasoning the other four fields already follow. */
const DEFAULT_SETTINGS = { focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4, autoStart: false }
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

/* A focus round ending is the one moment this app makes noise on purpose —
   loud and looping, like an actual alarm, because the whole point is to pull
   you out of what you're doing. A break ending is the opposite: you're
   already idle, so it stays silent and just waits for you to start the next
   round. The file lives in public/ so it's served as a plain static asset,
   unbundled. */
const ALARM_SRC = '/sounds/alarm.wav'

function notify(phase) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const title = phase === 'focus' ? 'Focus session complete' : 'Break is over — back to it'
  const body = phase === 'focus' ? 'Time for a break.' : 'Your next focus round is ready.'
  new Notification(title, { body })
}

const DIAL_CENTER = 50
const MAJOR_TICK_LENGTH = 10
const MINOR_TICK_LENGTH = 5

/** A point `length` out from the dial's center, at `angle` degrees measured
    clockwise from 12 — the one bit of trig the hand and every tick share. */
function pointOnDial(angle, length) {
  const radians = (angle - 90) * (Math.PI / 180)
  return {
    x: DIAL_CENTER + length * Math.cos(radians),
    y: DIAL_CENTER + length * Math.sin(radians),
  }
}

/** A stopwatch face for the round in progress, not a wall clock — the hand
    sweeps once per elapsed minute of *this* countdown, so the one thing in
    motion is tied to the timer itself. It freezes exactly when the timer is
    paused and picks back up exactly when it resumes, because it reads
    `elapsedSeconds` off the same state driving the digital clock rather than
    keeping a clock of its own. */
function StopwatchFace({ elapsedSeconds, size = 128 }) {
  const hand = pointOnDial(((elapsedSeconds % 60) / 60) * 360, 41)

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="focus__stopwatch" aria-hidden="true">
      <circle cx={DIAL_CENTER} cy={DIAL_CENTER} r={47} className="focus__stopwatch-face" />
      {Array.from({ length: 12 }, (_, i) => {
        const angle = i * 30
        const length = i % 3 === 0 ? MAJOR_TICK_LENGTH : MINOR_TICK_LENGTH
        const outer = pointOnDial(angle, 47)
        const inner = pointOnDial(angle, 47 - length)
        return (
          <line
            key={angle}
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            className={`focus__stopwatch-tick${i % 3 === 0 ? ' focus__stopwatch-tick--major' : ''}`}
          />
        )
      })}
      <line
        x1={DIAL_CENTER}
        y1={DIAL_CENTER}
        x2={hand.x}
        y2={hand.y}
        className="focus__stopwatch-hand"
      />
      <circle cx={DIAL_CENTER} cy={DIAL_CENTER} r={2.4} className="focus__stopwatch-pivot" />
    </svg>
  )
}

export function FocusMode({ onEdit }) {
  const { tasksOn, toggleDone, tags, focusSessions, addFocusSession } = useSchedule()
  const { settings: appSettings } = useSettings()
  const { pushError } = useToast()
  const [settings, setSettings] = usePersistentState(SETTINGS_KEY, DEFAULT_SETTINGS, (stored) => ({
    ...DEFAULT_SETTINGS,
    ...stored,
  }))
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [taskId, setTaskId] = useState(null)

  const [phase, setPhase] = useState('focus')
  const [completed, setCompleted] = useState(0)
  const [running, setRunning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(() => durationFor('focus', settings))
  const [alarmRinging, setAlarmRinging] = useState(false)
  const alarmRef = useRef(null)
  const wakeLockRef = useRef(null)

  // A safety net, not the normal path (Stop and Escape already pause it) —
  // this only matters if FocusMode itself ever unmounts mid-ring, e.g. on
  // sign-out, so the alarm doesn't keep looping after its UI is gone.
  useEffect(() => () => alarmRef.current?.pause(), [])

  const openTasks = tasksOn(todayKey()).filter((t) => !t.done)
  // A stale id — the task finished or got edited elsewhere, or it's simply a
  // new day's list — just quietly stops resolving to anything; nothing here
  // needs to notice and clear it.
  const task = openTasks.find((t) => t.id === taskId) ?? null
  const selectedTaskId = task ? taskId : ''

  // Read fresh inside the interval callback below rather than closed over
  // directly — `task` can change mid-round (switching the picker while a
  // round is running doesn't restart the timer), and a session should
  // record whichever task was selected when the round actually ended, not
  // whichever one happened to be selected when the countdown began.
  const taskRef = useRef(task)
  useEffect(() => {
    taskRef.current = task
  })

  function recordSession() {
    const current = taskRef.current
    addFocusSession({
      date: todayKey(),
      taskId: current?.id ?? null,
      tagId: current?.tagId ?? null,
      minutes: settings.focusMin,
    }).catch((caught) => {
      console.error('Could not record the focus session.', caught)
      pushError('Could not record that focus session — it still counted, just not in your history.')
    })
  }

  // Anchored to the wall clock rather than counted in ticks, so a
  // backgrounded or throttled tab still lands on the correct remaining time
  // instead of drifting behind it. `secondsLeft` seeds this only at the
  // instant Start is pressed — it is deliberately not a dependency, since
  // every tick's own setSecondsLeft call would otherwise re-arm the anchor
  // and the countdown would never advance. The phase completing is handled
  // right here, inside the tick that discovers it, rather than in a second
  // effect reacting to `secondsLeft` hitting zero — that would fire on every
  // render the countdown produces, not just the one where it actually ends.
  //
  // `phase` is a dependency for auto-start's sake: when settings.autoStart
  // is on, `running` is set back to true in the same tick it was set false
  // (net unchanged from React's point of view), so `running` alone wouldn't
  // re-trigger this effect to pick up the new phase's fresh `secondsLeft` —
  // the interval would sit there "running" with no timer actually driving
  // it. `phase` always changes at that same moment, so keying on it too is
  // what makes the next round's countdown actually start.
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
      setSecondsLeft(0)
      notify(phase)
      if (phase === 'focus') {
        // Only a focus round ending rings the alarm — a break ending is
        // meant to be quiet, since you're already sitting there waiting on it.
        startAlarm()
        recordSession()
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
      setRunning(settings.autoStart)
    }, 250)
    return () => clearInterval(id)
  }, [running, phase])

  // The alarm rings until someone actually stops it — Escape is the same
  // "make it stop" gesture every other modal in the app already answers to.
  useEffect(() => {
    if (!alarmRinging) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') stopAlarm()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [alarmRinging])

  useEffect(() => {
    async function requestWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
        }
      } catch {
        /* Not supported or denied */
      }
    }
    function releaseWakeLock() {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {})
        wakeLockRef.current = null
      }
    }

    if (running) {
      requestWakeLock()
    } else {
      releaseWakeLock()
    }

    function handleVisibilityChange() {
      if (running && document.visibilityState === 'visible') {
        requestWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      releaseWakeLock()
    }
  }, [running])

  useEffect(() => {
    if (running) {
      document.title = `${formatClock(secondsLeft)} - Focus`
    } else {
      document.title = 'Cadence'
    }
    return () => {
      document.title = 'Cadence'
    }
  }, [running, secondsLeft])

  const total = durationFor(phase, settings)
  const pct = total > 0 ? Math.round(((total - secondsLeft) / total) * 100) : 0
  const roundInCycle = (completed % settings.longEvery) + (phase === 'focus' ? 1 : 0)

  function startAlarm() {
    try {
      const audio = new Audio(ALARM_SRC)
      audio.loop = true
      alarmRef.current = audio
      audio.play().catch(() => {
        /* Autoplay can still be refused in edge cases (e.g. a muted tab) —
           the modal and any OS notification still land either way. */
      })
    } catch {
      /* `Audio` can be unavailable in some embedded contexts; not fatal. */
    }
    setAlarmRinging(true)
  }

  function stopAlarm() {
    if (alarmRef.current) {
      alarmRef.current.pause()
      alarmRef.current = null
    }
    setAlarmRinging(false)
  }

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

  const todayStats = focusStatsFor(focusSessions, [todayKey()])
  const weekStats = focusStatsFor(focusSessions, weekKeys(todayKey(), appSettings.weekStartsOn))
  const tagStats = focusByTag(focusSessions, tags)

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
            {(todayStats.count > 0 || weekStats.count > 0) &&
              ` · ${todayStats.minutes}m today · ${weekStats.minutes}m this week`}
          </p>
        </div>
        <div className="focus__head-actions">
          <button
            type="button"
            className="ghost-button ghost-button--sm"
            onClick={() => setStatsOpen((v) => !v)}
          >
            {statsOpen ? 'Close' : 'Focus stats'}
          </button>
          <button
            type="button"
            className="ghost-button ghost-button--sm"
            onClick={() => setSettingsOpen((v) => !v)}
          >
            {settingsOpen ? 'Close' : 'Session lengths'}
          </button>
        </div>
      </div>

      {statsOpen && (
        <div className="focus__settings">
          {tagStats.length === 0 ? (
            <p className="empty empty--sm">
              Complete a focus round and it'll start showing up here.
            </p>
          ) : (
            <ul className="focus__tag-stats">
              {tagStats.map((row) => (
                <li key={row.id} className="focus__tag-stats-row">
                  <span
                    className="focus__tag-stats-dot"
                    style={{ '--tag': row.tag.color }}
                    aria-hidden="true"
                  />
                  <span className="focus__tag-stats-name">{row.tag.name}</span>
                  <span className="focus__tag-stats-value">
                    {row.minutes}m · {row.count} round{row.count === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
          <label className="field focus__autostart">
            <span className="field__label">Auto-start next round</span>
            <input
              type="checkbox"
              checked={settings.autoStart}
              onChange={(e) => setSettings((s) => ({ ...s, autoStart: e.target.checked }))}
            />
          </label>
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
        <p className="focus__phase">
          {running && <span className="now-next__dot" aria-hidden="true" />}
          {PHASE_LABEL[phase]}
        </p>
        <p className="focus__clock">{formatClock(secondsLeft)}</p>

        <StopwatchFace elapsedSeconds={total - secondsLeft} />

        <span className="hero__load-track focus__track">
          <span className="hero__load-fill" style={{ width: `${pct}%` }} />
        </span>

        <div className="focus__controls">
          <button
            type="button"
            className="primary-button primary-button--lg focus__toggle"
            onClick={toggleRunning}
          >
            {running ? <PauseIcon className="button-icon" /> : <PlayIcon className="button-icon" />}
            {running ? 'Pause' : secondsLeft === total ? 'Start' : 'Resume'}
          </button>
          <button type="button" className="ghost-button" onClick={reset}>
            <ResetIcon className="button-icon" />
            Reset
          </button>
        </div>
      </div>

      {alarmRinging && (
        <div className="modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && stopAlarm()}>
          <div className="modal__panel" role="dialog" aria-modal="true" aria-label="Focus session complete">
            <div className="modal__head">
              <h2 className="modal__title">Focus session complete</h2>
              <button type="button" className="icon-button" onClick={stopAlarm} aria-label="Close">
                <CloseIcon />
              </button>
            </div>
            {/* The phase/timer state has already rolled over to the break by
                the time this shows, so it reads straight off `phase`/`total`
                rather than re-deriving what comes next. */}
            <p className="field__hint">Time for a {PHASE_LABEL[phase].toLowerCase()} — {formatClock(total)} next.</p>
            <div className="modal__foot">
              <span className="modal__spacer" />
              <button type="button" className="primary-button" onClick={stopAlarm} autoFocus>
                Stop alarm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
