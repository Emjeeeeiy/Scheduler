/* firestore.rules against the Firestore emulator — the rules are the app's
 * actual security boundary, so they get tested like code.
 *
 * Needs the emulator, so it is NOT part of `npm test`/`npm run test:dom`
 * (hence `.spec.mjs`, outside both globs). Run it with:
 *
 *   npm run test:rules
 *
 * which wraps this file in `firebase emulators:exec --only firestore`.
 * The emulator needs a recent JDK (CI installs Java 21).
 */

import { readFileSync } from 'node:fs'
import { after, before, beforeEach, describe, it } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

let env

const alice = () => env.authenticatedContext('alice', { email: 'alice@example.com', email_verified: true }).firestore()
const bob = () => env.authenticatedContext('bob', { email: 'bob@example.com', email_verified: true }).firestore()
const anon = () => env.unauthenticatedContext().firestore()

const PHOTO = `data:image/jpeg;base64,${'A'.repeat(1000)}`

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-cadence-rules',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  })
})

after(async () => {
  await env?.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
})

/** Seeds a document as an admin, bypassing the rules. */
const seed = (path, data) =>
  env.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), path), data))

describe('the retired usernames collection', () => {
  it('cannot be read by anyone, signed in or not', async () => {
    await seed('usernames/alice', { uid: 'alice', email: 'alice@example.com', createdAt: 1 })
    await assertFails(getDoc(doc(anon(), 'usernames/alice')))
    await assertFails(getDoc(doc(bob(), 'usernames/alice')))
    await assertFails(getDoc(doc(alice(), 'usernames/alice')))
  })

  it('cannot be written', async () => {
    await assertFails(setDoc(doc(alice(), 'usernames/zed'), { uid: 'alice', email: 'alice@example.com', createdAt: 1 }))
  })
})

describe('the profile doc', () => {
  it('can be created by its owner with the registration fields', async () => {
    await assertSucceeds(
      setDoc(doc(alice(), 'users/alice'), { username: 'Alice', email: 'alice@example.com', createdAt: 1 }),
    )
  })

  it('refuses an email that is not the signed-in account’s own', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice'), { username: 'Alice', email: 'victim@example.com', createdAt: 1 }))
    await seed('users/alice', { username: 'Alice', email: 'alice@example.com', createdAt: 1 })
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { email: 'victim@example.com' }))
  })

  it('refuses fields that are not part of the profile', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice'), { username: 'Alice', isAdmin: true }))
    await seed('users/alice', { username: 'Alice' })
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { junk: 'x'.repeat(1000) }))
  })

  it('accepts the digest toggle and a small avatar, and removing it', async () => {
    await seed('users/alice', { username: 'Alice', email: 'alice@example.com', createdAt: 1 })
    await assertSucceeds(setDoc(doc(alice(), 'users/alice'), { dailyDigestEnabled: true }, { merge: true }))
    await assertSucceeds(setDoc(doc(alice(), 'users/alice'), { photoBase64: PHOTO }, { merge: true }))
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { photoBase64: deleteField() }))
  })

  it('refuses a non-boolean digest flag, a remote photo, and an oversized one', async () => {
    await seed('users/alice', { username: 'Alice' })
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { dailyDigestEnabled: 'yes' }))
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { photoBase64: 'https://tracker.example/p.png' }))
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { photoBase64: `data:image/jpeg;base64,${'A'.repeat(200_001)}` }))
  })

  it('lets a legacy field already on the doc ride along with an unrelated update', async () => {
    await seed('users/alice', { username: 'x'.repeat(500), legacyThing: 1 })
    await assertSucceeds(setDoc(doc(alice(), 'users/alice'), { dailyDigestEnabled: false }, { merge: true }))
  })

  it('accepts what Google sign-in writes', async () => {
    await assertSucceeds(
      setDoc(doc(alice(), 'users/alice'), { email: 'alice@example.com', displayName: null }, { merge: true }),
    )
  })

  it('is invisible to everyone else', async () => {
    await seed('users/alice', { username: 'Alice' })
    await assertFails(getDoc(doc(bob(), 'users/alice')))
    await assertFails(getDoc(doc(anon(), 'users/alice')))
    await assertFails(setDoc(doc(bob(), 'users/alice'), { username: 'Bob' }, { merge: true }))
  })
})

describe('the owner’s subtree', () => {
  it('is fully readable and writable by its owner, at any depth', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/tasks/t1'), { title: 'Standup' }))
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/journal/n1/content/body'), { json: '{}' }))
    await assertSucceeds(getDoc(doc(alice(), 'users/alice/tasks/t1')))
  })

  it('is closed to every other account', async () => {
    await seed('users/alice/tasks/t1', { title: 'Standup' })
    await assertFails(getDoc(doc(bob(), 'users/alice/tasks/t1')))
    await assertFails(setDoc(doc(bob(), 'users/alice/tasks/t2'), { title: 'x' }))
    await assertFails(getDoc(doc(anon(), 'users/alice/tasks/t1')))
  })
})

describe('everything else', () => {
  it('is denied by default', async () => {
    await assertFails(setDoc(doc(alice(), 'somethingNew/x'), { a: 1 }))
    await assertFails(getDoc(doc(alice(), 'somethingNew/x')))
  })
})
