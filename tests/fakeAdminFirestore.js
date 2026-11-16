/* A small in-memory stand-in for the Firebase Admin SDK's Firestore, covering
 * exactly what mcp/store.js calls: collection().doc().collection() chains,
 * get(), add(), where(field, '==', value), and update() in both its forms —
 * an object of fields, or (FieldPath, value, ...moreFieldsAndValues).
 *
 * Same idea as functions/test/fakeFirestore.js: real data and real async
 * behaviour, but only the surface the code under test uses. update() on a
 * missing document throws, as Firestore's does, so a write that should have
 * been guarded by a read shows up as a failure rather than quietly creating a
 * stub document.
 */

export const DELETE = Symbol('fieldValue.delete')
export const deleteField = () => DELETE
export const fieldPath = (...segments) => ({ segments })

const clone = (value) => (value === undefined ? value : structuredClone(value))

/** The real Admin SDK refuses an `undefined` field value (unless the app opts in
    to ignoreUndefinedProperties, which this code does not). A fake that quietly
    stored it would let a bug pass every test and fail only against Firestore, so
    this refuses it the same way, anywhere in the data. */
function assertDefined(value, where) {
  if (value === undefined) {
    throw new Error(`Cannot use "undefined" as a Firestore value (found at ${where}).`)
  }
  if (Array.isArray(value)) value.forEach((item, i) => assertDefined(item, `${where}[${i}]`))
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) assertDefined(item, `${where}.${key}`)
  }
}

function setAtPath(target, segments, value) {
  let node = target
  for (const key of segments.slice(0, -1)) {
    if (node[key] === null || typeof node[key] !== 'object') node[key] = {}
    node = node[key]
  }
  const last = segments[segments.length - 1]
  if (value === DELETE) delete node[last]
  else node[last] = value
}

class DocRef {
  constructor(db, path) {
    this.db = db
    this.path = path
    this.id = path[path.length - 1]
  }

  collection(name) {
    return new CollectionRef(this.db, [...this.path, name])
  }

  async get() {
    const key = this.path.join('/')
    const data = this.db.docs.get(key)
    return { exists: data !== undefined, id: this.id, data: () => clone(data), ref: this }
  }

  async set(data) {
    const key = this.path.join('/')
    assertDefined(data, key)
    this.db.docs.set(key, clone(data))
    this.db.writes.push({ op: 'set', path: key })
  }

  async update(...args) {
    const key = this.path.join('/')
    const current = this.db.docs.get(key)
    if (current === undefined) throw new Error(`NOT_FOUND: no document to update at ${key}`)

    const next = clone(current)
    if (args.length === 1 && typeof args[0] === 'object' && !args[0].segments) {
      assertDefined(args[0], key)
      for (const [field, value] of Object.entries(args[0])) setAtPath(next, [field], value)
    } else {
      for (let i = 0; i < args.length; i += 2) {
        const field = args[i]
        assertDefined(args[i + 1], `${key}#${typeof field === 'string' ? field : field.segments.join('.')}`)
        setAtPath(next, typeof field === 'string' ? field.split('.') : field.segments, args[i + 1])
      }
    }
    this.db.docs.set(key, next)
    this.db.writes.push({ op: 'update', path: key })
  }
}

class Query {
  constructor(db, path, predicate) {
    this.col = new CollectionRef(db, path)
    this.predicate = predicate
  }

  async get() {
    const snap = await this.col.get()
    const docs = snap.docs.filter((d) => this.predicate(d.data()))
    return { empty: docs.length === 0, docs }
  }
}

class CollectionRef {
  constructor(db, path) {
    this.db = db
    this.path = path
  }

  doc(id) {
    // With no argument the real SDK generates an id, as the app's own
    // doc(collection) does.
    if (id === undefined) {
      this.db.nextId += 1
      id = `auto${String(this.db.nextId).padStart(4, '0')}`
    }
    // Every id the code under test asks for, so a test can prove an
    // attacker-shaped id never reached the database layer at all.
    this.db.requestedIds.push(id)
    return new DocRef(this.db, [...this.path, id])
  }

  where(field, op, value) {
    if (op !== '==') throw new Error(`fake supports only '==', got '${op}'`)
    return new Query(this.db, this.path, (data) => data[field] === value)
  }

  async add(data) {
    assertDefined(data, this.path.join('/'))
    this.db.nextId += 1
    const id = `auto${String(this.db.nextId).padStart(4, '0')}`
    const ref = this.doc(id)
    this.db.docs.set(ref.path.join('/'), clone(data))
    this.db.writes.push({ op: 'add', path: ref.path.join('/') })
    return ref
  }

  async get() {
    const prefix = `${this.path.join('/')}/`
    const depth = this.path.length + 1
    const docs = [...this.db.docs.entries()]
      .filter(([key]) => key.startsWith(prefix) && key.split('/').length === depth)
      .map(([key]) => new DocRef(this.db, key.split('/')))
      .map((ref) => ({ id: ref.id, ref, data: () => clone(this.db.docs.get(ref.path.join('/'))) }))
    return { empty: docs.length === 0, docs }
  }
}

export class FakeAdminFirestore {
  constructor() {
    this.docs = new Map()
    this.writes = []
    this.requestedIds = []
    this.nextId = 0
  }

  collection(name) {
    return new CollectionRef(this, [name])
  }

  /** Writes are staged and applied together on commit(), like the real batch. */
  batch() {
    const staged = []
    const batch = {
      set: (ref, data) => (staged.push(() => ref.set(data)), batch),
      update: (ref, ...args) => (staged.push(() => ref.update(...args)), batch),
      async commit() {
        for (const apply of staged) await apply()
      },
    }
    return batch
  }

  /** The callback's reads run live; its writes apply only if it resolves, so a
      thrown refusal inside a transaction leaves nothing behind, as in Firestore. */
  async runTransaction(fn) {
    const staged = []
    const tx = {
      get: (ref) => ref.get(),
      set: (ref, data) => (staged.push(() => ref.set(data)), tx),
      update: (ref, ...args) => (staged.push(() => ref.update(...args)), tx),
    }
    const result = await fn(tx)
    for (const apply of staged) await apply()
    return result
  }

  /** Put a document in place, by its full path ('users/u1/tasks/t1'). */
  seed(path, data) {
    this.docs.set(path, clone(data))
    return this
  }

  read(path) {
    return clone(this.docs.get(path))
  }
}
