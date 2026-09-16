/* Gate's loading state is a skeleton of the app shell, not a text line: it
 * must still announce itself to assistive tech (role=status with the same
 * label the old line carried) while rendering shimmer shapes instead of
 * readable text.
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

  it('renders the shell silhouette: rail, header, and cards', () => {
    const { container } = render(<SessionSkeleton />)
    expect(container.querySelector('.session-skeleton__rail')).toBeTruthy()
    expect(container.querySelector('.session-skeleton__main')).toBeTruthy()
    expect(container.querySelectorAll('.session-skeleton__nav .skel').length).toBe(4)
    expect(container.querySelectorAll('.session-skeleton__cards .skel').length).toBe(3)
  })
})
