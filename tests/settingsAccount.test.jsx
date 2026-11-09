/* The Account section of Settings — what used to be the Account dialog. Showing
 * who you are, changing the photo, and above all deleting the account, which is
 * the one irreversible thing in the app: so the order of what it does, and every
 * way it can stop partway, is pinned down here.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  provider: 'google.com',
  loading: false,
  profile: {},
  user: null,
  calls: [],
  reauthenticate: vi.fn(),
  deleteAccount: vi.fn(),
  deleteAllData: vi.fn(),
  updateProfilePhoto: vi.fn(),
  removeProfilePhoto: vi.fn(),
  unsubscribePush: vi.fn(),
  fileToAvatarDataUri: vi.fn(),
  pushError: vi.fn(),
}))

vi.mock('../src/state/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: h.user,
    reauthenticate: h.reauthenticate,
    deleteAccount: h.deleteAccount,
  }),
}))
vi.mock('../src/state/ScheduleContext.jsx', () => ({
  useSchedule: () => ({
    loading: h.loading,
    profile: h.profile,
    updateProfilePhoto: h.updateProfilePhoto,
    removeProfilePhoto: h.removeProfilePhoto,
    deleteAllData: h.deleteAllData,
  }),
}))
vi.mock('../src/state/ToastContext.jsx', () => ({
  useToast: () => ({ pushError: h.pushError }),
}))
vi.mock('../src/lib/pushSubscription.js', () => ({ unsubscribePush: h.unsubscribePush }))
vi.mock('../src/lib/image.js', () => ({ fileToAvatarDataUri: h.fileToAvatarDataUri }))

import { AccountSection } from '../src/components/settings/AccountSection.jsx'

const userFor = (providerId) => ({
  displayName: 'Sam Rivera',
  email: 'sam@example.com',
  photoURL: null,
  providerData: [{ providerId }],
})

beforeEach(() => {
  for (const fn of [h.reauthenticate, h.deleteAccount, h.deleteAllData, h.updateProfilePhoto, h.removeProfilePhoto, h.unsubscribePush, h.fileToAvatarDataUri, h.pushError]) fn.mockReset()
  h.calls = []
  h.provider = 'google.com'
  h.loading = false
  h.profile = {}
  h.user = userFor('google.com')
  const record = (name) => () => {
    h.calls.push(name)
    return Promise.resolve()
  }
  h.reauthenticate.mockImplementation(record('reauthenticate'))
  h.unsubscribePush.mockImplementation(record('unsubscribePush'))
  h.deleteAllData.mockImplementation(record('deleteAllData'))
  h.deleteAccount.mockImplementation(record('deleteAccount'))
  h.updateProfilePhoto.mockResolvedValue(undefined)
  h.removeProfilePhoto.mockResolvedValue(undefined)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('who you are', () => {
  it('shows the email and how you sign in, as one row', () => {
    const { container } = render(<AccountSection />)
    expect(screen.getByText('sam@example.com')).toBeTruthy()
    expect(screen.getByText(/comes from the Google account/)).toBeTruthy()
    expect(screen.getByText('Google')).toBeTruthy()
    // One fact, one row: the address and the method are the same "Sign-in".
    const row = screen.getByRole('heading', { name: 'Sign-in' }).closest('.settings-row')
    expect(row.textContent).toContain('sam@example.com')
    expect(row.textContent).toContain('Google')
    expect(screen.queryByRole('heading', { name: 'Email' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Sign-in method' })).toBeNull()
    // ...and no badge saying the method you are signed in with is connected.
    expect(screen.queryByText('Connected')).toBeNull()
    expect(container.querySelector('.status-badge')).toBeNull()
  })

  it('says so for a username and password account, with nothing to explain', () => {
    h.user = userFor('password')
    render(<AccountSection />)
    expect(screen.getByText('Username & password')).toBeTruthy()
    expect(screen.getByText('sam@example.com')).toBeTruthy()
    expect(screen.queryByText('The email behind your account.')).toBeNull()
    expect(screen.queryByText(/comes from the Google account/)).toBeNull()
  })

  it('shows the first letter when there is no photo', () => {
    const { container } = render(<AccountSection />)
    expect(container.querySelector('.avatar--lg').textContent).toBe('S')
    expect(screen.getByRole('button', { name: 'Add photo' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
  })
})

describe('the photo', () => {
  const pick = (container, file = new File(['x'], 'me.png', { type: 'image/png' })) =>
    fireEvent.change(container.querySelector('input[type="file"]'), { target: { files: [file] } })

  it('shrinks the chosen picture and saves it', async () => {
    h.fileToAvatarDataUri.mockResolvedValue('data:image/jpeg;base64,AAAA')
    const { container } = render(<AccountSection />)
    await act(async () => pick(container))
    expect(h.updateProfilePhoto).toHaveBeenCalledWith('data:image/jpeg;base64,AAAA')
  })

  it('says why a picture could not be used', async () => {
    h.fileToAvatarDataUri.mockRejectedValue(new Error('That is not a picture.'))
    const { container } = render(<AccountSection />)
    await act(async () => pick(container))
    expect(screen.getByText('That is not a picture.')).toBeTruthy()
    expect(h.updateProfilePhoto).not.toHaveBeenCalled()
  })

  it('offers to change and remove a photo that was set', async () => {
    h.profile = { photoBase64: 'data:image/jpeg;base64,BBBB' }
    render(<AccountSection />)
    expect(screen.getByRole('button', { name: 'Change photo' })).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Remove' })))
    expect(h.removeProfilePhoto).toHaveBeenCalled()
  })
})

describe('deleting the account', () => {
  const start = () => fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))

  it('is a heading marked as the dangerous one, and asks before doing anything', () => {
    const { container } = render(<AccountSection />)
    expect(container.querySelector('.settings-row__title--danger').textContent).toBe('Delete account')
    start()
    expect(screen.getByText(/Are you sure/)).toBeTruthy()
    expect(h.reauthenticate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeTruthy()
  })

  it('checks who you are first, then clears reminders, then the data, and only then the account', async () => {
    render(<AccountSection />)
    start()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' })))
    expect(h.calls).toEqual(['reauthenticate', 'unsubscribePush', 'deleteAllData', 'deleteAccount'])
    expect(h.reauthenticate).toHaveBeenCalledWith()
    expect(h.unsubscribePush).toHaveBeenCalledWith({ everywhere: true })
  })

  it('asks a password account for its password, and passes it on', async () => {
    h.user = userFor('password')
    render(<AccountSection />)
    start()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))
    expect(h.reauthenticate).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Confirm your password'), { target: { value: 'hunter2' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Confirm & delete/ })))
    expect(h.reauthenticate).toHaveBeenCalledWith('hunter2')
    expect(h.calls).toEqual(['reauthenticate', 'unsubscribePush', 'deleteAllData', 'deleteAccount'])
  })

  it('deletes nothing when the identity check fails, and says why', async () => {
    h.user = userFor('password')
    h.reauthenticate.mockRejectedValue({ code: 'auth/wrong-password' })
    render(<AccountSection />)
    start()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))
    fireEvent.change(screen.getByLabelText('Confirm your password'), { target: { value: 'nope' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Confirm & delete/ })))
    expect(screen.getByText('That password is not correct.')).toBeTruthy()
    expect(h.deleteAllData).not.toHaveBeenCalled()
    expect(h.deleteAccount).not.toHaveBeenCalled()
  })

  it('goes back to the confirmation when the Google prompt is closed', async () => {
    h.reauthenticate.mockRejectedValue({ code: 'auth/popup-closed-by-user' })
    render(<AccountSection />)
    start()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' })))
    expect(screen.getByText('Identity check was closed before it finished. Try again.')).toBeTruthy()
    expect(h.deleteAllData).not.toHaveBeenCalled()
  })

  it('will not run while the schedule is still loading — it would wipe nothing and still delete the account', async () => {
    h.loading = true
    render(<AccountSection />)
    start()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' })))
    expect(screen.getByText(/Still loading your schedule/)).toBeTruthy()
    expect(h.reauthenticate).not.toHaveBeenCalled()
    expect(h.deleteAllData).not.toHaveBeenCalled()
    expect(h.deleteAccount).not.toHaveBeenCalled()
  })

  it('does not stand in the way of deleting when reminders cannot be cleared', async () => {
    h.unsubscribePush.mockRejectedValue(new Error('offline'))
    render(<AccountSection />)
    start()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' })))
    expect(h.deleteAccount).toHaveBeenCalled()
  })

  it('shows progress while it runs', async () => {
    let finish
    h.deleteAllData.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    render(<AccountSection />)
    start()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' })))
    expect(screen.getByText('Deleting your account…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Yes, delete' })).toBeNull()
    await act(async () => finish())
  })

  /* The page can be left while a delete runs (the sidebar is right there; a
     dialog's Close could be disabled, a page cannot). A failure that arrives
     after that has no form left to show it on, so it becomes a toast. */
  it('raises a failure as a toast when you have already left the page', async () => {
    let fail
    h.deleteAllData.mockReturnValue(new Promise((_, reject) => (fail = reject)))
    const { unmount } = render(<AccountSection />)
    start()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' })))
    unmount()
    await act(async () => fail(new Error('Network went away.')))
    expect(h.pushError).toHaveBeenCalledTimes(1)
    expect(h.pushError.mock.calls[0][0]).toMatch(/not deleted.*Network went away\./)
  })

  it('does not toast a failure you can see on the page', async () => {
    h.deleteAllData.mockRejectedValue(new Error('Network went away.'))
    render(<AccountSection />)
    start()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Yes, delete' })))
    expect(screen.getByText('Network went away.')).toBeTruthy()
    expect(h.pushError).not.toHaveBeenCalled()
  })
})
