import { useCallback, useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { usePopoverPlacement } from '../../lib/usePopoverPlacement.js'
import { LogOutIcon, UserIcon } from '../icons.jsx'
import { ProfileModal } from './ProfileModal.jsx'

const PANEL_WIDTH = 190
const PANEL_MAX_HEIGHT = 150

/**
 * The avatar opens a small two-item menu — Account, Log out — rather than
 * either extreme this has been before: not the full modal directly (that
 * made a plain sign-out cost a detour through Account first), and not a
 * name/email dropdown with sign-out buried in it either. Account is what
 * opens the full modal now; Log out stays a single click from the avatar,
 * same as the desktop sidebar's own labelled row already gives for free.
 *
 * Settings used to be a third item here. It has its own row in the sidebar
 * now, beside Tags and All items — a visible, permanent home rather than
 * one hidden behind an avatar — so keeping a copy in here would only blur
 * what this menu is for: the account, not the app.
 */
export function AccountMenu() {
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
