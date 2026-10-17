/* Gate's loading state is a skeleton of the app shell, not a text line: it
 * must still announce itself to assistive tech (role=status with the same
 * label the old line carried) while rendering shimmer shapes instead of
 * readable text.
 *
 * The content half is per-page rather than generic — it draws the page that is
 * coming — so these cover both halves: the shell silhouette stays put, and the
 * area where the view will mount is already that view's own layout.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SessionSkeleton } from '../src/components/shell/SessionSkeleton.jsx'

describe('SessionSkeleton', () => {
  it('announces the session check without a readable text line', () => {
    render(<SessionSkeleton />)
    expect(screen.getByRole('status', { name: /checking your session/i })).toBeTruthy()
    expect(screen.queryByText(/checking your session/i)).toBeNull()
  })

  it('renders the shell silhouette: the rail, and as many nav rows as the real rail has', () => {
    const { container } = render(<SessionSkeleton />)
    expect(container.querySelector('.session-skeleton__rail')).toBeTruthy()
    expect(container.querySelector('.session-skeleton__main')).toBeTruthy()
    // NAV_ITEMS has three entries; a fourth block would promise a row the real
    // rail never draws.
    expect(container.querySelectorAll('.session-skeleton__nav .skel').length).toBe(3)
  })

  it('draws the content half in the layout of the view it is given', () => {
    const { container } = render(<SessionSkeleton view="month" />)
    expect(container.querySelector('.view-skeleton.month')).toBeTruthy()
    expect(container.querySelectorAll('.month__cell').length).toBe(35)
    expect(container.querySelector('.week__head')).toBeNull()
  })

  it('falls back to the dashboard for a missing or unknown view', () => {
    const { container } = render(<SessionSkeleton view="nope" />)
    expect(container.querySelector('.view-skeleton.dashboard')).toBeTruthy()
  })
})