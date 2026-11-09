/* The week on the sign-in screen: a miniature of the Schedule page's time grid,
 * filled with made-up appointments, that draws itself in a loop. The loop is CSS,
 * so what is worth holding to account is the structure it animates and the data
 * behind it: that the week is the real current week, that the made-up schedule is
 * a schedule that could exist (no overlaps, inside the window, titles short enough
 * for a 32px column), and that every colour it asks for comes from the theme, so
 * the preview is light or dark with the rest of the screen.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dayOfMonth, formatWeekLabel, weekKeys } from '@cadence/shared/date.js'
import { AuthWeek } from '../src/components/auth/AuthWeek.jsx'
import {
  BLOCKS,
  FIRST_HOUR,
  HOURS,
  HOUR_LABELS,
  SHORT_BELOW,
  SHOWS_TIME_FROM,
  clock,
} from '../src/components/auth/authWeekPlan.js'

const setToday = (iso) => vi.setSystemTime(new Date(`${iso}T10:30:00`))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  setToday('2026-11-11') // a Wednesday
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const blocks = (container) => [...container.querySelectorAll('.auth-week__block')]
const columns = (container) => [...container.querySelectorAll('.auth-week__col')]

describe('the week', () => {
  it('is the current week, labelled the way the real calendar labels it', () => {
    const { container } = render(<AuthWeek />)
    expect(container.querySelector('.auth-week__label').textContent).toBe(formatWeekLabel('2026-11-11', 1))
  })

  it('shows Monday to Friday with their dates', () => {
    const { container } = render(<AuthWeek />)
    const heads = [...container.querySelectorAll('.auth-week__day')]
    expect(heads.map((el) => el.querySelector('.auth-week__dow').textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri'])
    expect(heads.map((el) => el.querySelector('.auth-week__date').textContent)).toEqual(
      weekKeys('2026-11-11', 1).slice(0, 5).map((key) => String(dayOfMonth(key))),
    )
  })

  it('marks today with the ink circle', () => {
    const { container } = render(<AuthWeek />)
    const today = container.querySelectorAll('.auth-week__day--today')
    expect(today).toHaveLength(1)
    expect(today[0].querySelector('.auth-week__date').textContent).toBe('11')
  })

  it('marks no day when today is not a weekday of the week shown', () => {
    setToday('2026-11-15') // a Sunday: the week is still Nov 9–15, but only Mon–Fri are drawn
    const { container } = render(<AuthWeek />)
    expect(container.querySelectorAll('.auth-week__day--today')).toHaveLength(0)
    expect(container.querySelector('.auth-week__label').textContent).toBe(formatWeekLabel('2026-11-15', 1))
  })

  it('has an hour mark for each hour of its window', () => {
    const { container } = render(<AuthWeek />)
    const marks = [...container.querySelectorAll('.auth-week__mark')]
    expect(marks.map((el) => el.textContent)).toEqual(HOUR_LABELS)
    expect(marks.map((el) => el.style.getPropertyValue('--h'))).toEqual(HOUR_LABELS.map((_, index) => String(index)))
  })
})

describe('the blocks', () => {
  it('draws every block of the plan, in its own day column', () => {
    const { container } = render(<AuthWeek />)
    expect(blocks(container)).toHaveLength(BLOCKS.length)
    columns(container).forEach((column, day) => {
      const expected = BLOCKS.filter((block) => block.day === day).map((block) => block.title)
      expect([...column.querySelectorAll('.auth-week__title')].map((el) => el.textContent)).toEqual(expected)
    })
  })

  it('numbers them in the order they get planned, for the staggered drawing', () => {
    const { container } = render(<AuthWeek />)
    expect(blocks(container).map((el) => el.style.getPropertyValue('--b')).sort((a, b) => a - b)).toEqual(
      BLOCKS.map((_, index) => String(index)).sort((a, b) => a - b),
    )
    // Column by column, top to bottom: the order is also the document order.
    const inDomOrder = [...container.querySelectorAll('.auth-week__block')].map((el) => Number(el.style.getPropertyValue('--b')))
    expect(inDomOrder).toEqual([...inDomOrder].sort((a, b) => a - b))
  })

  it('places each by its start and length in hours from the top of the grid', () => {
    const { container } = render(<AuthWeek />)
    blocks(container).forEach((el) => {
      const block = BLOCKS[Number(el.style.getPropertyValue('--b'))]
      expect(Number(el.style.getPropertyValue('--at'))).toBeCloseTo((block.at - FIRST_HOUR * 60) / 60)
      expect(Number(el.style.getPropertyValue('--len'))).toBeCloseTo(block.len / 60)
    })
  })

  it('colours each with a tag token, as the real time grid does', () => {
    const { container } = render(<AuthWeek />)
    for (const el of blocks(container)) {
      expect(el.style.getPropertyValue('--tag')).toMatch(/^var\(--color-tag-(blue|orange|aqua|violet)\)$/)
    }
  })

  it('gives a time line only to blocks tall enough for a second line', () => {
    const { container } = render(<AuthWeek />)
    for (const el of blocks(container)) {
      const block = BLOCKS[Number(el.style.getPropertyValue('--b'))]
      const time = el.querySelector('.auth-week__time')
      if (block.len >= SHOWS_TIME_FROM) expect(time?.textContent).toBe(clock(block.at))
      else expect(time).toBeNull()
    }
  })

  it('drops the padding of a block under 45 minutes, and only those', () => {
    const { container } = render(<AuthWeek />)
    const short = blocks(container).filter((el) => el.classList.contains('auth-week__block--short'))
    expect(short).toHaveLength(BLOCKS.filter((block) => block.len < SHORT_BELOW).length)
    expect(short.length).toBeGreaterThan(0)
  })
})

describe('the made-up schedule', () => {
  it('stays inside the window the grid shows', () => {
    for (const block of BLOCKS) {
      expect(block.at, block.title).toBeGreaterThanOrEqual(FIRST_HOUR * 60)
      expect(block.at + block.len, block.title).toBeLessThanOrEqual((FIRST_HOUR + HOURS) * 60)
    }
    expect(HOUR_LABELS).toHaveLength(HOURS)
  })

  it('is a schedule that could exist: nothing overlaps within a day', () => {
    for (let day = 0; day < 5; day++) {
      const today = BLOCKS.filter((block) => block.day === day).sort((a, b) => a.at - b.at)
      for (let i = 1; i < today.length; i++) {
        expect(today[i].at, `day ${day}: ${today[i - 1].title} / ${today[i].title}`).toBeGreaterThanOrEqual(today[i - 1].at + today[i - 1].len)
      }
    }
  })

  it('has something on every weekday, listed day by day', () => {
    for (let day = 0; day < 5; day++) expect(BLOCKS.some((block) => block.day === day), `day ${day}`).toBe(true)
    const days = BLOCKS.map((block) => block.day)
    expect(days).toEqual([...days].sort((a, b) => a - b))
  })

  it('keeps every title to four characters, which is what a 32px column holds', () => {
    for (const block of BLOCKS) expect(block.title.length, block.title).toBeLessThanOrEqual(4)
  })

  it('takes its tag colours from the theme: the sign-in screen pins none, and every one exists for both themes', () => {
    // The sign-in screen follows the theme chosen in Settings, so its preview week
    // must too. A tag token re-declared on .auth-shell would pin it to one theme.
    const auth = readFileSync(resolve(process.cwd(), 'src/styles/auth.css'), 'utf8')
    const shell = auth.slice(auth.indexOf('.auth-shell {'), auth.indexOf('}', auth.indexOf('.auth-shell {')))
    const tokens = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8')
    for (const tag of new Set(BLOCKS.map((block) => block.tag))) {
      expect(shell, `--color-tag-${tag} is pinned in .auth-shell`).not.toMatch(`--color-tag-${tag}:`)
      // Declared once for light and at least once more for dark.
      const declared = tokens.match(new RegExp(`--color-tag-${tag}:`, 'g')) ?? []
      expect(declared.length, `--color-tag-${tag} needs a light and a dark value`).toBeGreaterThanOrEqual(2)
    }
  })

  it('formats a start time as a clock', () => {
    expect(clock(9 * 60)).toBe('9:00')
    expect(clock(10 * 60 + 30)).toBe('10:30')
    expect(clock(13 * 60 + 5)).toBe('13:05')
  })
})

describe('as a decoration', () => {
  it('is one picture to a screen reader', () => {
    const { container } = render(<AuthWeek />)
    expect(screen.getByRole('img', { name: /week of scheduled blocks/i })).toBeTruthy()
    for (const part of ['.auth-week__head', '.auth-week__days', '.auth-week__body']) {
      expect(container.querySelector(part).getAttribute('aria-hidden'), part).toBe('true')
    }
  })

  it('offers nothing to press or tab to', () => {
    const { container } = render(<AuthWeek />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(container.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0)
  })
})
