'use client'

import { useState } from 'react'
import { todayKey, relativeDayLabel } from '@cadence/shared/src/date.js'

// Incremental migration shell: same information architecture as src/App.jsx
// (Dashboard / Day / Week / Month / Review / Focus) and the same 900px
// responsive collapse (sidebar -> top bar + bottom tabs). Each view is moved
// verbatim as a client component; this shell proves routing + tokens first.
const VIEWS = ['dashboard', 'today', 'week', 'month', 'review', 'focus']

export default function HomePage() {
  const [view, setView] = useState('dashboard')
  const today = todayKey()

  return (
    <div className="web-shell">
      <aside className="web-sidebar">
        <div>Cadence</div>
        <nav className="web-nav" aria-label="Views">
          {VIEWS.map((id) => (
            <button
              key={id}
              type="button"
              aria-current={view === id ? 'page' : undefined}
              onClick={() => setView(id)}
            >
              {id}
            </button>
          ))}
        </nav>
      </aside>
      <div className="web-content">
        <header>
          <span>{relativeDayLabel(today)}</span>
        </header>
        <main>
          <p>
            View: {view} — migrated incrementally from <code>src/App.jsx</code>. Output unchanged by
            design.
          </p>
          <p>
            <a href="/dashboard">Dashboard</a> · <a href="/today">Day</a>
          </p>
        </main>
      </div>
    </div>
  )
}
