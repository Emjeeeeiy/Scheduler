/* DockedLayer: where a docked bottom sheet is drawn.
 *
 * Regression guard for a bug seen in a phone-sized browser: the Journal note's ⋯
 * menu, opened from inside the page's content, was painted UNDER the fixed bottom
 * tab bar — only its grab handle showed. `position: fixed` leaves the parent's box
 * but not its stacking context, and the content sits below the tab bar's. A docked
 * sheet therefore has to be on <body>; anything not docked stays where it is.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DockedLayer } from '../src/components/shell/DockedLayer.jsx'

afterEach(cleanup)

const host = () => screen.getByTestId('host')

describe('DockedLayer', () => {
  it('puts a docked sheet on <body>, outside the content it was opened from', () => {
    render(
      <div data-testid="host">
        <DockedLayer docked>
          <p>sheet</p>
        </DockedLayer>
      </div>,
    )
    const sheet = screen.getByText('sheet')
    expect(sheet.parentElement).toBe(document.body)
    expect(host().contains(sheet)).toBe(false)
  })

  it('leaves anything not docked exactly where it was', () => {
    render(
      <div data-testid="host">
        <DockedLayer docked={false}>
          <p>menu</p>
        </DockedLayer>
      </div>,
    )
    expect(host().contains(screen.getByText('menu'))).toBe(true)
  })

  it('takes everything it is given: a sheet and its scrim go together', () => {
    render(
      <div data-testid="host">
        <DockedLayer docked>
          <div className="popover-scrim" />
          <div role="menu">panel</div>
        </DockedLayer>
      </div>,
    )
    expect(document.body.querySelector(':scope > .popover-scrim')).toBeTruthy()
    expect(screen.getByRole('menu').parentElement).toBe(document.body)
  })

  it('renders nothing of its own around what it is given', () => {
    const { container } = render(
      <DockedLayer docked={false}>
        <span>only</span>
      </DockedLayer>,
    )
    expect(container.innerHTML).toBe('<span>only</span>')
  })
})
