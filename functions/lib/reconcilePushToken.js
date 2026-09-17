/* Push token ownership — the account-isolation half of "logout does not stop
 * push".
 *
 * An FCM token identifies a device, not an account: the same physical token
 * string comes back from getToken() no matter who is signed in. So when
 * Account B enables push on a device whose token is still registered under
 * Account A (A logged out with push left on, by design), that token would
 * briefly live under BOTH uids — and the scheduler would send A's task
 * titles to B's session. A signed-in client cannot fix this itself: the
 * security rules rightly forbid one uid from deleting another uid's token
 * docs. So a Firestore trigger (see index.js) runs this with Admin SDK
 * privileges on every fcmTokens create: latest registration wins, and the
 * stale owner stops receiving pushes on this device the moment the new
 * owner opts in.
 *
 * Deliberately narrow: same-uid docs and other tokens are untouched, and a
 * doc with no token string is ignored rather than acted on.
 *
 * @param {object} opts.db     — Firestore (Admin SDK or FakeFirestore)
 * @param {string} opts.uid    — owner uid from the created doc's path
 * @param {string} opts.token  — token string from the created doc's data
 * @param {object} [opts.logger] — {warn}
 * @return {{removed:number}} — how many stale other-owner docs were deleted
 */
export async function reconcilePushToken({ db, uid, token, logger = console }) {
  if (!uid || !token) return { removed: 0 }
  const snap = await db.collectionGroup('fcmTokens').where('token', '==', token).get()
  let removed = 0
  for (const doc of snap.docs) {
    const ownerUid = doc.ref.parent.parent.id
    if (ownerUid === uid) continue
    try {
      await doc.ref.delete()
      removed += 1
    } catch (caught) {
      logger.warn('Could not remove a superseded push token.', caught)
    }
  }
  return { removed }
}
