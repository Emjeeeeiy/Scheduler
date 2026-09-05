import { useCallback, useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { usePopoverPlacement } from '../../lib/usePopoverPlacement.js'
import { ListIcon, LogOutIcon, PlusIcon, SettingsIcon, TagIcon, UserIcon } from '../icons.jsx'
import { ProfileModal } from './ProfileModal.jsx'

const PANEL_WIDTH = 190
// Sized for the mobile row count below (New task/Tags/All items/Settings, a
// divider, Account, Log out) — this only feeds the open-upward-or-downward
// decision in usePopoverPlacement, never an actual CSS max-height, so it
// being generous on desktop (where those four rows are hidden and the panel
// is genuinely shorter) costs nothing.
const PANEL_MAX_HEIGHT = 280

/**
 * The avatar opens a small menu — Account, Log out, always — rather than
 * either extreme this has been before: not the full modal directly (that
 * made a plain sign-out cost a detour through Account first), and not a
 * name/email dropdown with sign-out buried in it either. Account is what
 * opens the full modal now; Log out stays a single click from the avatar,
 * same as the desktop sidebar's own labelled row already gives for free.
 *
 * New task/Tags/All items/Settings are also always in this markup, but
 * shown ONLY below the sidebar's own mobile breakpoint (`.account__item
 * --mobile-only`, see shell.css) — on a phone the sidebar collapses into a
 * top bar with no room left for them, so they move here rather than
 * disappearing. Rendered unconditionally rather than behind a JS width
 * check so the same DOM exists at every size, matching how the rest of the
 * shell handles this split (see the sidebar's own responsive comment in
 * toggles-responsive.css) — only visibility is ever media-query-driven,
 * never which elements exist. On desktop, where the sidebar already shows
 * all four directly, these rows are simply never visible.
 */
export function AccountMenu({ onNewTask, onOpenTags, onOpenItems, onOpenSettings }) {
  const { user, signOut } = useAuth()
  const { profile } = useSchedule()
  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const dismiss = useCallback(() => setOpen(false), [])
  const { placement, triggerRef, panelRef } = usePopoverPlacement({
    open,
    onDismiss: dismiss,
    width: PANEL_WIDTH,
    maxHeight: PANEL_MAX_HEIGHT,
  })

  const name = user?.displayName?.trim() || user?.email || 'Signed in'
  const photoSrc = profile?.photoBase64 || user?.photoURL || null

  return (
    <div className="account">
      <button
        ref={triggerRef}
        type="button"
        className="avatar account__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${name}`}
        title={name}
      >
        {photoSrc ? (
          <img src={photoSrc} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
        )}
      </button>

      {open && placement && (
        <div
          ref={panelRef}
          className="account__panel"
          style={placement}
          role="menu"
          aria-label="Account"
        >
          <button
            type="button"
            className="account__item account__item--mobile-only"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onNewTask?.()
            }}
          >
            <PlusIcon className="sidebar__icon" />
            New task
          </button>
          <button
            type="button"
            className="account__item account__item--mobile-only"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onOpenTags?.()
            }}
          >
            <TagIcon className="sidebar__icon" />
            Tags
          </button>
          <button
            type="button"
            className="account__item account__item--mobile-only"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onOpenItems?.()
            }}
          >
            <ListIcon className="sidebar__icon" />
            All items
          </button>
          <button
            type="button"
            className="account__item account__item--mobile-only"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onOpenSettings?.()
            }}
          >
            <SettingsIcon className="sidebar__icon" />
            Settings
          </button>
          <div className="account__divider account__divider--mobile-only" role="separator" />
          <button
            type="button"
            className="account__item"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setProfileOpen(true)
            }}
          >
            <UserIcon className="sidebar__icon" />
            Account
          </button>
          <button
            type="button"
            className="account__item"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              signOut()
            }}
          >
            <LogOutIcon className="sidebar__icon" />
            Log out
          </button>
        </div>
      )}

      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </div>
  )
}
