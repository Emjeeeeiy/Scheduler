/* A small, purpose-built stand-in for the Admin SDK — not a general
 * Firestore emulator, just the exact surface runDailyDigest.js actually
 * calls: collection().doc().collection()... chains, where('field','==',
 * value), and get()/set(). Real in-memory data, real async behaviour
 * (every read/write is a genuine Promise) — the goal is to exercise the
 * orchestration code exactly as written, not to reimplement Firestore.
 */

class DocRef {
  constructor(store, path) {
    this.store = store
    this.path = path
    this.id = path[path.length - 1]
  }

  collection(name) {
    return new CollectionRef(this.store, [...this.path, name])
  }

  async get() {
    const data = this.store.docs.get(this.path.join('/'))
    return {
      exists: data !== undefined,
      id: this.id,
      data: () => data,
      ref: this,
    }
  }

  async set(data) {
    this.store.docs.set(this.path.join('/'), data)
  }
}

class CollectionRef {
  constructor(store, path) {
    this.store = store
    this.path = path
  }

  doc(id) {
    return new DocRef(this.store, [...this.path, id])
  }

  /** Every stored doc whose path is exactly one segment longer than this
      collection's own path, and starts with it — a direct child, not a
      deeper descendant. */
  _children() {
    const prefix = this.path.join('/')
    const depth = this.path.length + 1
    return [...this.store.docs.entries()]
      .filter(([key]) => key.startsWith(`${prefix}/`) && key.split('/').length === depth)
      .map(([key, data]) => ({ key, data }))
  }

  where(field, op, value) {
    if (op !== '==') throw new Error(`fakeFirestore only supports '==', got '${op}'`)
    return new Query(this.store, this.path, (data) => data[field] === value)
  }

  async get() {
    if (this.store.failPaths?.has(this.path.join('/'))) {
      throw new Error(`simulated read failure: ${this.path.join('/')}`)
    }
    const rows = this._children()
    return {
      empty: rows.length === 0,
      docs: rows.map(({ key, data }) => ({
        id: key.split('/').pop(),
        data: () => data,
        ref: new DocRef(this.store, key.split('/')),
      })),
    }
  }
}

class Query {
  constructor(store, path, predicate) {
    this.collection = new CollectionRef(store, path)
    this.predicate = predicate
  }

  async get() {
    const all = await this.collection.get()
    const docs = all.docs.filter((d) => this.predicate(d.data()))
    return { empty: docs.length === 0, docs }
  }
}

export class FakeFirestore {
  constructor(seed = {}) {
    /* Flat map of "a/b/c" -> data, the same shape a real Firestore path
       flattens to. `seed` is written in the nested shape callers actually
       think in — see `seedUser` below — and flattened once here. */
    this.docs = new Map()
    for (const [path, data] of Object.entries(seed)) this.docs.set(path, data)
    /* Collection paths (e.g. "users/broken/tasks") whose next .get() should
       reject instead of returning data — the one hook this fake needs to
       let a test prove "one user's bad read doesn't take the whole run
       down," without reaching for a real, harder-to-reason-about failure
       (corrupt data doesn't work: normalizeTask is deliberately built to
       never throw on that, see normalize.js). */
    this.failPaths = new Set()
  }

  collection(name) {
    return new CollectionRef(this, [name])
  }
}

/** Writes `users/{uid}/tasks/{id}` for each task in `tasks` (each already
    shaped `{ id, ...fields }`), and any extra top-level fields (like
    `dailyDigestEnabled`, `email`) onto `users/{uid}` itself. */
export function seedUser(store, uid, { profile = {}, tasks = [] } = {}) {
  store.docs.set(`users/${uid}`, profile)
  for (const { id, ...fields } of tasks) store.docs.set(`users/${uid}/tasks/${id}`, fields)
}
