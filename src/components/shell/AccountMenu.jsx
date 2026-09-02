import { useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { ProfileModal } from './ProfileModal.jsx'

/**
 * The avatar opens the full Account modal now — photo, sign-in method, and
 * delete account live there, so a click here has one job, not a dropdown's
 * worth of shortcuts. Desktop still has its own labelled Log out row in the
 * sidebar for one-click sign-out; this is the "everything else" door.
 */
export function AccountMenu() {
  const { user } = useAuth()
  const { profile } = useSchedule()
  const [open, setOpen] = useState(false)

  const name = user?.displayName?.trim() || user?.email || 'Signed in'
  const photoSrc = profile?.photoBase64 || user?.photoURL || null

  return (
    <div className="account">
      <button
        type="button"
        className="avatar account__trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Account for ${name}`}
        title={name}
      >
        {photoSrc ? (
          <img src={photoSrc} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
        )}
      </button>

      {open && <ProfileModal onClose={() => setOpen(false)} />}
    </div>
  )
}
