/* The brand mark is a working clock, not a drawing of one — ClockIcon's hands
 * track the actual local time and the tab favicon redraws on the minute
 * boundary. These tests pin the instant (via the `now` prop / a fixed Date)
 * so they prove the geometry without waiting on timers: hands land at the
 * right angles, sweep smoothly with the smaller unit, and the favicon embeds
 * the same angles as its own SVG.
 */
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ClockIcon } from '../src/components/icons.jsx'
import { buildClockFavicon, clockHandAngles } from '../src/lib/liveFavicon.js'

const at = (hours, minutes, seconds = 0) => new Date(2026, 8, 16, hours, minutes, seconds)

describe('clockHandAngles', () => {
  it('points each hand straight up at midnight', () => {
    expect(clockHandAngles(at(0, 0))).toEqual({ hour: 0, minute: 0, second: 0 })
  })

  it('puts the hour hand at 90° at 3:00', () => {
    expect(clockHandAngles(at(3, 0)).hour).toBeCloseTo(90, 10)
  })

  it('sweeps the hour hand with the minutes (6:30 → 195°)', () => {
    expect(clockHandAngles(at(6, 30)).hour).toBeCloseTo(195, 10)
  })

  it('sweeps the minute hand with the seconds (9:15:30 → 93°)', () => {
    const angles = clockHandAngles(at(9, 15, 30))
    expect(angles.minute).toBeCloseTo(93, 10)
    expect(angles.second).toBeCloseTo(180, 10)
  })
})

describe('ClockIcon', () => {
  it('renders hour, minute, and second hands at the pinned time', () => {
    const { container } = render(<ClockIcon now={at(3, 0)} live={false} />)
    const svg = container.querySelector('svg')
    const rotations = [...svg.querySelectorAll('line')]
      .map((line) => line.getAttribute('transform'))
      .filter(Boolean)
    expect(rotations).toContain('rotate(90 12 12)')
    expect(rotations).toContain('rotate(0 12 12)')
    // Face ring plus a hub dot covering the hand joints.
    expect(svg.querySelector('circle[cx="12"][cy="12"][r="9"]')).toBeTruthy()
    expect(svg.querySelector('circle[r="1"]')).toBeTruthy()
  })
})

describe('buildClockFavicon', () => {
  it('embeds the same hand angles as a tab-ready SVG data URL', () => {
    const url = buildClockFavicon(at(3, 0))
    expect(url.startsWith('data:image/svg+xml,')).toBe(true)
    const svg = decodeURIComponent(url.slice('data:image/svg+xml,'.length))
    expect(svg).toContain('rotate(90 16 16)')
    expect(svg).toContain('rotate(0 16 16)')
  })
})
