import { useCallback, useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { usePopoverPlacement } from '../../lib/usePopoverPlacement.js'
import { LogOutIcon } from '../icons.jsx'

const PANEL_WIDTH = 240
const PANEL_MAX_HEIGHT = 160

/**
 * The avatar is identity on a wide rail (Log out sits as its own labelled
 * row). On a phone that row is gone, so the picture has to open a menu —
 * two taps to sign out, not one stray hit on a 44px icon.
 */
export function AccountMenu() {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const dismiss = useCallback(() => setOpen(false), [])
  const { placement, triggerRef, panelRef } = usePopoverPlacement({
    open,
    onDismiss: dismiss,
    width: PANEL_WIDTH,
    maxHeight: PANEL_MAX_HEIGHT,
  })

  const name = user?.displayName?.trim() || user?.email || 'Signed in'
  const email = user?.email && user.email !== name ? user.email : null

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
        {user?.photoURL ? (
          <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
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
          <div className="account__who">
            <p className="account__name">{name}</p>
            {email && <p className="account__email">{email}</p>}
          </div>
          <button
            type="button"
            className="account__out"
            role="menuitem"
            onClick={signOut}
          >
            <LogOutIcon className="sidebar__icon" />
            Log out
          </button>
        </div>
      )}
    </div>
  )
}
