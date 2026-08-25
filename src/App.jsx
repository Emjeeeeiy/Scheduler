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
  isValidKey,
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
import { EventEditor } from './components/EventEditor.jsx'
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
  SpanIcon,
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
  /* Keeping your place across a refresh is useful; being dropped on yesterday
     when you open the app the next morning is not. So a cursor restored from a
     previous session snaps forward — but that correction belongs to the
     *restore*, which is why it lives in `revive` and not in a derived value.
     Deriving it (`storedKey < todayKey() ? todayKey() : storedKey`) re-ran on
     every render and silently undid every backward step: the arrow wrote
     yesterday to storage, the next render clamped it straight back. That is
     why Previous did nothing in any view, and why Dashboard's "Go to" on an
     overdue day could never land on the day it named.

     isValidKey also stops a corrupt stored value reaching addDays and
     formatWeekLabel, which previously took whatever localStorage held. */
  const [focusKey, setFocusKey] = usePersistentState('cadence-app:focus', todayKey, (stored) =>
    isValidKey(stored) && stored >= todayKey() ? stored : todayKey(),
  )
  const [editor, setEditor] = useState(null)
  const [tagsOpen, setTagsOpen] = useState(false)

  /* The editor is one slot holding either kind. `kind` decides which component
     renders; `draft`/`task`/`event` carries what it starts from. */
  const openCreate = useCallback(
    (draft = {}) => setEditor({ mode: 'create', kind: 'task', draft }),
    [],
  )
  const openEdit = useCallback((task) => setEditor({ mode: 'edit', kind: 'task', task }), [])
  const openCreateEvent = useCallback(
    (draft = {}) => setEditor({ mode: 'create', kind: 'event', draft }),
    [],
  )
  const openEditEvent = useCallback(
    (event) => setEditor({ mode: 'edit', kind: 'event', event }),
    [],
  )
  const closeEditor = useCallback(() => setEditor(null), [])

  /* Switching kind mid-create keeps the day you had already chosen — that is
     usually the reason you opened the editor from a particular cell, and
     making you pick it again would be the only thing the switch cost you. */
  const changeEditorKind = useCallback((kind) => {
    setEditor((current) => {
      if (!current || current.mode !== 'create' || current.kind === kind) return current
      const draft = current.draft ?? {}
      if (kind === 'event') {
        const startDate = draft.date ?? draft.startDate ?? null
        return {
          mode: 'create',
          kind: 'event',
          draft: {
            title: draft.title,
            startDate,
            endDate: startDate,
            startMin: draft.startMin ?? null,
            tagId: draft.tagId ?? null,
          },
        }
      }
      return {
        mode: 'create',
        kind: 'task',
        draft: {
          title: draft.title,
          date: draft.startDate ?? draft.date ?? null,
          startMin: draft.startMin ?? null,
          tagId: draft.tagId ?? null,
        },
      }
    })
  }, [])

  const focusDay = useCallback(
    (key) => {
      setFocusKey(key)
      setView('today')
    },
    [setFocusKey, setView],
  )

  const focusMonth = useCallback(
    (key) => {
      setFocusKey(key)
      setView('month')
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

      // Holding a key repeats it; without this, leaning on `n` stacks modals.
      if (event.repeat) return

      const onDatedView = view === 'today' || view === 'week' || view === 'month'

      if (event.key === 'n') {
        event.preventDefault()
        openCreate(onDatedView ? { date: focusKey } : {})
      } else if (event.key === 'e') {
        event.preventDefault()
        openCreateEvent(
          onDatedView
            ? { startDate: focusKey, endDate: focusKey }
            : { startDate: todayKey(), endDate: todayKey() },
        )
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
  }, [editor, tagsOpen, view, focusKey, step, openCreate, openCreateEvent, setFocusKey])

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

        {/* Two stacked buttons rather than a split menu: there are exactly two
            kinds, and hiding one behind a disclosure would cost a click to
            save nothing. */}
        <button
          type="button"
          className="ghost-button sidebar__new-event"
          onClick={() => openCreateEvent({ startDate: focusKey, endDate: focusKey })}
        >
          <SpanIcon className="button-icon" /> New event
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
                <Dashboard
                  onFocusDay={focusDay}
                  onFocusMonth={focusMonth}
                  onEdit={openEdit}
                  onCreate={openCreate}
                />
              )}
              {view === 'today' && (
                <TodayView
                  focusKey={focusKey}
                  onEdit={openEdit}
                  onCreate={openCreate}
                  onEditEvent={openEditEvent}
                  onCreateEvent={openCreateEvent}
                />
              )}
              {view === 'week' && (
                <WeekGrid
                  focusKey={focusKey}
                  onEdit={openEdit}
                  onCreate={openCreate}
                  onEditEvent={openEditEvent}
                  onCreateEvent={openCreateEvent}
                  onFocusDay={focusDay}
                />
              )}
              {view === 'month' && (
                <MonthCalendar
                  focusKey={focusKey}
                  onFocusDay={focusDay}
                  onCreate={openCreate}
                  onEdit={openEdit}
                  onEditEvent={openEditEvent}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Keyed so that stepping from one day of a repeating task to the rule
          behind it rebuilds the form rather than keeping the old day's state.
          The kind is part of the key too, so switching Task/Event mid-create
          mounts the other form fresh instead of reusing the first one's state. */}
      {editor && editor.kind === 'event' && (
        <EventEditor
          key={editor.mode === 'edit' ? `event-${editor.event.id}` : 'create-event'}
          editor={editor}
          onClose={closeEditor}
          onChangeKind={changeEditorKind}
        />
      )}
      {editor && editor.kind !== 'event' && (
        <TaskEditor
          key={editor.mode === 'edit' ? editor.task.id : 'create-task'}
          editor={editor}
          onClose={closeEditor}
          onEditTask={openEdit}
          onChangeKind={changeEditorKind}
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
