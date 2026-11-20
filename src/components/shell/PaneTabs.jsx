import { useRef } from 'react'

/** A row of tabs that swaps which pane of a page is showing — a phone's answer to a
    page that is two or three columns, or two stacked halves, on a desktop. The
    Dashboard's three queues, the Day page's day and inbox, and Focus's timer and
    stats are each one of these.

    One DOM at every width. The panes are always rendered, and the stylesheet shows
    one of them below 900px (a `data-pane` on the container says which); the row
    itself is not drawn above that — a desktop already has every pane in view — so
    it is not in the accessibility tree there either. Look and feel are the
    Schedule switcher's (`view-tabs`), so a tab row is one thing across the app.

    A real tablist: one tab is in the tab order and the arrow keys, Home and End
    move between them. `tabs` is `[{ id, label, count?, tone? }]`; `count` is
    drawn as the count pill (`tone: 'critical'` for what is overdue), and a tab
    carries its count so a pane you are not looking at still says what it holds.
    Panes name themselves with `id="{idPrefix}-{tab.id}"`, which `aria-controls`
    points at. A row that switches something with no panes of its own to point at
    (sign-in's Log in / Sign up swaps the form itself) leaves `idPrefix` out, and
    then carries no ids and no `aria-controls` rather than dangling ones. */
export function PaneTabs({ label, tabs, value, onChange, idPrefix }) {
  const refs = useRef({})

  function onKeyDown(event, index) {
    let next = null
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    if (next === null) return
    event.preventDefault()
    onChange(tabs[next].id)
    refs.current[tabs[next].id]?.focus()
  }

  return (
    <div className="view-tabs pane-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, index) => {
        const on = tab.id === value
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el
            }}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-tab-${tab.id}` : undefined}
            aria-selected={on}
            aria-controls={idPrefix ? `${idPrefix}-${tab.id}` : undefined}
            tabIndex={on ? 0 : -1}
            className={`view-tabs__tab pane-tabs__tab${on ? ' view-tabs__tab--active' : ''}`}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
            {tab.count != null && (
              <span className={`count-pill${tab.tone === 'critical' ? ' count-pill--critical' : ''}`}>
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
