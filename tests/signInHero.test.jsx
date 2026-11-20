/* On a desktop the sign-in screen is one stage that shows either the hero or the
 * form, and a button at the far right of the topbar swaps them: "Log in" on the
 * hero, "Back" while the form is showing. Get started on the hero opens Sign up.
 * What is worth holding to account here:
 *
 * - it opens on the hero, and the form is still in the tree (one DOM at every width:
 *   a phone is shown the form by the stylesheet, not by this file);
 * - the button, Get started, Back and Escape each do what they say, and focus
 *   follows — into the form when it opens, back to the button when it closes;
 * - an error is never left behind the hero, and a stray Escape does not dismiss one;
 * - the chips are decoration (no controls, hidden from assistive tech), and the
 *   calendar and week previews are gone;
 * - the reminders note is outside the form's panel, so it is on the hero too.
 *
 * Whether the hero or the panel is DRAWN is the stylesheet's, keyed off `data-view`
 * (jsdom runs no cascade): the last block reads the shipped CSS and pins that those
 * rules are desktop-only, that the lines are gone and that motion is opt-in.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ clearError: vi.fn(), error: null, subscribed: false }))

vi.mock('../src/lib/usePushNotifications.js', () => ({
  usePushNotifications: () => ({
    supported: true,
    subscribed: auth.subscribed,
    busy: false,
    disable: vi.fn(async () => true),
  }),
}))
vi.mock('../src/state/AuthContext.jsx', () => ({
  useAuth: () => ({
    signIn: vi.fn(),
    signInWithPassword: vi.fn(),
    register: vi.fn(),
    requestPasswordReset: vi.fn(),
    error: auth.error,
    clearError: auth.clearError,
  }),
}))
// A canvas is the 404 page's business (notFound.test.jsx); here it is just a node.
vi.mock('../src/components/shell/DotField.jsx', () => ({
  DotField: () => <canvas className="dot-field" aria-hidden="true" />,
}))
/* The dots themselves are drawn in a browser (dotMorphRun.js) and are checked in
   one; here the adapter is a stand-in the test can drive. By default it says "I
   cannot run" (null), which is what jsdom would get too, so the swap is made at
   once; the transition tests have it hand back the options it was given. */
const dots = vi.hoisted(() => ({ start: vi.fn(() => null), cancel: vi.fn() }))
vi.mock('../src/lib/dotMorphRun.js', () => ({ startDotMorph: (options) => dots.start(options) }))

import { SignIn } from '../src/components/auth/SignIn.jsx'

beforeEach(() => {
  auth.clearError.mockClear()
  auth.error = null
  auth.subscribed = false
  dots.start.mockReset()
  dots.start.mockImplementation(() => null)
  dots.cancel.mockReset()
})
afterEach(() => {
  cleanup()
  delete window.matchMedia
})

const shell = (container) => container.querySelector('.auth-shell')
const action = (container) => container.querySelector('.auth-topbar__action')

describe('the hero', () => {
  it('is what the screen opens on, with the form still in the tree behind it', () => {
    const { container } = render(<SignIn />)
    expect(shell(container).dataset.view).toBe('hero')
    expect(action(container).textContent).toBe('Log in')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Plan your rhythm. Find your flow.')
    expect(screen.getByRole('button', { name: 'Get started' })).toBeTruthy()
    // One DOM at every width: the form is hidden by CSS on a desktop, never removed.
    expect(container.querySelector('.auth-panel')).toBeTruthy()
    expect(screen.getByText('Forgot password?')).toBeTruthy()
  })

  it('has no floating words around the headline any more', () => {
    const { container } = render(<SignIn />)
    expect(container.querySelector('[class*="auth-chip"]')).toBeNull()
    const hero = container.querySelector('.auth-hero')
    for (const word of ['Tasks', 'Events', 'Journal', 'Focus', 'Repeats', 'Review']) {
      expect(within(hero).queryByText(word)).toBeNull()
    }
  })

  it('has a canvas for the dots, hidden from assistive tech and with nothing to press', () => {
    const { container } = render(<SignIn />)
    const canvas = container.querySelector('canvas.auth-morph')
    expect(canvas).toBeTruthy()
    expect(canvas.getAttribute('aria-hidden')).toBe('true')
  })

  it('no longer draws the calendar or the week', () => {
    const { container } = render(<SignIn />)
    expect(container.querySelector('[class*="auth-cal"], [class*="auth-week"]')).toBeNull()
    expect(container.querySelector('.auth-hero__preview, .auth-hero__stats, .auth-hero__hatch')).toBeNull()
  })
})

describe('Log in / Back', () => {
  it('shows the login form, moves focus to its first field and turns into Back', () => {
    const { container } = render(<SignIn />)
    fireEvent.click(action(container))
    expect(shell(container).dataset.view).toBe('form')
    expect(action(container).textContent).toBe('Back')
    expect(screen.getByRole('tab', { name: 'Log in' }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(screen.getByLabelText('Email'))
  })

  it('goes back to the hero, clears the last error and returns focus to the button', () => {
    const { container } = render(<SignIn />)
    fireEvent.click(action(container))
    auth.clearError.mockClear()
    fireEvent.click(action(container))
    expect(shell(container).dataset.view).toBe('hero')
    expect(action(container).textContent).toBe('Log in')
    expect(auth.clearError).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(action(container))
  })

  it('goes back on Escape, the same way', () => {
    const { container } = render(<SignIn />)
    fireEvent.click(action(container))
    auth.clearError.mockClear()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(shell(container).dataset.view).toBe('hero')
    expect(auth.clearError).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(action(container))
  })

  it('leaves Escape alone while the hero is showing', () => {
    const { container } = render(<SignIn />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(shell(container).dataset.view).toBe('hero')
    expect(auth.clearError).not.toHaveBeenCalled()
  })

  it('stops listening for Escape once it has gone back', () => {
    const { container } = render(<SignIn />)
    fireEvent.click(action(container))
    fireEvent.keyDown(window, { key: 'Escape' })
    auth.clearError.mockClear()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(auth.clearError).not.toHaveBeenCalled()
  })
})

describe('Get started', () => {
  it('opens Sign up, with focus in its first field', () => {
    const { container } = render(<SignIn />)
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))
    expect(shell(container).dataset.view).toBe('form')
    expect(screen.getByRole('tab', { name: 'Sign up' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByLabelText('Confirm password')).toBeTruthy()
    // Sign up starts with Display name; focus goes to whatever the form opens on.
    expect(document.activeElement).toBe(screen.getByLabelText('Display name'))
    expect(action(container).textContent).toBe('Back')
  })

  it('clears a stale error as it switches, like the other ways to change form', () => {
    render(<SignIn />)
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))
    expect(auth.clearError).toHaveBeenCalledTimes(1)
  })
})

describe('an error', () => {
  it('is never left behind the hero: the form shows, without taking focus', () => {
    auth.error = 'That did not work.'
    const { container } = render(<SignIn />)
    expect(shell(container).dataset.view).toBe('form')
    expect(action(container).textContent).toBe('Back')
    expect(screen.getByRole('alert').textContent).toContain('That did not work.')
    // It arrived by itself; nobody asked for the form, so focus is not moved.
    expect(document.activeElement).toBe(document.body)
  })

  it('is not dismissed by a stray Escape, only by Back', () => {
    auth.error = 'That did not work.'
    const { container } = render(<SignIn />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(auth.clearError).not.toHaveBeenCalled()
    expect(shell(container).dataset.view).toBe('form')

    fireEvent.click(action(container))
    expect(auth.clearError).toHaveBeenCalledTimes(1)
  })
})

describe('the reminders note', () => {
  it('is outside the form panel, so it is there on the hero too', () => {
    auth.subscribed = true
    const { container } = render(<SignIn />)
    expect(shell(container).dataset.view).toBe('hero')
    const notice = container.querySelector('.auth-notice')
    expect(notice).toBeTruthy()
    expect(container.querySelector('.auth-panel').contains(notice)).toBe(false)
    expect(within(notice).getByText(/Reminders are still on for this device/)).toBeTruthy()
    expect(within(notice).getByRole('button', { name: 'Turn off' })).toBeTruthy()
  })

  it('is not drawn at all when there are no reminders to turn off', () => {
    const { container } = render(<SignIn />)
    expect(container.querySelector('.auth-notice')).toBeNull()
  })

  it('says so once they are off', async () => {
    auth.subscribed = true
    const { container, rerender } = render(<SignIn />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Turn off' }))
    })
    auth.subscribed = false
    rerender(<SignIn />)
    expect(container.querySelector('.auth-notice').textContent).toBe('Reminders are off for this device.')
  })
})

describe('the dot transition', () => {
  /** Has the stand-in adapter hand back the options of each run and a cancel. */
  function recordRuns() {
    const runs = []
    dots.start.mockImplementation((options) => {
      runs.push(options)
      return { cancel: dots.cancel }
    })
    return runs
  }

  it('begins at the click: the label turns to Back and the dots are drawn from the hero to the form', () => {
    const runs = recordRuns()
    const { container } = render(<SignIn />)
    fireEvent.click(action(container))

    expect(shell(container).dataset.morph).toBe('to-form')
    expect(shell(container).dataset.settling).toBeUndefined()
    // Still where it is leaving; headed for the form.
    expect(shell(container).dataset.view).toBe('hero')
    expect(shell(container).dataset.target).toBe('form')
    expect(action(container).textContent).toBe('Back')

    expect(runs).toHaveLength(1)
    expect(runs[0].canvas).toBe(container.querySelector('canvas.auth-morph'))
    expect(runs[0].from).toBe(container.querySelector('.auth-hero__content'))
    expect(runs[0].to).toBe(container.querySelector('.auth-panel__inner'))
    // Nothing has been swapped yet, so focus has not been taken into the form.
    expect(document.activeElement).not.toBe(screen.getByLabelText('Email'))
  })

  it('lets the real content come up when the dots settle, without restarting them', () => {
    const runs = recordRuns()
    const { container } = render(<SignIn />)
    fireEvent.click(action(container))
    act(() => runs[0].onSettle())
    expect(shell(container).dataset.morph).toBe('to-form')
    expect(shell(container).dataset.settling).toBe('')
    expect(dots.start).toHaveBeenCalledTimes(1)
    expect(dots.cancel).not.toHaveBeenCalled()
  })

  it('swaps when the dots are done: the form is the view, focus is in it, the dots are gone', () => {
    const runs = recordRuns()
    const { container } = render(<SignIn />)
    fireEvent.click(action(container))
    act(() => runs[0].onSettle())
    act(() => runs[0].onDone())

    expect(shell(container).dataset.view).toBe('form')
    expect(shell(container).dataset.morph).toBeUndefined()
    expect(shell(container).dataset.settling).toBeUndefined()
    expect(document.activeElement).toBe(screen.getByLabelText('Email'))
    expect(action(container).textContent).toBe('Back')
  })

  it('ignores a second click, Get started and Escape while the dots are in the air', () => {
    const runs = recordRuns()
    const { container } = render(<SignIn />)
    fireEvent.click(action(container))
    auth.clearError.mockClear()

    fireEvent.click(action(container)) // it says Back now, but there is nowhere to go back to yet
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(dots.start).toHaveBeenCalledTimes(1)
    expect(shell(container).dataset.morph).toBe('to-form')
    expect(auth.clearError).not.toHaveBeenCalled()
    expect(runs).toHaveLength(1)
  })

  it('runs the same thing the other way for Back, and puts focus on the button', () => {
    const runs = recordRuns()
    const { container } = render(<SignIn />)
    fireEvent.click(action(container))
    act(() => runs[0].onDone())
    expect(shell(container).dataset.view).toBe('form')

    fireEvent.click(action(container))
    expect(runs).toHaveLength(2)
    expect(shell(container).dataset.morph).toBe('to-hero')
    expect(shell(container).dataset.target).toBe('hero')
    expect(action(container).textContent).toBe('Log in')
    expect(runs[1].from).toBe(container.querySelector('.auth-panel__inner'))
    expect(runs[1].to).toBe(container.querySelector('.auth-hero__content'))
    expect(document.activeElement).toBe(action(container))

    act(() => runs[1].onDone())
    expect(shell(container).dataset.view).toBe('hero')
    expect(shell(container).dataset.morph).toBeUndefined()
  })

  it('goes back on Escape the same way, and ignores a second Escape mid-flight', () => {
    const runs = recordRuns()
    const { container } = render(<SignIn />)
    fireEvent.click(action(container))
    act(() => runs[0].onDone())

    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(runs).toHaveLength(2)
    expect(shell(container).dataset.morph).toBe('to-hero')
  })

  it('has Get started draw the dots to Sign up', () => {
    const runs = recordRuns()
    const { container } = render(<SignIn />)
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))
    expect(shell(container).dataset.morph).toBe('to-form')
    expect(screen.getByRole('tab', { name: 'Sign up' }).getAttribute('aria-selected')).toBe('true')
    act(() => runs[0].onDone())
    expect(document.activeElement).toBe(screen.getByLabelText('Display name'))
  })

  it('stops the dots if the screen goes away in the middle of them', () => {
    recordRuns()
    const { container, unmount } = render(<SignIn />)
    fireEvent.click(action(container))
    unmount()
    expect(dots.cancel).toHaveBeenCalled()
  })

  it('swaps at once where the dots cannot run (no canvas, nothing to draw)', () => {
    // The default stand-in answers null, as the real adapter does without a 2D context.
    const { container } = render(<SignIn />)
    fireEvent.click(action(container))
    expect(shell(container).dataset.view).toBe('form')
    expect(shell(container).dataset.morph).toBeUndefined()
    expect(document.activeElement).toBe(screen.getByLabelText('Email'))
  })

  it('swaps at once, with no dots, for someone who has asked for less motion', () => {
    window.matchMedia = vi.fn((query) => ({ matches: query.includes('reduce'), media: query }))
    recordRuns()
    const { container } = render(<SignIn />)
    fireEvent.click(action(container))
    expect(dots.start).not.toHaveBeenCalled()
    expect(shell(container).dataset.view).toBe('form')
    expect(shell(container).dataset.morph).toBeUndefined()
    expect(document.activeElement).toBe(screen.getByLabelText('Email'))

    fireEvent.click(action(container))
    expect(dots.start).not.toHaveBeenCalled()
    expect(shell(container).dataset.view).toBe('hero')
  })

  it('marks the screen as asked-for once anyone has pressed anything, so the hero stops rising', () => {
    recordRuns()
    const { container } = render(<SignIn />)
    expect(shell(container).dataset.touched).toBeUndefined()
    fireEvent.click(action(container))
    expect(shell(container).dataset.touched).toBe('')
  })
})

/* ------------------------------------------------------------ the stylesheet -- */

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')
const css = read('src/styles/auth.css').replace(/\/\*[\s\S]*?\*\//g, '')

/** The text inside the block opened by the first `{` after `marker`, braces balanced. */
function blockAfter(marker) {
  const start = css.indexOf('{', css.indexOf(marker))
  expect(start, `no block after ${marker}`).toBeGreaterThan(-1)
  let depth = 0
  for (let i = start; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    if (css[i] === '}') depth -= 1
    if (depth === 0) return css.slice(start + 1, i)
  }
  throw new Error(`unbalanced block after ${marker}`)
}

/** The stylesheet with every `@media { … }` block cut out whole. */
function withoutMedia(source) {
  let out = source
  for (let at = out.indexOf('@media'); at !== -1; at = out.indexOf('@media')) {
    const open = out.indexOf('{', at)
    let depth = 0
    let close = open
    for (; close < out.length; close += 1) {
      if (out[close] === '{') depth += 1
      if (out[close] === '}') depth -= 1
      if (depth === 0) break
    }
    out = out.slice(0, at) + out.slice(close + 1)
  }
  return out
}

describe('the sign-in stylesheet', () => {
  it('draws no lines of its own: no hatch, rules, ruled rows or preview cards', () => {
    expect(css).not.toMatch(/auth-hero__(hatch|vline|row|stat|preview|grid|demo)/)
    expect(css).not.toMatch(/\.auth-(cal|week)\b|auth-(cal|week)-/)
    // …and no floating chips: the words that used to drift around the headline.
    expect(css).not.toMatch(/auth-chip/)
    // Nothing is ruled off from anything else: the divider between columns is gone.
    expect(css).not.toMatch(/\.auth-hero\s*\{[^}]*border/)
  })

  it('puts no rule under the topbar (the 404 page, which shares it, draws its own)', () => {
    const topbar = css.slice(css.indexOf('.auth-topbar {'), css.indexOf('}', css.indexOf('.auth-topbar {')))
    expect(topbar).not.toMatch(/border/)
    expect(read('src/styles/not-found.css')).toMatch(/\.not-found \.auth-topbar\s*\{[^}]*border-bottom/)
  })

  const GATE = '@media (prefers-reduced-motion: no-preference) {'
  // The first of the two `max-width: 640px` blocks is the phone's sizing.
  const PHONE = '@media (max-width: 640px) {'

  it('is one layout at every width: nothing here keys off a breakpoint but sizing', () => {
    const swap = css.match(
      /\.auth-shell\[data-view='hero'\] \.auth-panel,\s*\.auth-shell\[data-view='form'\] \.auth-hero\s*\{([^}]*)\}/,
    )
    expect(swap, 'no rule for swapping the hero and the form').toBeTruthy()
    // What decides which side is shown, and where the field is, is read by rules
    // outside any media query (the first @media in the file comes after the last of
    // them), so a phone gets the same hero, the same form and the same dots as a
    // desktop. (`data-morph` also appears once inside the motion gate: the settle's
    // fade-in is the one part that needs motion allowed.)
    const unmedia = withoutMedia(css)
    for (const state of ['data-view', 'data-target']) {
      const everywhere = css.split(state).length - 1
      expect(everywhere, `${state} is not read at all`).toBeGreaterThan(0)
      expect(unmedia.split(state).length - 1, `${state} is read inside a media query`).toBe(everywhere)
    }
    // The only media queries are sizing (≤1080, ≤900, ≤640) and the motion gate.
    for (const [query] of css.matchAll(/@media[^{]*/g)) {
      expect(query, query).toMatch(/max-width:\s*(1080|900|640)px|prefers-reduced-motion: no-preference|hover: hover/)
    }
  })

  it('steps the topbar button on hover only where something can hover', () => {
    const hover = blockAfter('@media (hover: hover) {')
    expect(hover).toMatch(/\.auth-topbar__action:hover/)
    // …and not outside it, where a tap would leave it stuck.
    expect(css.replace(hover, '')).not.toMatch(/\.auth-topbar__action:hover/)
  })

  it('draws the topbar button, the hero, the field and the dots at every width', () => {
    expect(css).not.toMatch(/\.auth-(hero|panel|morph|topbar__action)\s*\{[^}]*display:\s*none/)
    expect(css).not.toMatch(/\.dot-field[^{]*\{[^}]*display:\s*none/)
    expect(css).not.toMatch(/min-width:\s*861px/)
  })

  it('keeps both sides laid out and swaps them by visibility, so a tap lays nothing out', () => {
    const swap = css.match(
      /\.auth-shell\[data-view='hero'\] \.auth-panel,\s*\.auth-shell\[data-view='form'\] \.auth-hero\s*\{([^}]*)\}/,
    )
    expect(swap[1]).toMatch(/visibility:\s*hidden/)
    // Not `display: none`: that would lay a whole side out from nothing at the tap.
    expect(swap[1]).not.toMatch(/display/)
    const both = css.match(/\.auth-shell\[data-morph\] \.auth-hero,\s*\.auth-shell\[data-morph\] \.auth-panel\s*\{([^}]*)\}/)
    expect(both, 'no rule for both sides during the swap').toBeTruthy()
    expect(both[1]).toMatch(/visibility:\s*hidden/)
    expect(both[1]).not.toMatch(/display/)
  })

  it('puts both sides in one cell of a stage exactly the screen tall, each scrolling inside it', () => {
    expect(css).toMatch(/\.auth-shell\[data-view\]\s*\{[^}]*height:\s*100dvh/)
    expect(css).toMatch(/\.auth-body\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)[^}]*overflow:\s*hidden/)
    expect(css).toMatch(/\.auth-hero,\s*\.auth-panel\s*\{[^}]*grid-area:\s*1 \/ 1[^}]*overflow-y:\s*auto/)
    // Centred by margin, so a side taller than the stage starts at its top and scrolls
    // instead of losing its first lines.
    expect(css).toMatch(/\.auth-hero__content\s*\{[^}]*margin:\s*auto/)
    expect(css).toMatch(/\.auth-panel__inner\s*\{[^}]*margin:\s*auto/)
  })

  it('lays the dots over the stage and lets nothing take a pointer', () => {
    expect(css).toMatch(/\.auth-morph\s*\{[^}]*position:\s*absolute[^}]*pointer-events:\s*none/)
    // The field steps back for where the screen is headed, not where it is.
    expect(css).toMatch(/\.auth-shell\[data-target='form'\] \.dot-field\s*\{[^}]*opacity/)
  })

  it('sizes the hero for a thumb on a phone: one-line headline, full-width Get started, a 40px button', () => {
    const phone = blockAfter(PHONE)
    expect(phone).toMatch(/\.auth-hero__title\s*\{[^}]*font-size:\s*clamp\(32px/)
    expect(phone).toMatch(/\.auth-hero__cta\s*\{[^}]*width:\s*100%[^}]*min-height:\s*48px/)
    expect(phone).toMatch(/\.auth-topbar__action\s*\{[^}]*min-height:\s*40px/)
  })

  it('moves nothing unless the person allows motion', () => {
    expect(css).toContain(GATE)
    const gated = blockAfter(GATE)
    expect(gated).toMatch(/@keyframes auth-rise/)
    expect(gated).toMatch(/@keyframes auth-materialise/)
    const outside = css.replace(gated, '')
    expect(outside).not.toMatch(/animation\s*:/)
    expect(outside).not.toMatch(/@keyframes/)
  })

  it('brings the real content up only on the side the dots are landing on, and only as they land', () => {
    const gated = blockAfter(GATE)
    expect(gated).toMatch(
      /\.auth-shell\[data-morph='to-form'\]\[data-settling\] \.auth-panel,\s*\.auth-shell\[data-morph='to-hero'\]\[data-settling\] \.auth-hero\s*\{[^}]*visibility:\s*visible[^}]*auth-materialise/,
    )
  })

  it('stops the hero rising on load once anyone has asked for the swap, so it cannot replay under the dots', () => {
    const gated = blockAfter(GATE)
    expect(gated).toMatch(/\.auth-shell:not\(\[data-touched\]\) \.auth-hero__content\s*\{[^}]*auth-rise/)
    // The form has no entrance of its own any more: the dots are it.
    expect(css).not.toMatch(/\.auth-panel__inner\s*\{[^}]*animation/)
  })

  it('names every keyframe it uses', () => {
    const defined = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((match) => match[1]))
    const used = [...css.matchAll(/animation:\s*([\w-]+)/g)].map((match) => match[1])
    expect(used.length).toBeGreaterThanOrEqual(2)
    for (const name of used) expect(defined.has(name), `${name} has no @keyframes`).toBe(true)
  })

  it('colours everything with tokens', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(css).not.toMatch(/\brgba?\(/)
  })
})
