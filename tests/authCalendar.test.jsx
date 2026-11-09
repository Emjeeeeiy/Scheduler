/* The calendar on the sign-in screen: a decorative month, drawn like the
 * Dashboard's, that plans itself in a loop. The loop is CSS, so what is worth
 * testing is the structure it animates — that it is always a real month, that
 * the days it "plans" are always days of that month, and that it is described
 * as one picture and offers nothing to press.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatMonthLabel, monthGrid, monthOf } from '@cadence/shared/date.js'
import { AuthCalendar } from '../src/components/auth/AuthCalendar.jsx'

const setToday = (iso) => vi.setSystemTime(new Date(`${iso}T10:30:00`))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  setToday('2026-11-07')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const days = (container) => [...container.querySelectorAll('.auth-cal__day')]

describe('the month', () => {
  it('is the current month, headed by its name', () => {
    const { container } = render(<AuthCalendar />)
    expect(container.querySelector('.auth-cal__label').textContent).toBe(formatMonthLabel('2026-11-07'))
  })

  it('has a weekday header of seven letters, Monday first', () => {
    const { container } = render(<AuthCalendar />)
    const letters = [...container.querySelectorAll('.auth-cal__dow span')].map((el) => el.textContent)
    expect(letters).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S'])
  })

  it('is whole weeks of the same grid the Dashboard draws', () => {
    const { container } = render(<AuthCalendar />)
    const expected = monthGrid('2026-11-07', 1)
    expect(days(container)).toHaveLength(expected.length)
    expect(days(container).length % 7).toBe(0)
    expect(days(container).map((el) => el.querySelector('.auth-cal__num').textContent)).toEqual(
      expected.map((key) => String(Number(key.slice(8)))),
    )
  })

  it('marks today once, and marks the days of neighbouring months as outside', () => {
    const { container } = render(<AuthCalendar />)
    expect(container.querySelectorAll('.auth-cal__day--today')).toHaveLength(1)
    expect(container.querySelector('.auth-cal__day--today .auth-cal__num').textContent).toBe('7')
    const inMonth = monthGrid('2026-11-07', 1).filter((key) => monthOf(key) === monthOf('2026-11-07'))
    expect(days(container).filter((el) => !el.classList.contains('auth-cal__day--outside'))).toHaveLength(inMonth.length)
  })

  it('moves on with the calendar', () => {
    setToday('2027-02-14')
    const { container } = render(<AuthCalendar />)
    expect(container.querySelector('.auth-cal__label').textContent).toBe(formatMonthLabel('2027-02-14'))
    expect(container.querySelector('.auth-cal__day--today .auth-cal__num').textContent).toBe('14')
  })
})

describe('what it plans', () => {
  const planned = (container) => days(container).filter((el) => el.style.getPropertyValue('--t') !== '')

  it('plans nine days, in order, and shows their load as dots', () => {
    const { container } = render(<AuthCalendar />)
    const order = planned(container).map((el) => Number(el.style.getPropertyValue('--t')))
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    const dots = planned(container).map((el) => el.querySelectorAll('.auth-cal__dot').length)
    expect(dots).toEqual([1, 2, 1, 2, 3, 1, 1, 2, 1])
    expect(container.querySelectorAll('.auth-cal__dot')).toHaveLength(14)
  })

  it('numbers each dot within its day so they can arrive one after another', () => {
    const { container } = render(<AuthCalendar />)
    const threeDots = planned(container).find((el) => el.querySelectorAll('.auth-cal__dot').length === 3)
    expect([...threeDots.querySelectorAll('.auth-cal__dot')].map((d) => d.style.getPropertyValue('--d'))).toEqual(['0', '1', '2'])
  })

  it('fills three of them as event days', () => {
    const { container } = render(<AuthCalendar />)
    expect(container.querySelectorAll('.auth-cal__day--event')).toHaveLength(3)
  })

  it('gives every day its place in the grid, for the staggered arrival', () => {
    const { container } = render(<AuthCalendar />)
    expect(days(container).map((el) => el.style.getPropertyValue('--i'))).toEqual(days(container).map((_, i) => String(i)))
  })

  it('only ever plans days of the month shown — in any month, with five rows or six', () => {
    for (let month = 0; month < 36; month++) {
      const date = new Date(2026, month, 15)
      setToday(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-15`)
      const { container, unmount } = render(<AuthCalendar />)
      const all = days(container)
      for (const el of planned(container)) {
        expect(el.classList.contains('auth-cal__day--outside'), `month ${month}`).toBe(false)
      }
      expect(planned(container)).toHaveLength(9)
      expect(all.length === 35 || all.length === 42, `month ${month}: ${all.length} cells`).toBe(true)
      unmount()
    }
  })
})

describe('as a decoration', () => {
  it('is one picture to a screen reader, not sixty cells', () => {
    const { container } = render(<AuthCalendar />)
    expect(screen.getByRole('img', { name: /month calendar filling up/i })).toBeTruthy()
    for (const part of ['.auth-cal__head', '.auth-cal__dow', '.auth-cal__grid']) {
      expect(container.querySelector(part).getAttribute('aria-hidden'), part).toBe('true')
    }
  })

  it('offers nothing to press or tab to', () => {
    const { container } = render(<AuthCalendar />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(container.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0)
  })
})
