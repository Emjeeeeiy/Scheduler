import { createPortal } from 'react-dom'

/** Where a docked bottom sheet (usePopoverPlacement's `sheet`) and its scrim are
    drawn: on <body>, above everything, when docked; where they are otherwise.

    `position: fixed` gets a layer out of its parent's box, not out of its parent's
    stacking context — and the page's content sits BELOW the sticky top bar and the
    fixed bottom tab bar. A sheet opened from inside the content (the Journal
    note's ⋯ menu) was therefore painted under the tab bar, with only its grab
    handle showing. A menu that happens to live in the sidebar (the account menu,
    the bell) was above it by luck of where it is. Putting every docked sheet on
    <body> makes it right wherever the trigger is.

    Not docked — a desktop, or a menu that did not ask — it renders in place, as it
    always did. Never called while the sheet is closed, so never on the server. */
export function DockedLayer({ docked, children }) {
  return docked ? createPortal(children, document.body) : children
}
