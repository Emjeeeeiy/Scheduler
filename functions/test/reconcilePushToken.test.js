import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { reconcilePushToken } from '../lib/reconcilePushToken.js'
import { FakeFirestore, seedUser } from './fakeFirestore.js'

const silent = { warn() {}, error() {} }

function tokenDocs(db) {
  return [...db.docs.keys()].filter((key) => key.includes('/fcmTokens/')).sort()
}

describe('reconcilePushToken', () => {
  it('removes the same device token registered under a previous owner', async () => {
    const db = new FakeFirestore()
    // Account A enabled push, logged out with it left on (by design), then
    // Account B enabled push on the same device — FCM hands back the same
    // token string, so it now exists under both uids.
    seedUser(db, 'account-a', { fcmTokens: ['device-token-t'] })
    seedUser(db, 'account-b', { fcmTokens: ['device-token-t'] })

    const result = await reconcilePushToken({ db, uid: 'account-b', token: 'device-token-t', logger: silent })

    assert.deepEqual(result, { removed: 1 })
    assert.deepEqual(tokenDocs(db), ['users/account-b/fcmTokens/device-token-t'])
  })

  it('leaves same-owner docs and unrelated tokens alone', async () => {
    const db = new FakeFirestore()
    seedUser(db, 'account-b', { fcmTokens: ['device-token-t', 'tablet-token-x'] })
    seedUser(db, 'account-a', { fcmTokens: ['other-phone-token-y'] })

    const result = await reconcilePushToken({ db, uid: 'account-b', token: 'device-token-t', logger: silent })

    assert.deepEqual(result, { removed: 0 })
    assert.deepEqual(tokenDocs(db), [
      'users/account-a/fcmTokens/other-phone-token-y',
      'users/account-b/fcmTokens/device-token-t',
      'users/account-b/fcmTokens/tablet-token-x',
    ])
  })

  it('is a no-op without a uid or token', async () => {
    const db = new FakeFirestore()
    seedUser(db, 'account-a', { fcmTokens: ['device-token-t'] })

    assert.deepEqual(await reconcilePushToken({ db, uid: '', token: 'device-token-t', logger: silent }), {
      removed: 0,
    })
    assert.deepEqual(await reconcilePushToken({ db, uid: 'account-a', token: '', logger: silent }), {
      removed: 0,
    })
    assert.deepEqual(tokenDocs(db), ['users/account-a/fcmTokens/device-token-t'])
  })
})
