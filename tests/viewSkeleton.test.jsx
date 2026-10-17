/* The loading state for each page has to be that page's own layout, or the
 * swap from skeleton to content shifts everything and the load reads as a
 * change of page rather than of data. These tests pin the property that makes
 * that hold: each skeleton reuses the real view's structural class names.
 * When a view's layout changes, its skeleton changes with it — there is no
 * second set of measurements to fall behind.
 *
 * The shared contract they must not break: nothing inside is readable text,
 * and the whole thing is announced once as a status.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ViewSkeleton } from '../src/components/shell/ViewSkeleton.jsx'

/** The structural classes each view keys its layout on — the ones its own
    component renders. A skeleton is right when it produces all of these. */
const LAYOUT = {
  dashboard: ['.dashboard__top', '.hero', '.mini-cal', '.tile-row', '.queue-row', '.stat-tile'],
  today: ['.day-layout', '.day-panel', '.now-next', '.grid-scroll', '.gutter', '.day-column'],
  week: ['.week', '.week__summary', '.week__head', '.week__allday', '.grid-body'],
  month: ['.month', '.month__head', '.month__grid', '.month__week', '.month__cell'],
  review: ['.review', '.chart', '.chart__columns', '.chart__bar', '.tag-bars', '.notes-list'],
  focus: ['.focus-page', '.focus__task-row', '.focus__timer', '.focus__clock', '.focus__controls'],
}

/** Each view's own root class. These are what tells one page from another —
    deliberately not the structural containers above, because several of those
    are shared by the real views on purpose: Day and Week are both a
    `.grid-scroll` over a `.grid-body`, and Dashboard and Review are both a
    `.tile-row`. A skeleton that borrowed one of those would be wrong; a real
    page that shares it is not. */
const ROOT = {
  dashboard: '.dashboard',
  today: '.day-layout',
  week: '.week',
  month: '.month',
  review: '.review',
  focus: '.focus-page',
}

const ALL_VIEWS = Object.keys(LAYOUT)

function skeleton(view) {
  const { container } = render(<ViewSkeleton view={view} />)
  return container
}

describe('ViewSkeleton', () => {
  it.each(ALL_VIEWS)('draws the %s layout in its own structural classes', (view) => {
    const container = skeleton(view)
    for (const selector of LAYOUT[view]) {
      expect(container.querySelector(selector), `${view} is missing ${selector}`).toBeTruthy()
    }
  })

  it.each(ALL_VIEWS)('%s shows its own page and no other', (view) => {
    const container = skeleton(view)
    for (const [other, root] of Object.entries(ROOT)) {
      const found = container.querySelector(root)
      if (other === view) expect(found, `${view} should have ${root}`).toBeTruthy()
      else expect(found, `${view} wrongly has ${root}`).toBeNull()
    }
  })

  it.each(ALL_VIEWS)('%s is announced once as a status, with no readable text', (view) => {
    const { container } = render(<ViewSkeleton view={view} />)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(container.textContent.trim()).toBe('')
  })

  it('fixes the counts the real layouts fix, so the block does not resize', () => {
    const week = skeleton('week')
    expect(week.querySelectorAll('.week__day').length).toBe(7)
    expect(week.querySelectorAll('.week__allday-cell').length).toBe(7)
    expect(week.querySelectorAll('.day-column').length).toBe(7)

    const month = skeleton('month')
    expect(month.querySelectorAll('.month__week').length).toBe(5)
    expect(month.querySelectorAll('.month__cell').length).toBe(35)
    expect(month.querySelectorAll('.month__dow').length).toBe(7)

    const review = skeleton('review')
    expect(review.querySelectorAll('.stat-tile').length).toBe(4)
    expect(review.querySelectorAll('.chart__band').length).toBe(7)

    expect(skeleton('dashboard').querySelectorAll('.stat-tile').length).toBe(4)
    expect(skeleton('dashboard').querySelectorAll('.mini-cal__grid > .skel').length).toBe(35)
  })

  it('falls back to the dashboard for a missing or unknown view', () => {
    expect(skeleton(undefined).querySelector('.view-skeleton.dashboard')).toBeTruthy()
    expect(skeleton('nope').querySelector('.view-skeleton.dashboard')).toBeTruthy()
  })
})