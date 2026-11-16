# Test skeletons

Each is trimmed from a real file; open that file for fuller examples. Replace the names, keep the shape.

## Pure logic: node:test (`tests/<name>.test.js`)

From `tests/recurrence.test.js`. No JSX, no clock, fixed day keys.

```js
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { occursOn } from '@cadence/shared/recurrence.js'
import { addDays } from '@cadence/shared/date.js'

// 2026-08-24 is a Monday; the week that follows it is used throughout.
const MON = '2026-08-24'

const series = (patch = {}) => ({
  id: 'abc',
  title: 'Morning run',
  date: MON,
  startMin: 7 * 60,
  recurrence: { days: [0, 1, 2, 3, 4, 5, 6], anchor: MON },
  overrides: {},
  ...patch,
})

describe('occursOn', () => {
  it('lands on every day an every-day rule covers', () => {
    // Why the case exists goes in a comment, as here.
    assert.equal(occursOn(series(), addDays(MON, 3)), true)
  })
})
```

## Component with mocked contexts: vitest (`tests/<name>.test.jsx`)

From `tests/itemManager.test.jsx`. The block comment at the top is part of the convention.

```jsx
/* <What the component is.> What is worth pinning is the promises, not the data:
 * - <promise 1>
 * - <promise 2>
 *
 * ScheduleContext / ToastContext are mocked rather than provided — a real
 * ScheduleContext needs Firebase, and this file has nothing to prove about
 * Firestore beyond which functions get called with what.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { todayKey } from '@cadence/shared/date.js'

const TODAY = todayKey()

// Mutable state the mocks read. vi.hoisted so it exists when vi.mock runs.
const h = vi.hoisted(() => ({
  tasks: [],
  removeTask: vi.fn(async () => {}),
  pushError: vi.fn(),
}))

// Supply only what this component reads, and mirror any new member everywhere
// the component is mocked (and in tests/smoke/mockSchedule.jsx).
vi.mock('../src/state/ScheduleContext.jsx', () => ({
  useSchedule: () => ({ tasks: h.tasks, removeTask: h.removeTask }),
}))
vi.mock('../src/state/ToastContext.jsx', () => ({
  useToast: () => ({ pushError: h.pushError }),
}))

// Import the component only after the mocks.
import { Thing } from '../src/components/editors/Thing.jsx'

const task = (id, title, patch = {}) => ({ id, title, date: null, startMin: null, done: false, ...patch })

const onClose = vi.fn()

beforeEach(() => {
  h.tasks = [task('t1', 'Write report', { date: TODAY, startMin: 570 })]
  for (const fn of [h.removeTask, h.pushError, onClose]) fn.mockClear()
})

describe('the dialog', () => {
  it('is one dialog with a name, closed by Close and by the backdrop', () => {
    const { container } = render(<Thing onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'Thing' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.mouseDown(container.querySelector('.modal'))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
```

Faking "today" (from `tests/authCalendar.test.jsx`):

```jsx
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

const setToday = (iso) => vi.setSystemTime(new Date(`${iso}T10:30:00`)) // local time, no Z

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }) // only Date: leave setTimeout/RAF alone
  setToday('2026-11-07')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
```

A Journal/TipTap component (from `tests/journalSurface.test.jsx`): call `installProseMirrorDom` once and drive the editor through its command API, since jsdom has no layout for real typing.

```jsx
import { beforeAll } from 'vitest'
import { installProseMirrorDom } from './helpers/prosemirrorDom.js'
beforeAll(installProseMirrorDom)
```

## An api route: vitest, node project (`tests/<name>.test.jsx`, listed in `apiTests`)

From `tests/apiHandlers.test.jsx`. If the route is one of the six AI routes, add it to that file's `it.each` tables (405, 401, Gemini 429) instead of making a new file; a new file needs its own entry in `apiTests`.

```jsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeRedis } from './fakeRedis.js'

const holder = vi.hoisted(() => ({ redis: null }))
vi.mock('../api/_lib/redis.js', () => ({ getRedis: () => holder.redis }))
vi.mock('../api/_lib/auth.js', async () => {
  const actual = await vi.importActual('../api/_lib/auth.js')
  return { ...actual, verifyRequest: vi.fn() } // keep AuthError, replace the network call
})
vi.mock('../api/_lib/gemini.js', async () => {
  const actual = await vi.importActual('../api/_lib/gemini.js')
  return { ...actual, generateJson: vi.fn() } // keep GeminiError
})

import { verifyRequest, AuthError } from '../api/_lib/auth.js'
import { generateJson, GeminiError } from '../api/_lib/gemini.js'
import handler from '../api/my-route.js'

const fakeReq = ({ method = 'POST', body = {}, headers = { authorization: 'Bearer token' } } = {}) => ({ method, body, headers })
const fakeRes = () => {
  const res = { statusCode: null, body: null }
  res.status = (code) => ((res.statusCode = code), res)
  res.json = (payload) => ((res.body = payload), res)
  return res
}

beforeEach(() => {
  vi.resetAllMocks()
  verifyRequest.mockResolvedValue('uid-1')
  holder.redis = new FakeRedis()
})

describe('my-route', () => {
  it('400s when a required field is missing', async () => {
    const res = fakeRes()
    await handler(fakeReq({ body: {} }), res)
    expect(res.statusCode).toBe(400)
  })

  it('rebuilds the model answer instead of passing it through', async () => {
    generateJson.mockResolvedValue({ title: 'x', rogue: 'dropped' })
    const res = fakeRes()
    await handler(fakeReq({ body: { text: 'hello' } }), res)
    expect(res.body).not.toHaveProperty('rogue')
  })
})
```

## A Firestore rule (`tests/rules/firestoreRules.spec.mjs`)

Add to the existing file; it already has the environment, `alice()`, `bob()`, `anon()` and `seed()`.

```js
describe('the profile doc: <new field>', () => {
  it('accepts a valid value from its owner', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice'), { username: 'Alice', email: 'alice@example.com', createdAt: 1, newField: true }))
  })
  it('refuses a bad value, and another account writing it', async () => {
    await seed('users/alice', { username: 'Alice', email: 'alice@example.com', createdAt: 1 })
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { newField: 'not-a-boolean' }))
    await assertFails(updateDoc(doc(bob(), 'users/alice'), { newField: true }))
  })
})
```

Subcollection documents (`users/{uid}/tasks/...`) have no shape checks in the rules, only owner access; their shape is enforced on read by the normalizers (`tests/normalize.test.js`).

## A Cloud Function (`functions/test/<name>.test.js`)

From `functions/test/runDailyDigest.test.js`: pass fakes in, never the real SDKs.

```js
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { runDailyDigest } from '../lib/runDailyDigest.js'
import { FakeFirestore, seedUser } from './fakeFirestore.js'

const DAY = '2026-08-24'
const silent = { warn() {}, error() {} }

describe('runDailyDigest', () => {
  it('skips a user who has not opted in', async () => {
    const db = new FakeFirestore()
    seedUser(db, 'u1', { profile: { dailyDigestEnabled: false }, tasks: [{ id: 't', title: 'x', date: DAY }] })
    const result = await runDailyDigest({ db, sendEmail: async () => ({ ok: true }), resolveRecipient: async () => 'a@example.com', todayKey: DAY, nowMin: 420, logger: silent })
    assert.deepEqual(result, { usersProcessed: 0, emailsSent: 0 })
  })
})
```

If the function code needs a `packages/shared` file that is not one of the four copied by `scripts/syncSharedLib.mjs`, add it to `FILES` there first (and anything it imports).

## An SSR smoke case (`tests/smoke/entry.jsx`)

```jsx
// 1. import the view at the top with the others
import { MyView } from '../../src/components/views/MyView.jsx'

// 2. add to `cases`
['MyView', <MyView focusKey={KEY} onEdit={noop} onCreate={noop} />],

// 3. add a markup check below, after `html` is built. Built from mockValue, never
//    from today's date or the current hour.
expect('MyView shows the all-day item', render(<MyView focusKey={KEY} />).includes('All-day: conference'))
```

If `MyView` calls a `useSchedule()` member or imports a name from a real context that the fixture lacks, add it to `tests/smoke/mockSchedule.jsx` (`mockValue`, or a mirrored export) first.
