import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../state/AuthContext.jsx'
import { useSchedule } from '../../state/ScheduleContext.jsx'
import { useToast } from '../../state/ToastContext.jsx'
import { fileToAvatarDataUri } from '../../lib/image.js'
import { unsubscribePush } from '../../lib/pushSubscription.js'
import { CameraIcon, CheckIcon, GoogleIcon, TrashIcon } from '../icons.jsx'
import { Row } from './SettingsParts.jsx'

const PROVIDER_LABEL = {
  'google.com': 'Google',
  password: 'Username & password',
}

/**
 * Everything about the signed-in account: the photo, how you sign in, and
 * deleting the account entirely. It used to be a modal behind the avatar menu.
 *
 * A modal could stop you leaving mid-delete (its Close was disabled while the
 * wipe ran); a page cannot — the sidebar is still right there. Navigating away
 * does not stop the delete, it only unmounts this, so a late failure would have
 * nowhere on screen to report to. That case is handled by `mounted` below: a
 * failure that lands after this has gone is raised as a toast instead.
 */
export function AccountSection() {
  const { user, reauthenticate, deleteAccount } = useAuth()
  const { profile, loading, updateProfilePhoto, removeProfilePhoto, deleteAllData } = useSchedule()
  const { pushError } = useToast()
  const fileInputRef = useRef(null)

  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState(null)

  const [deleteStage, setDeleteStage] = useState('idle') // idle | confirming | password | working
  const [deleteError, setDeleteError] = useState(null)
  const [password, setPassword] = useState('')

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const name = user?.displayName?.trim() || user?.email || 'Signed in'
  const email = user?.email ?? null
  const providerId = user?.providerData?.[0]?.providerId
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
     the identity check has already succeeded. This guard is the other half
     of that same carefulness: deleteAllData() reads whatever's currently in
     the tasks/events/tags state, and right after sign-in that can still be
     empty — the first Firestore snapshot hasn't landed yet, even from
     cache. Deleting then would "succeed" having wiped nothing, and the
     account would vanish with real data still sitting in Firestore. */
  async function runDelete() {
    if (loading) {
      setDeleteError('Still loading your schedule — wait a moment and try again.')
      setDeleteStage('confirming')
      return
    }
    setDeleteError(null)
    setDeleteStage('working')
    try {
      if (providerId === 'password') {
        await reauthenticate(password)
      } else {
        await reauthenticate()
      }
      /* Reminders are keyed by account and outlive a sign-out on purpose, so
         deleting the account has to take them with it — while a session still
         exists to authorise that. Best effort: failing to reach the server
         must not stand between someone and deleting their account. */
      try {
        await unsubscribePush({ everywhere: true })
      } catch (caught) {
        console.warn('Could not clear push reminders before deleting the account.', caught)
      }
      await deleteAllData()
      await deleteAccount()
      // No further state to set: deleteAccount() signs the account out, and
      // the app-wide auth listener swaps this whole tree for the sign-in
      // screen before another render of this component would matter.
    } catch (caught) {
      console.error('Could not delete the account.', caught)
      let message
      if (caught.code === 'auth/wrong-password' || caught.code === 'auth/invalid-credential') {
        message = 'That password is not correct.'
        setDeleteStage('password')
      } else if (caught.code === 'auth/popup-closed-by-user') {
        message = 'Identity check was closed before it finished. Try again.'
        setDeleteStage('confirming')
      } else if (caught.code === 'auth/requires-recent-login') {
        message = 'Enter your password to confirm.'
        setDeleteStage('password')
      } else {
        message = caught.message ?? 'Could not delete your account.'
        setDeleteStage('confirming')
      }
      setDeleteError(message)
      // Left this page while it ran: there is no form left to show it on.
      if (!mounted.current) pushError(`Your account was not deleted. ${message}`)
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
    <>
      <Row title="Photo" hint="Shown on your account button in the sidebar.">
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
              <button type="button" className="link-button" onClick={onRemovePhoto} disabled={uploading}>
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
      </Row>

      <Row
        title="Email"
        hint={
          providerId === 'google.com'
            ? 'Your email comes from the Google account you sign in with.'
            : 'The email behind your account.'
        }
      >
        <p className="detail-field__value">{email ?? '—'}</p>
      </Row>

      <Row title="Sign-in method">
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
      </Row>

      <Row
        title="Delete account"
        danger
        hint="Permanently deletes your account, your schedule, and every tag. This can’t be undone."
      >
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
      </Row>
    </>
  )
}
