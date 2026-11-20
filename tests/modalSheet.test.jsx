/* What useModalA11y does for a dialog that is a bottom sheet on a phone — the two
 * things only a script can do (modals.css has the rest, checked by eye):
 *
 *   - swipe down on the head to close. It goes through the same `onClose` and the
 *     same Escape-off refusal as every other way out, only a clear drag closes it,
 *     and only the head is the drag zone (a drag in the content is a scroll, and a
 *     press on the Close button is the button's);
 *   - stand clear of the on-screen keyboard, by writing how much of the screen it
 *     took to `--keyboard-inset` on the dim, which the sheet pads by.
 *
 * jsdom has no layout, so distances are the pointer's clientY, and a drag's speed
 * (a flick) is not tested: timestamps are the real clock there.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { useRef } from 'react'
import { useModalA11y } from '../src/lib/useModalA11y.js'
import { installPointerEvents } from './helpers/prosemirrorDom.js'

beforeAll(installPointerEvents)

const realInnerHeight = window.innerHeight
afterEach(() => {
  cleanup()
  delete window.matchMedia
  delete window.visualViewport
})
afterAll(() => {
  window.innerHeight = realInnerHeight
})

function Sheet({ onClose, escapeDisabled }) {
  const panelRef = useRef(null)
  useModalA11y(panelRef, { onClose, escapeDisabled })
  return (
    <div className="modal" data-testid="dim">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Sheet" className="modal__panel">
        <div className="modal__head" data-testid="head">
          <h2>Sheet</h2>
          <button type="button">Close</button>
        </div>
        <p>Body</p>
      </div>
    </div>
  )
}

/** A phone: narrow, with a touch screen. */
const phone = (matches = true) => {
  window.matchMedia = (query) => ({
    matches: matches && query.includes('(max-width: 640px)') && query.includes('(pointer: coarse)'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })
}

const panel = () => screen.getByRole('dialog')
const head = () => screen.getByTestId('head')
const touch = (y) => ({ pointerId: 7, pointerType: 'touch', clientY: y })

function drag(from, to, target = head()) {
  fireEvent.pointerDown(target, touch(from))
  fireEvent.pointerMove(target, touch(to))
}

describe('swipe down to close', () => {
  it('moves the sheet with the finger, downward', () => {
    phone()
    render(<Sheet onClose={vi.fn()} />)
    drag(100, 230)
    expect(panel().style.transform).toBe('translateY(130px)')
  })

  it('never moves up: a sheet has nowhere to go', () => {
    phone()
    render(<Sheet onClose={vi.fn()} />)
    drag(100, 40)
    expect(panel().style.transform).toBe('translateY(0px)')
  })

  it('closes when it is dragged clear of where it sits', () => {
    phone()
    const onClose = vi.fn()
    render(<Sheet onClose={onClose} />)
    drag(100, 230)
    fireEvent.pointerUp(head(), touch(230))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('springs back, and stays open, when the drag was short', () => {
    phone()
    const onClose = vi.fn()
    render(<Sheet onClose={onClose} />)
    drag(100, 130)
    fireEvent.pointerUp(head(), touch(130))
    expect(onClose).not.toHaveBeenCalled()
    // Handed back to the stylesheet, so the sheet returns to where it sits.
    expect(panel().style.transform).toBe('')
  })

  it('is not a close when the touch is taken away mid-drag (a system gesture)', () => {
    phone()
    const onClose = vi.fn()
    render(<Sheet onClose={onClose} />)
    drag(100, 230)
    fireEvent.pointerCancel(head(), touch(230))
    expect(onClose).not.toHaveBeenCalled()
    expect(panel().style.transform).toBe('')
  })

  // Regression guard for a dialog that is mid-save: it turns Escape off, and a
  // flick must not be a way round that.
  it('refuses, like Escape, when the dialog has switched closing off — and springs back', () => {
    phone()
    const onClose = vi.fn()
    render(<Sheet onClose={onClose} escapeDisabled />)
    drag(100, 300)
    fireEvent.pointerUp(head(), touch(300))
    expect(onClose).not.toHaveBeenCalled()
    expect(panel().style.transform).toBe('')
  })

  it('leaves a press on the Close button to the button', () => {
    phone()
    const onClose = vi.fn()
    render(<Sheet onClose={onClose} />)
    const button = screen.getByRole('button', { name: 'Close' })
    fireEvent.pointerDown(button, touch(100))
    fireEvent.pointerMove(button, touch(300))
    fireEvent.pointerUp(button, touch(300))
    expect(panel().style.transform).toBe('')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ignores a mouse: nothing is dragged with one', () => {
    phone()
    render(<Sheet onClose={vi.fn()} />)
    fireEvent.pointerDown(head(), { pointerId: 1, pointerType: 'mouse', clientY: 100 })
    fireEvent.pointerMove(head(), { pointerId: 1, pointerType: 'mouse', clientY: 300 })
    expect(panel().style.transform).toBe('')
  })

  it('does nothing at a wider width, or without a touch screen — there the dialog is a card', () => {
    phone(false)
    const onClose = vi.fn()
    render(<Sheet onClose={onClose} />)
    drag(100, 300)
    fireEvent.pointerUp(head(), touch(300))
    expect(panel().style.transform).toBe('')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not take a drag that began elsewhere in the sheet', () => {
    phone()
    render(<Sheet onClose={vi.fn()} />)
    drag(100, 300, screen.getByText('Body'))
    expect(panel().style.transform).toBe('')
  })
})

describe('standing clear of the keyboard', () => {
  const viewport = (fields) => {
    const listeners = {}
    window.visualViewport = {
      height: 800,
      offsetTop: 0,
      scale: 1,
      addEventListener: (type, fn) => {
        listeners[type] = fn
      },
      removeEventListener: (type) => {
        delete listeners[type]
      },
      ...fields,
    }
    return { listeners, set: (next) => Object.assign(window.visualViewport, next) }
  }
  const inset = () => screen.getByTestId('dim').style.getPropertyValue('--keyboard-inset')

  it('is 0 with no keyboard, so it costs nothing', () => {
    window.innerHeight = 800
    viewport({ height: 800 })
    render(<Sheet onClose={vi.fn()} />)
    expect(inset()).toBe('0px')
  })

  it('is the height of what the keyboard took, and follows it as it comes and goes', () => {
    window.innerHeight = 800
    const vv = viewport({ height: 500 })
    render(<Sheet onClose={vi.fn()} />)
    expect(inset()).toBe('300px')

    vv.set({ height: 560 })
    vv.listeners.resize()
    expect(inset()).toBe('240px')

    vv.set({ height: 800 })
    vv.listeners.resize()
    expect(inset()).toBe('0px')
  })

  it('counts the visual viewport scrolled within the page (iOS moves it up to a focused field)', () => {
    window.innerHeight = 800
    const vv = viewport({ height: 500, offsetTop: 50 })
    render(<Sheet onClose={vi.fn()} />)
    expect(inset()).toBe('250px')
    vv.set({ offsetTop: 0 })
    vv.listeners.scroll()
    expect(inset()).toBe('300px')
  })

  // A pinch-zoomed viewport is smaller too, and that is not a keyboard.
  it('is 0 while pinch-zoomed', () => {
    window.innerHeight = 800
    viewport({ height: 400, scale: 2 })
    render(<Sheet onClose={vi.fn()} />)
    expect(inset()).toBe('0px')
  })

  it('never goes negative', () => {
    window.innerHeight = 800
    viewport({ height: 900 })
    render(<Sheet onClose={vi.fn()} />)
    expect(inset()).toBe('0px')
  })

  it('stops listening when the dialog goes', () => {
    window.innerHeight = 800
    const vv = viewport({ height: 500 })
    const { unmount } = render(<Sheet onClose={vi.fn()} />)
    expect(Object.keys(vv.listeners).sort()).toEqual(['resize', 'scroll'])
    unmount()
    expect(Object.keys(vv.listeners)).toEqual([])
  })

  it('copes with a browser that has no visual viewport', () => {
    render(<Sheet onClose={vi.fn()} />)
    expect(inset()).toBe('')
  })
})
