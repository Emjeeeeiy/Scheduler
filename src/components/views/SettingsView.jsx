import { useEffect, useRef, useState } from 'react'
import { BACK_RANK, useBackLayer } from '../../lib/useBackLayer.js'
import { ChevronLeftIcon, ChevronRightIcon } from '../icons.jsx'
import { AccountSection } from '../settings/AccountSection.jsx'
import { AppearanceSection } from '../settings/AppearanceSection.jsx'
import { DataSection } from '../settings/DataSection.jsx'
import { GeneralSection } from '../settings/GeneralSection.jsx'
import { KeyboardSection } from '../settings/KeyboardSection.jsx'
import { NotificationsSection } from '../settings/NotificationsSection.jsx'
import { TagsSection } from '../settings/TagsSection.jsx'
import { DEFAULT_SETTINGS_SECTION, SETTINGS_SECTIONS, isSettingsSection } from '../settings/sections.js'
import '../../styles/settings.css'

const PANELS = {
  general: GeneralSection,
  appearance: AppearanceSection,
  account: AccountSection,
  tags: TagsSection,
  notifications: NotificationsSection,
  keyboard: KeyboardSection,
  data: DataSection,
}

/* The stylesheet's own breakpoint: below it the page is two screens, a list and
   a category. */
const NARROW = '(max-width: 900px)'

/** Whether the page is currently drawn as two screens. Read from the same media
    query the stylesheet uses rather than from a width, so the two cannot
    disagree; false where there is no matchMedia (the smoke render, jsdom). */
function useNarrow() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && (window.matchMedia?.(NARROW)?.matches ?? false),
  )
  useEffect(() => {
    const query = window.matchMedia?.(NARROW)
    if (!query?.addEventListener) return undefined
    const update = () => setNarrow(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return narrow
}

/**
 * Settings, as a page of its own with a side navigation of categories — General,
 * Appearance, Account, Tags, Notifications, Keyboard, Your data — and the one
 * you pick shown beside it. Account and Tags used to be separate dialogs; they
 * are sections here, so everything that configures Cadence is in one place.
 *
 * Built from the same pieces as every other page: a `.frame`, the
 * section-head title, and a `.divided-row` (here: navigation | panel) whose
 * hairline does the separating a box would. Each panel is a run of rows — what a
 * setting is on the left, its control on the right.
 *
 * On a phone there is no room for both, so it is two screens, the way the
 * Journal's list and note are: first just the list of categories, then — once one
 * is tapped — that category's panel with a Back button. Both are always in the
 * DOM; `data-mobile-screen` says which one the stylesheet shows below 900px
 * (above it the attribute does nothing and both are on screen). That keeps one
 * markup at every size, with only visibility ever media-driven.
 *
 * Which category is open, and whether its screen is showing, can be controlled
 * from outside (`section`/`onSectionChange`, `detail`/`onDetailChange`), which is
 * how App keeps them across a reload and how "Account" in the avatar menu and
 * "Open Tags" in the palette land straight on the panel while "Settings" lands
 * on the list. Left uncontrolled it just remembers them while it is mounted.
 */
export function SettingsView({ section, onSectionChange, detail, onDetailChange }) {
  const narrow = useNarrow()
  const [ownSection, setOwnSection] = useState(DEFAULT_SETTINGS_SECTION)
  const [ownDetail, setOwnDetail] = useState(false)
  const active = isSettingsSection(section) ? section : ownSection
  const showDetail = typeof detail === 'boolean' ? detail : ownDetail
  const current = SETTINGS_SECTIONS.find((candidate) => candidate.id === active)
  const Panel = PANELS[active]

  /* Moving between the two screens on a phone should start at the top of the
     new one, not wherever the last one was scrolled to. Only where the screens
     actually are screens (the same breakpoint the stylesheet uses), and not on
     first mount, which is not a move. */
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    if (window.matchMedia?.('(max-width: 900px)')?.matches) window.scrollTo(0, 0)
  }, [showDetail, active])

  function choose(id) {
    setOwnSection(id)
    setOwnDetail(true)
    onSectionChange?.(id)
    onDetailChange?.(true)
  }

  function back() {
    setOwnDetail(false)
    onDetailChange?.(false)
  }

  /* The phone's Back button is the screen's own "Settings" back button: from a
     category's screen it returns to the list, and only from the list does it
     leave Settings. Beside a desktop's panel there is no second screen to step
     out of, so no layer — Back there is the browser's. */
  useBackLayer(
    showDetail && narrow ? active : null,
    () => {
      back()
      return true
    },
    BACK_RANK.screen,
  )

  return (
    <div className="settings-page frame stack" data-mobile-screen={showDetail ? 'detail' : 'list'}>
      <div className="section-head">
        <h2 className="section-head__title">Settings</h2>
      </div>

      <div className="settings-layout divided-row">
        <nav className="settings-nav" aria-label="Settings sections">
          {SETTINGS_SECTIONS.map((item) => {
            const on = item.id === active
            return (
              <button
                key={item.id}
                type="button"
                className={`settings-nav__item${on ? ' settings-nav__item--active' : ''}`}
                aria-current={on ? 'true' : undefined}
                /* The name stays the category; what is in it is the description.
                   On a phone the blurb is drawn under the name, which would
                   otherwise become part of it. */
                aria-label={item.label}
                aria-describedby={`settings-blurb-${item.id}`}
                onClick={() => choose(item.id)}
              >
                <span className="settings-nav__text">
                  <span className="settings-nav__label">{item.label}</span>
                  {/* Said here, where you choose, and nowhere else — beside the
                      panel the highlighted item already says where you are. Only
                      drawn on a phone. */}
                  <span className="settings-nav__blurb" id={`settings-blurb-${item.id}`}>
                    {item.blurb}
                  </span>
                </span>
                {/* Only drawn on a phone, where each row opens a screen. */}
                <ChevronRightIcon className="settings-nav__chevron" aria-hidden="true" />
              </button>
            )
          })}
        </nav>

        <section className="settings-panel" aria-labelledby="settings-panel-title">
          {/* The way back and the screen's title: one bar on a phone, pinned under the
              top bar while the rows scroll beneath it, so the way out is never a
              scroll up the page. Beside the navigation it is `display: contents`, so
              the two are exactly the loose siblings they were. */}
          <div className="settings-panel__bar">
            {/* Only drawn on a phone, where the panel is a screen of its own. */}
            <button type="button" className="settings-back" onClick={back}>
              <ChevronLeftIcon className="settings-back__icon" aria-hidden="true" />
              Settings
            </button>
            {/* The screen's title on a phone; beside the navigation it is visually
                hidden (the highlighted item says it) but stays in the outline. */}
            <h3 className="settings-panel__title" id="settings-panel-title">
              {current.label}
            </h3>
          </div>
          <div className="settings-panel__rows">
            <Panel />
          </div>
        </section>
      </div>
    </div>
  )
}
