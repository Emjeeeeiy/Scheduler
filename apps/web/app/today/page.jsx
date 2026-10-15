'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ToastProvider } from '../../state/ToastContext.jsx'
import { SettingsProvider } from '../../state/SettingsContext.jsx'
import { AuthProvider, useAuth } from '../../state/AuthContext.jsx'
import { ScheduleProvider } from '../../state/ScheduleContext.jsx'
import { useEditorStack } from '../../state/useEditorStack.js'
import { usePersistentState } from '../../lib/usePersistentState.js'
import { TodayView } from '../../components/views/TodayView.jsx'
import { EditorModals } from '../../components/shell/EditorModals.jsx'
import { firebaseReady, missingConfigKeys } from '../../lib/firebase.js'
import { isValidKey, todayKey } from '@cadence/shared/src/date.js'

import '../../../../src/styles/shell.css'
import '../../../../src/styles/dashboard.css'
import '../../../../src/styles/calendar.css'
import '../../../../src/styles/modals.css'
import '../../../../src/styles/toggles-responsive.css'
import '../../../../src/styles/calendar-dnd.css'

function TodayRoute() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const stack = useEditorStack()
  const params = useSearchParams()
  const [planSignal, setPlanSignal] = useState(0)

  // Same restore-and-snap-forward cursor as src/App.jsx: a stored day that
  // already passed snaps to today on restore, never on later renders.
  // A ?focusKey= param (from Dashboard's "Go to") wins for this visit.
  const [focusKey, setFocusKey] = usePersistentState('cadence-app:focus', todayKey, (stored) =>
    isValidKey(stored) && stored >= todayKey() ? stored : todayKey(),
  )
  const paramKey = params.get('focusKey')
  const activeKey = isValidKey(paramKey) ? paramKey : focusKey
  const setActiveKey = (key) => {
    setFocusKey(key)
    if (paramKey) router.replace('/today')
  }

  if (!firebaseReady) {
    return <p>Missing Firebase config: {missingConfigKeys.join(', ')}</p>
  }
  if (loading) return <p className="empty">Loading your schedule…</p>
  if (!user) {
    router.replace('/signin')
    return <p className="empty">Sign in required — redirecting…</p>
  }

  return (
    <>
      <button type="button" className="ghost-button" onClick={() => setActiveKey(todayKey())}>
        Today
      </button>
      <button type="button" className="ghost-button" onClick={() => setPlanSignal((n) => n + 1)}>
        Plan my day
      </button>
      <TodayView
        focusKey={activeKey}
        planSignal={planSignal}
        onEdit={stack.openEdit}
        onCreate={stack.openCreate}
        onEditEvent={stack.openEditEvent}
        onCreateEvent={stack.openCreateEvent}
      />
      <EditorModals stack={stack} />
    </>
  )
}

export default function TodayPage() {
  return (
    <ToastProvider>
      <SettingsProvider>
        <AuthProvider>
          <ScheduleProvider>
            {/* useSearchParams needs a Suspense boundary in the App Router */}
            <Suspense fallback={<p className="empty">Loading your schedule…</p>}>
              <TodayRoute />
            </Suspense>
          </ScheduleProvider>
        </AuthProvider>
      </SettingsProvider>
    </ToastProvider>
  )
}
