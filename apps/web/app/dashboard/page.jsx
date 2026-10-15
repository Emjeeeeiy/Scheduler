'use client'

import { useRouter } from 'next/navigation'
import { ToastProvider } from '../../state/ToastContext.jsx'
import { SettingsProvider } from '../../state/SettingsContext.jsx'
import { AuthProvider, useAuth } from '../../state/AuthContext.jsx'
import { ScheduleProvider } from '../../state/ScheduleContext.jsx'
import { useEditorStack } from '../../state/useEditorStack.js'
import { Dashboard } from '../../components/views/Dashboard.jsx'
import { EditorModals } from '../../components/shell/EditorModals.jsx'
import { firebaseReady, missingConfigKeys } from '../../lib/firebase.js'

// Same cascade order as src/App.jsx for the classes Dashboard renders.
import '../../../../src/styles/shell.css'
import '../../../../src/styles/dashboard.css'
import '../../../../src/styles/calendar.css'
import '../../../../src/styles/modals.css'
import '../../../../src/styles/toggles-responsive.css'

function DashboardRoute() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const stack = useEditorStack()

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
      <Dashboard
        onFocusDay={(key) => router.push(`/today?focusKey=${key}`)}
        onFocusMonth={(key) => router.push(`/?view=month&focusKey=${key}`)}
        onEdit={stack.openEdit}
        onCreate={stack.openCreate}
      />
      <EditorModals stack={stack} />
    </>
  )
}

export default function DashboardPage() {
  return (
    <ToastProvider>
      <SettingsProvider>
        <AuthProvider>
          <ScheduleProvider>
            <DashboardRoute />
          </ScheduleProvider>
        </AuthProvider>
      </SettingsProvider>
    </ToastProvider>
  )
}
