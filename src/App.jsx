import { useCallback, useEffect, useMemo, useState } from 'react'
import { firebaseReady, missingConfigKeys } from './firebase.js'
import { AuthProvider, useAuth } from './state/AuthContext.jsx'
import { ScheduleProvider, useSchedule } from './state/ScheduleContext.jsx'
import { ToastProvider } from './state/ToastContext.jsx'
import { SettingsProvider, useSettings } from './state/SettingsContext.jsx'
import { usePersistentState } from './lib/usePersistentState.js'
import { useTheme } from './lib/useTheme.js'
import {
  addDays,
  durationLabel,
  formatMonthLabel,
  formatWeekLabel,
  isValidKey,
  minToShortLabel,
  relativeDayLabel,
  shiftMonth,
  todayKey,
} from './lib/date.js'
import { parseQuickAdd } from './lib/parseQuickAdd.js'
import { SetupNotice } from './components/shell/SetupNotice.jsx'
import { SignIn } from './components/auth/SignIn.jsx'
import { Dashboard } from './components/views/Dashboard.jsx'
import { TodayView } from './components/views/TodayView.jsx'
import { WeekGrid } from './components/views/WeekGrid.jsx'
import { MonthCalendar } from './components/views/MonthCalendar.jsx'
import { ReviewView } from './components/views/ReviewView.jsx'
import { FocusMode } from './components/views/FocusMode.jsx'
import { TaskEditor } from './components/editors/TaskEditor.jsx'
import { EventEditor } from './components/editors/EventEditor.jsx'
import { ItemDetail } from './components/editors/ItemDetail.jsx'
import { TagManager } from './components/editors/TagManager.jsx'
import { ItemManager } from './components/editors/ItemManager.jsx'
import { NotificationBell } from './components/shell/NotificationBell.jsx'
import { AccountMenu } from './components/shell/AccountMenu.jsx'
import { ToastStack } from './components/shell/ToastStack.jsx'
import { ErrorBoundary } from './components/shell/ErrorBoundary.jsx'
import { SettingsModal } from './components/shell/SettingsModal.jsx'
import { CommandPalette } from './components/shell/CommandPalette.jsx'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  DashboardIcon,
  DayIcon,
  FocusIcon,
  ListIcon,
  LogOutIcon,
  MonthIcon,
  PlusIcon,
  RepeatIcon,
  SettingsIcon,
  SpanIcon,
  TagIcon,
  ThemeDarkIcon,
  ThemeLightIcon,
  ThemeSystemIcon,
  TrendIcon,
  WarningIcon,
  WeekIcon,
} from './components/icons.jsx'
/* Split from one 4,500+ line app.css into per-area files, in the exact order
   the original file's sections appeared — cascade order still matters (see
   the note in WeekGrid.jsx about a ≤900px override needing to come after an
   earlier one at equal specificity), so these have to stay in this sequence,
   not alphabetical or by import convenience. */
import './styles/shell.css'
import './styles/auth.css'
import './styles/dashboard.css'
import './styles/focus.css'
import './styles/calendar.css'
import './styles/modals.css'
import './styles/toggles-responsive.css'
import './styles/calendar-dnd.css'
import './styles/review.css'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { id: 'schedule', label: 'Schedule', Icon: MonthIcon },
  { id: 'focus', label: 'Focus', Icon: FocusIcon },
]

/** The schedule page's four sub-views, and the tab shown for each. */
const SCHEDULE_TABS = [
  { id: 'today', label: 'Day', Icon: DayIcon },
  { id: 'week', label: 'Week', Icon: WeekIcon },
  { id: 'month', label: 'Month', Icon: MonthIcon },
  { id: 'review', label: 'Review', Icon: TrendIcon },
]
const SCHEDULE_VIEWS = SCHEDULE_TABS.map((tab) => tab.id)

/** How many matching tasks (and, separately, events) the palette's search
    offers. A cap rather than a scroll: past a handful, refining the query is
    faster than reading further down a list. */
const SEARCH_LIMIT = 6

/* How the app was launched, read once at import.
 *
 * The manifest's home-screen shortcuts (see public/manifest.webmanifest)
 * land on a URL — `/?new=task` — rather than in the app's own state. These
 * are launch parameters in the strictest sense: they cannot change without
 * a fresh load, which is exactly why this is read here and used to seed
 * useState directly rather than applied from an effect. An effect would
 * render once with the wrong view and then correct itself, and would have
 * to guard against re-running.
 *
 * The query string is cleared immediately, so a reload — or reopening a
 * closed tab — does not fire the same shortcut a second time. */
const launch = (() => {
  if (typeof window === 'undefined') return {}
  const params = new URLSearchParams(window.location.search)
  const wants = params.get('new')
  const view = params.get('view')
  if (!wants && !view) return {}
  window.history.replaceState({}, '', window.location.pathname)
  return {
    create: wants === 'task' || wants === 'event' ? wants : null,
    view: view === 'dashboard' || view === 'focus' || SCHEDULE_VIEWS.includes(view) ? view : null,
  }
})()

/** Which views carry a date cursor, and how far one arrow press moves it.
    Review shares Week's own step — a retrospective moves one week at a time,
    the same cursor Day/Week/Month already share rather than a second one. */
const DATE_NAV = {
  today: (key, n) => addDays(key, n),
  week: (key, n) => addDays(key, n * 7),
  month: (key, n) => shiftMonth(key, n),
  review: (key, n) => addDays(key, n * 7),
}

const THEME_LABEL = { system: 'System', light: 'Light', dark: 'Dark' }
const THEME_ICON = { system: ThemeSystemIcon, light: ThemeLightIcon, dark: ThemeDarkIcon }

function AppShell() {
  const { signOut } = useAuth()
  const { loading, error, templates, tasks, events } = useSchedule()
  const { theme, cycleTheme } = useTheme()
  const { settings } = useSettings()
  const shortcuts = settings.shortcuts

  // Not persisted across navigation on purpose: every sign-in — and every
  // fresh mount of the app shell — starts back on the configured landing
  // view (Settings → default: Dashboard) rather than wherever you left off
  // last time you switched views.
  const [view, setView] = useState(launch.view ?? settings.landingView)
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
  /* Seeded straight from the launch parameters when the app was opened
     through a "New task"/"New event" shortcut — the same shape openCreate
     and openCreateEvent build below. */
  const [editor, setEditor] = useState(() => {
    if (launch.create === 'task') return { mode: 'create', kind: 'task', draft: { date: todayKey() } }
    if (launch.create === 'event') {
      return {
        mode: 'create',
        kind: 'event',
        draft: { startDate: todayKey(), endDate: todayKey() },
      }
    }
    return null
  })
  const [tagsOpen, setTagsOpen] = useState(false)
  const [itemsOpen, setItemsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  // Any one of these being open is "a modal is up" for the purposes of the
  // global keyboard shortcuts below — stacking a second one on top (Cmd+K
  // while an editor is open, `n` while the palette has focus) is exactly
  // the kind of thing useModalA11y's single-dialog focus trap doesn't
  // expect.
  const modalOpen = Boolean(editor) || tagsOpen || itemsOpen || settingsOpen || paletteOpen

  /* The editor is one slot holding either kind. `kind` decides which component
     renders; `draft`/`task`/`event` carries what it starts from. `mode` adds a
     third state beyond create/edit: clicking a task or event anywhere in the
     calendar or dashboard opens it read-only first — 'view' — and only the
     detail panel's own Edit button (startEditing, below) promotes it to a
     real 'edit'. A few entry points that are already an explicit "Edit"
     affordance (the series shortcut inside TaskEditor, the Item Index's own
     Edit button) skip the view step and go straight to 'edit', since asking
     "view or edit?" after someone already chose Edit would be a second click
     for nothing. */
  const openCreate = useCallback(
    (draft = {}) => setEditor({ mode: 'create', kind: 'task', draft }),
    [],
  )
  const openEdit = useCallback((task) => setEditor({ mode: 'view', kind: 'task', task }), [])
  const openEditEvent = useCallback(
    (event) => setEditor({ mode: 'view', kind: 'event', event }),
    [],
  )
  const editTaskDirect = useCallback(
    (task) => setEditor({ mode: 'edit', kind: 'task', task }),
    [],
  )
  const editEventDirect = useCallback(
    (event) => setEditor({ mode: 'edit', kind: 'event', event }),
    [],
  )
  /* `updated` is ItemDetail's own live-resolved copy of what it was showing
     — usually identical to what this modal opened with, but not always: a
     checklist tick or a pin made from that read-only stop can detach a
     repeating task's occurrence into a new document entirely (see
     ItemDetail's `handoff`), and the editor has to open on THAT document,
     not on the original occurrence frozen in `current.task`/`current.event`
     at the moment this whole thing was opened. */
  const startEditing = useCallback((updated) => {
    setEditor((current) => {
      if (!current || current.mode !== 'view') return current
      const key = current.kind === 'event' ? 'event' : 'task'
      return { ...current, mode: 'edit', [key]: updated ?? current[key] }
    })
  }, [])
  const openCreateEvent = useCallback(
    (draft = {}) => setEditor({ mode: 'create', kind: 'event', draft }),
    [],
  )
  const closeEditor = useCallback(() => setEditor(null), [])

  /* The index hands off to the same editors every other surface opens, and
     stands down while one is up: two stacked modals would put two Escape
     handlers on the window and close both on one press. Its own row already
     carries an explicit Edit button, so — like the series shortcut below —
     it opens straight into 'edit' rather than the view step. */
  const editFromIndex = useCallback(
    (task) => {
      setItemsOpen(false)
      editTaskDirect(task)
    },
    [editTaskDirect],
  )
  const editEventFromIndex = useCallback(
    (event) => {
      setItemsOpen(false)
      editEventDirect(event)
    },
    [editEventDirect],
  )

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
      /* Cmd/Ctrl+K checked first, and deliberately ahead of the "typing in a
         field" guard below — a command palette that only opens when focus
         happens to be somewhere inert is not a very useful shortcut. It
         still won't stack on top of another modal (same reasoning as every
         other shortcut here), and pressing it again while the palette is
         already open closes it — a plain toggle. */
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        if (modalOpen && !paletteOpen) return
        event.preventDefault()
        setPaletteOpen((v) => !v)
        return
      }

      // Never steal keys from a field the user is typing in.
      const tag = event.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target.isContentEditable) {
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (modalOpen) return

      // Holding a key repeats it; without this, leaning on `n` stacks modals.
      if (event.repeat) return

      const onDatedView = view === 'today' || view === 'week' || view === 'month'

      /* Matched against the bindings rather than hardcoded keys. Compared
         case-insensitively for single letters so a rebind to a capital
         still fires from an unshifted press — the arrow keys, whose names
         are multi-character, are unaffected by lowercasing. */
      const pressed = event.key.length === 1 ? event.key.toLowerCase() : event.key
      const bound = (id) => {
        const key = shortcuts[id]
        return key && (key.length === 1 ? key.toLowerCase() : key) === pressed
      }

      if (bound('newTask')) {
        event.preventDefault()
        openCreate(onDatedView ? { date: focusKey } : {})
      } else if (bound('newEvent')) {
        event.preventDefault()
        openCreateEvent(
          onDatedView
            ? { startDate: focusKey, endDate: focusKey }
            : { startDate: todayKey(), endDate: todayKey() },
        )
      } else if (bound('jumpToday')) {
        event.preventDefault()
        setFocusKey(todayKey())
      } else if (bound('prevDate') && step) {
        event.preventDefault()
        setFocusKey(step(focusKey, -1))
      } else if (bound('nextDate') && step) {
        event.preventDefault()
        setFocusKey(step(focusKey, 1))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [modalOpen, paletteOpen, view, focusKey, step, shortcuts, openCreate, openCreateEvent, setFocusKey])

  const dateLabel = useMemo(() => {
    if (view === 'week' || view === 'review') return formatWeekLabel(focusKey, settings.weekStartsOn)
    if (view === 'month') return formatMonthLabel(focusKey)
    return relativeDayLabel(focusKey)
  }, [view, focusKey, settings.weekStartsOn])

  const ThemeIcon = THEME_ICON[theme]

  /* Built from the same handlers the sidebar buttons and keyboard shortcuts
     already call — a palette entry can't drift from what its equivalent
     button does, because there is no separate implementation to drift. */
  const paletteActions = useMemo(
    () => [
      { id: 'view-dashboard', label: 'Go to Dashboard', Icon: DashboardIcon, onRun: () => setView('dashboard') },
      { id: 'view-day', label: 'Go to Day', Icon: DayIcon, onRun: () => setView('today') },
      { id: 'view-week', label: 'Go to Week', Icon: WeekIcon, onRun: () => setView('week') },
      { id: 'view-month', label: 'Go to Month', Icon: MonthIcon, onRun: () => setView('month') },
      { id: 'view-review', label: 'Go to Review', Icon: TrendIcon, onRun: () => setView('review') },
      { id: 'view-focus', label: 'Go to Focus', Icon: FocusIcon, onRun: () => setView('focus') },
      {
        id: 'new-task',
        label: 'New task',
        hint: shortcuts.newTask,
        Icon: PlusIcon,
        onRun: () => openCreate(SCHEDULE_VIEWS.includes(view) ? { date: focusKey } : {}),
      },
      {
        id: 'new-event',
        label: 'New event',
        hint: shortcuts.newEvent,
        Icon: SpanIcon,
        onRun: () =>
          openCreateEvent(
            SCHEDULE_VIEWS.includes(view)
              ? { startDate: focusKey, endDate: focusKey }
              : { startDate: todayKey(), endDate: todayKey() },
          ),
      },
      { id: 'jump-today', label: 'Jump to today', hint: shortcuts.jumpToday, Icon: ClockIcon, onRun: () => setFocusKey(todayKey()) },
      { id: 'open-tags', label: 'Open Tags', Icon: TagIcon, onRun: () => setTagsOpen(true) },
      { id: 'open-items', label: 'Open All items', Icon: ListIcon, onRun: () => setItemsOpen(true) },
      { id: 'open-settings', label: 'Open Settings', Icon: SettingsIcon, onRun: () => setSettingsOpen(true) },
      // One entry per saved template (TaskEditor's "Save as template") —
      // opens the same create form "New task" does, just pre-filled, so a
      // template is reviewed before it becomes a real task rather than
      // silently created.
      ...templates.map((template) => ({
        id: `template-${template.id}`,
        label: `New: ${template.title}`,
        hint: 'template',
        Icon: PlusIcon,
        onRun: () =>
          openCreate({
            title: template.title,
            tagId: template.tagId,
            durationMin: template.durationMin,
            priority: template.priority,
            date: SCHEDULE_VIEWS.includes(view) ? focusKey : undefined,
          }),
      })),
    ],
    [view, focusKey, templates, shortcuts, openCreate, openCreateEvent, setFocusKey],
  )

  /* Typing "lunch with Ana tomorrow 1pm" into the palette offers to create
     exactly that. The parse is only ever used to PRE-FILL the create form —
     never to save straight from here — so a misread date is one glance away
     from being corrected rather than something discovered days later.

     Offered only when the text yields something the plain "New task" action
     wouldn't have: a date, a time, or a length. Without that, this would be
     a second, noisier copy of "New task" on every keystroke. */
  const quickAdd = useCallback(
    (query) => {
      const text = query.trim()
      if (text.length < 3) return null
      const parsed = parseQuickAdd(text, { today: todayKey() })
      if (!parsed.title || (parsed.date === null && parsed.startMin === null && parsed.durationMin === null)) {
        return null
      }

      const when = [
        parsed.date && relativeDayLabel(parsed.date),
        parsed.startMin !== null && minToShortLabel(parsed.startMin),
        parsed.durationMin !== null && durationLabel(parsed.durationMin),
      ]
        .filter(Boolean)
        .join(' · ')

      return {
        id: 'quick-add',
        label: `Create "${parsed.title}"`,
        hint: when,
        Icon: PlusIcon,
        onRun: () =>
          openCreate({
            title: parsed.title,
            date: parsed.date ?? undefined,
            startMin: parsed.startMin ?? undefined,
            durationMin: parsed.durationMin ?? undefined,
          }),
      }
    },
    [openCreate],
  )

  /* Global search, folded into the palette rather than given a surface of
     its own: "find that thing" and "go do that thing" are the same reflex,
     and every task and event is already in memory — this is a filter over
     what ScheduleContext holds, not a query.

     Called only once the query is worth acting on. A single character
     matches most of an account and would bury the fixed actions above under
     a wall of rows the moment anyone starts typing. */
  const searchItems = useCallback(
    (query) => {
      const needle = query.trim().toLowerCase()
      if (needle.length < 2) return []
      const found = []
      for (const task of tasks) {
        if (found.length >= SEARCH_LIMIT) break
        if (!task.title.toLowerCase().includes(needle)) continue
        found.push({
          id: `search-task-${task.id}`,
          label: task.title,
          hint: task.recurrence ? 'repeats' : (task.date ?? 'inbox'),
          Icon: task.recurrence ? RepeatIcon : DayIcon,
          onRun: () => openEdit(task),
        })
      }
      for (const item of events) {
        if (found.length >= SEARCH_LIMIT * 2) break
        if (!item.title.toLowerCase().includes(needle)) continue
        found.push({
          id: `search-event-${item.id}`,
          label: item.title,
          hint: item.recurrence ? 'repeats' : item.startDate,
          Icon: SpanIcon,
          onRun: () => openEditEvent(item),
        })
      }
      return found
    },
    [tasks, events, openEdit, openEditEvent],
  )

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
          <PlusIcon className="button-icon" />
          <span className="sidebar__new-label">New task</span>
        </button>

        {/* Two stacked buttons rather than a split menu: there are exactly two
            kinds, and hiding one behind a disclosure would cost a click to
            save nothing. */}
        <button
          type="button"
          className="ghost-button sidebar__new-event"
          onClick={() => openCreateEvent({ startDate: focusKey, endDate: focusKey })}
        >
          <SpanIcon className="button-icon" />
          <span className="sidebar__new-label">New event</span>
        </button>

        <nav className="sidebar__nav" aria-label="Views">
          {NAV_ITEMS.map((item) => {
            const active = item.id === 'schedule' ? SCHEDULE_VIEWS.includes(view) : view === item.id
            return (
              <button
                key={item.id}
                type="button"
                className={`sidebar__link${active ? ' sidebar__link--active' : ''}`}
                aria-current={active ? 'page' : undefined}
                title={item.label}
                onClick={() => setView(item.id === 'schedule' ? (SCHEDULE_VIEWS.includes(view) ? view : 'today') : item.id)}
              >
                <item.Icon className="sidebar__icon" />
                <span className="sidebar__label">{item.label}</span>
              </button>
            )
          })}
        </nav>

        {/* The things that open a manager rather than change the view —
            grouped so the rule dividing them from the nav is drawn once, and
            so they move together when the nav leaves for the bottom bar on a
            narrow screen. */}
        <div className="sidebar__tools">
          {/* title= carries the label for a mouse on a narrow window, where
              these go icon-only and the text is left to screen readers. */}
          <button
            type="button"
            className="sidebar__link"
            title="Tags"
            onClick={() => setTagsOpen(true)}
          >
            <TagIcon className="sidebar__icon" />
            <span className="sidebar__label">Tags</span>
          </button>
          <button
            type="button"
            className="sidebar__link"
            title="All items"
            onClick={() => setItemsOpen(true)}
          >
            <ListIcon className="sidebar__icon" />
            <span className="sidebar__label">All items</span>
          </button>
          <button
            type="button"
            className="sidebar__link"
            title="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon className="sidebar__icon" />
            <span className="sidebar__label">Settings</span>
          </button>
        </div>

        <div className="sidebar__spacer" />

        {/* Signing out used to be a hidden second meaning of clicking your own
            avatar — undiscoverable, and one stray click from ending the
            session. It gets its own labelled row above the footer rule; the
            avatar below opens the full Account modal (photo, sign-in method,
            delete account) instead of a quick sign-out shortcut, so this is
            the one-click way out again now that the avatar is a heavier
            door. */}
        {/* <button
          type="button"
          className="sidebar__link sidebar__signout"
          title="Log out"
          onClick={signOut}
        >
          <LogOutIcon className="sidebar__icon" />
          <span className="sidebar__label">Log out</span>
        </button> */}

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
          <AccountMenu />
        </div>
      </aside>

      <div className="app-content">
        <header className={`app__header${step ? ' app__header--schedule' : ''}`}>
          {step ? (
            <>
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

              <div className="view-tabs" role="tablist" aria-label="Schedule view">
                {SCHEDULE_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={view === tab.id}
                    className={`view-tabs__tab${view === tab.id ? ' view-tabs__tab--active' : ''}`}
                    onClick={() => setView(tab.id)}
                  >
                    <tab.Icon className="view-tabs__icon" />
                    {tab.label}
                  </button>
                ))}
              </div>
            </>
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
              {view === 'review' && <ReviewView focusKey={focusKey} />}
              {/* Always mounted, just hidden off-screen when another view is
                  showing — a running round has to keep counting down while
                  you check the schedule, not restart from 25:00 the moment
                  you tab away and back. */}
              <div hidden={view !== 'focus'}>
                <FocusMode onEdit={openEdit} />
              </div>
            </>
          )}
        </main>
      </div>

      {editor && editor.mode === 'view' && (
        <ItemDetail editor={editor} onClose={closeEditor} onEdit={startEditing} />
      )}

      {/* Keyed so that stepping from one day of a repeating task to the rule
          behind it rebuilds the form rather than keeping the old day's state.
          The kind is part of the key too, so switching Task/Event mid-create
          mounts the other form fresh instead of reusing the first one's state. */}
      {editor && editor.mode !== 'view' && editor.kind === 'event' && (
        <EventEditor
          key={editor.mode === 'edit' ? `event-${editor.event.id}` : 'create-event'}
          editor={editor}
          onClose={closeEditor}
          onChangeKind={changeEditorKind}
        />
      )}
      {editor && editor.mode !== 'view' && editor.kind !== 'event' && (
        <TaskEditor
          key={editor.mode === 'edit' ? editor.task.id : 'create-task'}
          editor={editor}
          onClose={closeEditor}
          onEditTask={editTaskDirect}
          onChangeKind={changeEditorKind}
        />
      )}
      {tagsOpen && <TagManager onClose={() => setTagsOpen(false)} />}
      {itemsOpen && (
        <ItemManager
          onClose={() => setItemsOpen(false)}
          onEdit={editFromIndex}
          onEditEvent={editEventFromIndex}
        />
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {paletteOpen && (
        <CommandPalette
          actions={paletteActions}
          searchItems={searchItems}
          quickAdd={quickAdd}
          onClose={() => setPaletteOpen(false)}
        />
      )}
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
    <ErrorBoundary>
      <ToastProvider>
        <SettingsProvider>
          <AuthProvider>
            <Gate />
          </AuthProvider>
        </SettingsProvider>
        <ToastStack />
      </ToastProvider>
    </ErrorBoundary>
  )
}
