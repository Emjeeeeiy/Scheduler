import { useCallback, useEffect, useMemo, useState } from 'react'
import { firebaseReady, missingConfigKeys } from './firebase.js'
import { AuthProvider, useAuth } from './state/AuthContext.jsx'
import { ScheduleProvider, useSchedule } from './state/ScheduleContext.jsx'
import { usePersistentState } from './lib/usePersistentState.js'
import { useTheme } from './lib/useTheme.js'
import {
  addDays,
  formatMonthLabel,
  formatWeekLabel,
  relativeDayLabel,
  shiftMonth,
  todayKey,
} from './lib/date.js'
import { SetupNotice } from './components/SetupNotice.jsx'
import { SignIn } from './components/SignIn.jsx'
import { Dashboard } from './components/Dashboard.jsx'
import { TodayView } from './components/TodayView.jsx'
import { WeekGrid } from './components/WeekGrid.jsx'
import { MonthCalendar } from './components/MonthCalendar.jsx'
import { TaskEditor } from './components/TaskEditor.jsx'
import { TagManager } from './components/TagManager.jsx'
import { NotificationBell } from './components/NotificationBell.jsx'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  DashboardIcon,
  DayIcon,
  MonthIcon,
  PlusIcon,
  TagIcon,
  ThemeDarkIcon,
  ThemeLightIcon,
  ThemeSystemIcon,
  WarningIcon,
  WeekIcon,
} from './components/icons.jsx'
import './styles/app.css'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { id: 'today', label: 'Day', Icon: DayIcon },
  { id: 'week', label: 'Week', Icon: WeekIcon },
  { id: 'month', label: 'Month', Icon: MonthIcon },
]

/** Which views carry a date cursor, and how far one arrow press moves it. */
const DATE_NAV = {
  today: (key, n) => addDays(key, n),
  week: (key, n) => addDays(key, n * 7),
  month: (key, n) => shiftMonth(key, n),
}

const VIEW_IDS = new Set(NAV_ITEMS.map((item) => item.id))

const THEME_LABEL = { system: 'System', light: 'Light', dark: 'Dark' }
const THEME_ICON = { system: ThemeSystemIcon, light: ThemeLightIcon, dark: ThemeDarkIcon }

function AppShell() {
  const { user, signOut } = useAuth()
  const { loading, error } = useSchedule()
  const { theme, cycleTheme } = useTheme()

  const [storedView, setView] = usePersistentState('cadence-app:view', 'dashboard')
  // A view id from a build that no longer exists (the removed Review page)
  // falls back to Dashboard rather than rendering nothing.
  const view = VIEW_IDS.has(storedView) ? storedView : 'dashboard'
  const [storedKey, setStoredKey] = usePersistentState('cadence-app:focus', todayKey)
  const [editor, setEditor] = useState(null)
  const [tagsOpen, setTagsOpen] = useState(false)

  /* Keeping your place across a refresh is useful; being dropped on yesterday
     when you open the app the next morning is not. Stale cursors snap forward. */
  const focusKey = storedKey < todayKey() ? todayKey() : storedKey
  const setFocusKey = setStoredKey

  const openCreate = useCallback((draft = {}) => setEditor({ mode: 'create', draft }), [])
  const openEdit = useCallback((task) => setEditor({ mode: 'edit', task }), [])
  const closeEditor = useCallback(() => setEditor(null), [])

  const focusDay = useCallback(
    (key) => {
      setFocusKey(key)
      setView('today')
    },
    [setFocusKey, setView],
  )

  const step = DATE_NAV[view]

  useEffect(() => {
    function onKeyDown(event) {
      // Never steal keys from a field the user is typing in.
      const tag = event.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target.isContentEditable) {
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (editor || tagsOpen) return

      if (event.key === 'n') {
        event.preventDefault()
        openCreate(view === 'today' || view === 'week' || view === 'month' ? { date: focusKey } : {})
      } else if (event.key === 't') {
        event.preventDefault()
        setFocusKey(todayKey())
      } else if (event.key === 'ArrowLeft' && step) {
        event.preventDefault()
        setFocusKey(step(focusKey, -1))
      } else if (event.key === 'ArrowRight' && step) {
        event.preventDefault()
        setFocusKey(step(focusKey, 1))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editor, tagsOpen, view, focusKey, step, openCreate, setFocusKey])

  const dateLabel = useMemo(() => {
    if (view === 'week') return formatWeekLabel(focusKey)
    if (view === 'month') return formatMonthLabel(focusKey)
    return relativeDayLabel(focusKey)
  }, [view, focusKey])

  const ThemeIcon = THEME_ICON[theme]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <ClockIcon className="brand__mark" />
          <span className="brand__name">Cadence</span>
        </div>

        <button
          type="button"
          className="primary-button sidebar__new-task"
          onClick={() => openCreate({})}
        >
          <PlusIcon className="button-icon" /> New task
        </button>

        <nav className="sidebar__nav" aria-label="Views">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`sidebar__link${view === item.id ? ' sidebar__link--active' : ''}`}
              aria-current={view === item.id ? 'page' : undefined}
              title={item.label}
              onClick={() => setView(item.id)}
            >
              <item.Icon className="sidebar__icon" />
              <span className="sidebar__label">{item.label}</span>
            </button>
          ))}
        </nav>

        <button
          type="button"
          className="sidebar__link sidebar__link--secondary"
          onClick={() => setTagsOpen(true)}
        >
          <TagIcon className="sidebar__icon" />
          Tags
        </button>

        <div className="sidebar__spacer" />

        <div className="sidebar__footer">
          <NotificationBell onEdit={openEdit} />
          <button
            type="button"
            className="icon-button"
            onClick={cycleTheme}
            aria-label={`Theme: ${THEME_LABEL[theme]}. Click to change.`}
            title={`Theme: ${THEME_LABEL[theme]}`}
          >
            <ThemeIcon />
          </button>
          <button
            type="button"
            className="avatar-button"
            onClick={signOut}
            title={`${user?.displayName ?? user?.email ?? 'Signed in'} — click to sign out`}
          >
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span aria-hidden="true">{(user?.displayName ?? '?').slice(0, 1).toUpperCase()}</span>
            )}
            <span className="visually-hidden">Sign out</span>
          </button>
        </div>
      </aside>

      <div className="app-content">
        <header className="app__header">
          {step ? (
            <div className="date-nav">
              <button
                type="button"
                className="icon-button"
                aria-label="Previous"
                onClick={() => setFocusKey(step(focusKey, -1))}
              >
                <ChevronLeftIcon />
              </button>
              <span className="date-nav__label">{dateLabel}</span>
              <button
                type="button"
                className="icon-button"
                aria-label="Next"
                onClick={() => setFocusKey(step(focusKey, 1))}
              >
                <ChevronRightIcon />
              </button>
              {focusKey !== todayKey() && (
                <button type="button" className="ghost-button" onClick={() => setFocusKey(todayKey())}>
                  Today
                </button>
              )}
            </div>
          ) : (
            <div className="date-nav date-nav--static">
              <span className="date-nav__label">{relativeDayLabel(todayKey())}</span>
            </div>
          )}
        </header>

        {error && (
          <p className="banner banner--error" role="alert">
            <WarningIcon className="banner__icon" /> {error}
          </p>
        )}

        <main className="app__main">
          {loading ? (
            <p className="empty">Loading your schedule…</p>
          ) : (
            <>
              {view === 'dashboard' && (
                <Dashboard onFocusDay={focusDay} onEdit={openEdit} onCreate={openCreate} />
              )}
              {view === 'today' && (
                <TodayView focusKey={focusKey} onEdit={openEdit} onCreate={openCreate} />
              )}
              {view === 'week' && (
                <WeekGrid focusKey={focusKey} onEdit={openEdit} onCreate={openCreate} />
              )}
              {view === 'month' && (
                <MonthCalendar focusKey={focusKey} onFocusDay={focusDay} onCreate={openCreate} />
              )}
            </>
          )}
        </main>
      </div>

      {/* Keyed so that stepping from one day of a repeating task to the rule
          behind it rebuilds the form rather than keeping the old day's state. */}
      {editor && (
        <TaskEditor
          key={editor.mode === 'edit' ? editor.task.id : 'create'}
          editor={editor}
          onClose={closeEditor}
          onEditTask={openEdit}
        />
      )}
      {tagsOpen && <TagManager onClose={() => setTagsOpen(false)} />}
    </div>
  )
}

/** Auth gate: config first, then the session, then the app. */
function Gate() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="centered">
        <p className="empty">Checking your session…</p>
      </div>
    )
  }

  if (!user) return <SignIn />

  return (
    <ScheduleProvider>
      <AppShell />
    </ScheduleProvider>
  )
}

export default function App() {
  if (!firebaseReady) return <SetupNotice missing={missingConfigKeys} />

  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
