import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { fileToAvatarDataUri } from '../../lib/image.js'
import { CameraIcon, CheckIcon, CloseIcon, GoogleIcon, LogOutIcon, TrashIcon } from '../icons.jsx'

const PROVIDER_LABEL = {
  'google.com': 'Google',
  password: 'Username & password',
}

/**
 * What used to be a small dropdown (name, email, log out) is now the one
 * place everything about the signed-in account lives — the photo, how you
 * sign in, and the way out entirely, deleting the account. Reached from the
 * same avatar click that used to open the dropdown; the desktop sidebar's
 * own labelled sign-out row is untouched, so quick logout there still costs
 * one click, not a trip through this modal.
 */
export function ProfileModal({ onClose }) {
  const { user, signOut, reauthenticate, deleteAccount } = useAuth()
  const { profile, updateProfilePhoto, removeProfilePhoto, deleteAllData } = useSchedule()
  const fileInputRef = useRef(null)

  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState(null)

  const [deleteStage, setDeleteStage] = useState('idle') // idle | confirming | password | working
  const [deleteError, setDeleteError] = useState(null)
  const [password, setPassword] = useState('')

  // Closing mid-delete wouldn't stop it — the Firestore wipe and the Auth
  // call are already in flight — it would just unmount this component while
  // they're still running, so a late error has nothing left to report to.
  const closable = deleteStage !== 'working'

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape' && closable) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, closable])

  const name = user?.displayName?.trim() || user?.email || 'Signed in'
  const email = user?.email ?? null
  const providerId = user?.providerData[0]?.providerId
  const providerLabel = PROVIDER_LABEL[providerId] ?? 'Unknown'
  const photoSrc = profile?.photoBase64 || user?.photoURL || null
  const hasCustomPhoto = Boolean(profile?.photoBase64)

  async function onPickPhoto(event) {
    const file = event.target.files?.[0]
    event.target.value = '' // same file picked twice still fires onChange
    if (!file) return
    setPhotoError(null)
    setUploading(true)
    try {
      const dataUri = await fileToAvatarDataUri(file)
      await updateProfilePhoto(dataUri)
    } catch (caught) {
      console.error('Could not update the profile photo.', caught)
      setPhotoError(caught.message ?? 'Could not update your photo.')
    } finally {
      setUploading(false)
    }
  }

  async function onRemovePhoto() {
    setPhotoError(null)
    setUploading(true)
    try {
      await removeProfilePhoto()
    } catch (caught) {
      console.error('Could not remove the profile photo.', caught)
      setPhotoError(caught.message ?? 'Could not remove your photo.')
    } finally {
      setUploading(false)
    }
  }

  /* The whole point of reauthenticating first (see firebase.js) is that it
     never leaves a half-deleted account: nothing here is destroyed until
     the identity check has already succeeded. */
  async function runDelete() {
    setDeleteError(null)
    setDeleteStage('working')
    try {
      if (providerId === 'password') {
        await reauthenticate(password)
      } else {
        await reauthenticate()
      }
      await deleteAllData()
      await deleteAccount()
      // No further state to set: deleteAccount() signs the account out, and
      // the app-wide auth listener swaps this whole tree for the sign-in
      // screen before another render of this component would matter.
    } catch (caught) {
      console.error('Could not delete the account.', caught)
      if (caught.code === 'auth/wrong-password' || caught.code === 'auth/invalid-credential') {
        setDeleteError('That password is not correct.')
        setDeleteStage('password')
      } else if (caught.code === 'auth/popup-closed-by-user') {
        setDeleteError('Identity check was closed before it finished. Try again.')
        setDeleteStage('confirming')
      } else if (caught.code === 'auth/requires-recent-login') {
        setDeleteError('Enter your password to confirm.')
        setDeleteStage('password')
      } else {
        setDeleteError(caught.message ?? 'Could not delete your account.')
        setDeleteStage('confirming')
      }
    }
  }

  function onConfirmDelete() {
    if (providerId === 'password') {
      setDeleteError(null)
      setDeleteStage('password')
      return
    }
    runDelete()
  }

  return (
    <div
      className="modal"
      role="presentation"
      onMouseDown={(e) => closable && e.target === e.currentTarget && onClose()}
    >
      <div className="modal__panel" role="dialog" aria-modal="true" aria-label="Account">
        <div className="modal__head">
          <h2 className="modal__title">Account</h2>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={!closable}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="profile stack">
          <section className="profile__section">
            <div className="profile__photo-row">
              <span className="avatar avatar--lg">
                {photoSrc ? (
                  <img src={photoSrc} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
                )}
              </span>
              <div className="profile__photo-actions">
                <button
                  type="button"
                  className="ghost-button ghost-button--sm button--icon-label"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <CameraIcon className="button-icon" />
                  {uploading ? 'Uploading…' : hasCustomPhoto ? 'Change photo' : 'Add photo'}
                </button>
                {hasCustomPhoto && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={onRemovePhoto}
                    disabled={uploading}
                  >
                    Remove
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="visually-hidden"
                  onChange={onPickPhoto}
                  aria-label="Choose a profile photo"
                />
              </div>
            </div>
            {photoError && <p className="field__hint field__hint--error">{photoError}</p>}
          </section>

          <section className="profile__section field">
            <span className="field__label">Email</span>
            <p className="field__hint">
              {providerId === 'google.com'
                ? 'Your email comes from the Google account you sign in with.'
                : 'The email behind your account.'}
            </p>
            <p className="detail-field__value">{email ?? '—'}</p>
          </section>

          <section className="profile__section field">
            <span className="field__label">Sign-in method</span>
            <div className="profile__provider">
              {providerId === 'google.com' ? (
                <GoogleIcon />
              ) : (
                <span className="profile__provider-mark" aria-hidden="true" />
              )}
              <span className="profile__provider-name">{providerLabel}</span>
              <span className="status-badge status-badge--good">
                <CheckIcon />
                Connected
              </span>
            </div>
          </section>

          <section className="profile__section">
            <button type="button" className="ghost-button button--icon-label" onClick={signOut}>
              <LogOutIcon className="button-icon" />
              Log out
            </button>
          </section>

          <section className="profile__section field">
            <span className="field__label field__label--danger">Delete account</span>
            <p className="field__hint">
              Permanently deletes your account, your schedule, and every tag. This can’t be undone.
            </p>

            {deleteStage === 'idle' && (
              <button
                type="button"
                className="danger-button button--icon-label"
                onClick={() => setDeleteStage('confirming')}
              >
                <TrashIcon className="button-icon" />
                Delete account
              </button>
            )}

            {deleteStage === 'confirming' && (
              <div className="profile__confirm">
                <p className="field__hint field__hint--error">
                  {deleteError ?? 'Are you sure? Everything you’ve scheduled will be gone.'}
                </p>
                <span className="tag-list__confirm">
                  <button type="button" className="danger-button danger-button--sm" onClick={onConfirmDelete}>
                    Yes, delete
                  </button>
                  <button
                    type="button"
                    className="ghost-button ghost-button--sm"
                    onClick={() => {
                      setDeleteStage('idle')
                      setDeleteError(null)
                    }}
                  >
                    Cancel
                  </button>
                </span>
              </div>
            )}

            {deleteStage === 'password' && (
              <form
                className="profile__confirm"
                onSubmit={(event) => {
                  event.preventDefault()
                  runDelete()
                }}
              >
                <label className="field">
                  <span className="field__label">Confirm your password</span>
                  <input
                    type="password"
                    className="input"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    autoFocus
                    required
                  />
                </label>
                {deleteError && <p className="field__hint field__hint--error">{deleteError}</p>}
                <span className="tag-list__confirm">
                  <button type="submit" className="danger-button danger-button--sm">
                    Confirm &amp; delete
                  </button>
                  <button
                    type="button"
                    className="ghost-button ghost-button--sm"
                    onClick={() => {
                      setDeleteStage('idle')
                      setDeleteError(null)
                      setPassword('')
                    }}
                  >
                    Cancel
                  </button>
                </span>
              </form>
            )}

            {deleteStage === 'working' && <p className="field__hint">Deleting your account…</p>}
          </section>
        </div>
      </div>
    </div>
  )
}
