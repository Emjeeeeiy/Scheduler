/* The bar charts hold their entrance until they are looked at (useRevealOnView),
 * and two things about that are worth pinning because a failure of either is
 * silent in the other direction:
 *
 *  - Where nothing can watch for visibility (no IntersectionObserver — jsdom, an old
 *    browser, a server render) a chart must NOT be held back: `seen` starts true and
 *    the chart is simply drawn. A chart stuck waiting for an event that never comes
 *    would be a chart stuck at zero.
 *  - Where something can, the chart starts held (`chart--idle`) and flips to
 *    `chart--in` only when it actually intersects, then stays there for good.
 *
 * The animation itself is CSS and is checked by chartMotion.test.js; this is the
 * switch that decides which class the CSS sees.
 */
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BarChart } from '../src/components/stats/BarChart.jsx'
import { GoalBars } from '../src/components/stats/GoalBars.jsx'
import { TagBars } from '../src/components/stats/TagBars.jsx'
import { useRevealOnView } from '../src/lib/useRevealOnView.js'

const row = (key, plannedMin, completedMin) => ({
  key,
  label: key,
  short: key,
  plannedMin,
  completedMin,
  count: 2,
  doneCount: 1,
})
const ROWS = [row('Mon', 120, 60), row('Tue', 240, 240)]
const TAG_ROWS = [{ id: 'a', tag: { id: 'a', name: 'Work', color: '#4e8df5' }, plannedMin: 90, completedMin: 30, count: 1 }]
const GOALS = [{ id: 'g', name: 'Work', color: '#4e8df5', plannedMin: 90, goalMinutes: 180 }]

/** A stand-in IntersectionObserver the test can fire by hand. */
function installObserver() {
  const instances = []
  class FakeObserver {
    constructor(callback) {
      this.callback = callback
      this.observe = vi.fn()
      this.disconnect = vi.fn()
      instances.push(this)
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeObserver)
  const fire = (isIntersecting) =>
    act(() => {
      for (const instance of instances) instance.callback([{ isIntersecting }])
    })
  return { instances, fire }
}

function Probe() {
  const [ref, seen] = useRevealOnView()
  return <div ref={ref} data-testid="probe" data-seen={String(seen)} />
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('useRevealOnView', () => {
  it('is seen at once where there is no IntersectionObserver to wait for', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { getByTestId } = render(<Probe />)
    expect(getByTestId('probe').dataset.seen).toBe('true')
  })

  it('waits for the element to intersect, then stays seen and stops watching', () => {
    const { instances, fire } = installObserver()
    const { getByTestId } = render(<Probe />)
    expect(getByTestId('probe').dataset.seen).toBe('false')
    expect(instances[0].observe).toHaveBeenCalledWith(getByTestId('probe'))

    // Merely existing, or scrolling past without intersecting, is not being seen.
    fire(false)
    expect(getByTestId('probe').dataset.seen).toBe('false')

    fire(true)
    expect(getByTestId('probe').dataset.seen).toBe('true')
    expect(instances[0].disconnect).toHaveBeenCalled()
  })
})

describe('the bar charts', () => {
  it('draw straight away where nothing can watch for visibility', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    for (const ui of [
      <BarChart key="b" rows={ROWS} label="Planned" />,
      <TagBars key="t" rows={TAG_ROWS} label="Tags" />,
      <GoalBars key="g" rows={GOALS} label="Goals" />,
    ]) {
      const { container, unmount } = render(ui)
      expect(container.querySelector('figure.chart--in')).toBeTruthy()
      expect(container.querySelector('.chart--idle')).toBeNull()
      unmount()
    }
  })

  it('start held and come in once they intersect', () => {
    const { fire } = installObserver()
    const { container } = render(
      <>
        <BarChart rows={ROWS} label="Planned" />
        <TagBars rows={TAG_ROWS} label="Tags" />
        <GoalBars rows={GOALS} label="Goals" />
      </>,
    )
    const figures = [...container.querySelectorAll('figure.chart')]
    expect(figures).toHaveLength(3)
    for (const figure of figures) expect(figure.className).toContain('chart--idle')

    fire(true)
    for (const figure of figures) {
      expect(figure.className).toContain('chart--in')
      expect(figure.className).not.toContain('chart--idle')
    }
  })

  it('hand the stylesheet each bar its size and its turn as custom properties', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { container } = render(<BarChart rows={ROWS} label="Planned" />)
    const [mon, tue] = container.querySelectorAll('.chart__band')
    // Tue is the busiest, so it sets the axis; Mon is half of it.
    expect(tue.querySelector('.chart__bar').style.getPropertyValue('--h')).toBe('100%')
    expect(mon.querySelector('.chart__bar').style.getPropertyValue('--h')).toBe('50%')
    expect(mon.querySelector('.chart__fill').style.getPropertyValue('--h')).toBe('50%')
    // One column after another, in order.
    expect(mon.style.getPropertyValue('--delay')).toBe('0ms')
    expect(tue.style.getPropertyValue('--delay')).toBe('40ms')
  })

  it('spread a long range over a fixed span instead of a fixed step', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const many = Array.from({ length: 30 }, (_, index) => row(`d${index}`, 60, 30))
    const { container } = render(<BarChart rows={many} label="Planned" />)
    const delays = [...container.querySelectorAll('.chart__band')].map((band) =>
      Number.parseInt(band.style.getPropertyValue('--delay'), 10),
    )
    // The whole ripple takes 400ms however many columns there are, and no column
    // waits for the one before it by more than the 40ms a short range uses — so the
    // last eighteen do not all start at once.
    expect(delays[0]).toBe(0)
    expect(delays.at(-1)).toBe(400)
    for (let i = 1; i < delays.length; i += 1) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1])
      expect(delays[i] - delays[i - 1]).toBeLessThanOrEqual(40)
    }
  })
})

describe('switching the range', () => {
  const week = [row('a', 60, 30), row('b', 120, 60)]
  const month = [row('x', 60, 30), row('y', 60, 30), row('z', 180, 90)]
  const live = (container) => container.querySelector('.chart__columns:not(.chart__columns--leaving)')

  afterEach(() => vi.useRealTimers())

  it('hands the old range to a ghost layer that clears itself, and mounts the new one afresh', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    vi.useFakeTimers()
    const { container, rerender } = render(<BarChart rows={week} label="Planned" />)
    const before = live(container)
    expect(container.querySelector('.chart__columns--leaving')).toBeNull()
    expect(before.style.getPropertyValue('--lead')).toBe('0ms')

    rerender(<BarChart rows={month} label="Planned" />)

    // The ghost is the old range, as bars only: nothing in it can be focused or read.
    const ghost = container.querySelector('.chart__columns--leaving')
    expect(ghost.getAttribute('aria-hidden')).toBe('true')
    expect(ghost.querySelectorAll('.chart__band')).toHaveLength(2)
    expect(ghost.querySelector('button')).toBeNull()
    // …at the heights it had: the old axis topped out at b's 2h.
    expect(ghost.querySelectorAll('.chart__bar')[1].style.getPropertyValue('--h')).toBe('100%')

    // The live columns are the new range, mounted afresh and a beat behind the ghost.
    const after = live(container)
    expect(after).not.toBe(before)
    expect(after.querySelectorAll('.chart__band')).toHaveLength(3)
    expect(after.style.getPropertyValue('--lead')).toBe('120ms')

    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(container.querySelector('.chart__columns--leaving')).toBeNull()
  })

  it('works the other way round too, and a quick second switch replaces the ghost', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    vi.useFakeTimers()
    const { container, rerender } = render(<BarChart rows={month} label="Planned" />)
    rerender(<BarChart rows={week} label="Planned" />)
    expect(container.querySelector('.chart__columns--leaving').querySelectorAll('.chart__band')).toHaveLength(3)

    rerender(<BarChart rows={month} label="Planned" />)
    const ghosts = container.querySelectorAll('.chart__columns--leaving')
    expect(ghosts).toHaveLength(1)
    expect(ghosts[0].querySelectorAll('.chart__band')).toHaveLength(2)

    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(container.querySelector('.chart__columns--leaving')).toBeNull()
  })

  it('does not treat new numbers for the same days as a new range', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { container, rerender } = render(<BarChart rows={week} label="Planned" />)
    const before = live(container)
    // A task was ticked off: same days, different heights. The bars should ease to
    // them (a CSS transition on the same elements), not leave and regrow.
    rerender(<BarChart rows={[row('a', 60, 60), row('b', 120, 120)]} label="Planned" />)
    expect(container.querySelector('.chart__columns--leaving')).toBeNull()
    expect(live(container)).toBe(before)
  })

  it('has nothing to leave before the chart has been seen', () => {
    installObserver()
    const { container, rerender } = render(<BarChart rows={week} label="Planned" />)
    rerender(<BarChart rows={month} label="Planned" />)
    expect(container.querySelector('.chart__columns--leaving')).toBeNull()
  })

  it('has nothing to leave when the range before it was empty', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const empty = [row('p', 0, 0), row('q', 0, 0)]
    const { container, rerender } = render(<BarChart rows={empty} label="Planned" />)
    rerender(<BarChart rows={month} label="Planned" />)
    expect(container.querySelector('.chart__columns--leaving')).toBeNull()
  })
})
