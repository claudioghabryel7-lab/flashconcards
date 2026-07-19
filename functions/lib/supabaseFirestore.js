/**
 * Firestore-compatible API backed by Supabase table `firestore_docs`.
 * Used by Cloud Functions when USE_SUPABASE=true.
 */
const { createClient } = require('@supabase/supabase-js')

let client = null

function useSupabaseDatabase() {
  return (
    String(process.env.USE_SUPABASE || '').toLowerCase() === 'true' &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) &&
    Boolean(process.env.SUPABASE_URL)
  )
}

function getClient() {
  if (!client) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}

class SupabaseTimestamp {
  constructor(value) {
    this._date = value instanceof Date ? value : new Date(value)
  }

  toDate() {
    return this._date
  }

  static now() {
    return new SupabaseTimestamp(new Date())
  }

  static fromDate(date) {
    return new SupabaseTimestamp(date)
  }
}

const FieldValue = {
  serverTimestamp: () => ({ __op: 'serverTimestamp' }),
  increment: (n) => ({ __op: 'increment', n }),
  arrayUnion: (...items) => ({ __op: 'arrayUnion', items }),
  arrayRemove: (...items) => ({ __op: 'arrayRemove', items }),
  delete: () => ({ __op: 'deleteField' }),
}

function splitPath(path) {
  const parts = String(path).split('/').filter(Boolean)
  const docId = parts.pop()
  const parentPath = parts.join('/')
  return { path: parts.length ? `${parts.join('/')}/${docId}` : docId, parentPath: parts.join('/'), docId }
}

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof SupabaseTimestamp)
}

function resolveWriteValue(value) {
  if (value && value.__op === 'serverTimestamp') return new Date().toISOString()
  if (value instanceof SupabaseTimestamp) return value.toDate().toISOString()
  if (value && typeof value.toDate === 'function') return value.toDate().toISOString()
  if (Array.isArray(value)) return value.map(resolveWriteValue)
  if (isPlainObject(value)) {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = resolveWriteValue(v)
    return out
  }
  return value
}

function setNested(obj, dottedKey, value) {
  const keys = dottedKey.split('.')
  let cur = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    if (!isPlainObject(cur[k])) cur[k] = {}
    cur = cur[k]
  }
  cur[keys[keys.length - 1]] = value
}

function applyFieldValue(existing, key, value) {
  if (value && value.__op === 'deleteField') return { __deleteKey: key }
  if (value && value.__op === 'increment') {
    const base = Number(existing?.[key] || 0)
    return base + Number(value.n || 0)
  }
  if (value && value.__op === 'arrayUnion') {
    const base = Array.isArray(existing?.[key]) ? [...existing[key]] : []
    for (const item of value.items) {
      if (!base.some((x) => JSON.stringify(x) === JSON.stringify(item))) base.push(resolveWriteValue(item))
    }
    return base
  }
  if (value && value.__op === 'arrayRemove') {
    const base = Array.isArray(existing?.[key]) ? [...existing[key]] : []
    return base.filter((x) => !value.items.some((r) => JSON.stringify(r) === JSON.stringify(x)))
  }
  return resolveWriteValue(value)
}

function mergePatch(existing, patch, { merge = true } = {}) {
  const base = merge && existing ? JSON.parse(JSON.stringify(existing)) : {}
  for (const [key, value] of Object.entries(patch || {})) {
    const applied = applyFieldValue(base, key, value)
    if (applied && applied.__deleteKey) {
      deleteNested(base, key)
      continue
    }
    if (key.includes('.')) setNested(base, key, applied)
    else base[key] = applied
  }
  return base
}

function deleteNested(obj, dottedKey) {
  const keys = dottedKey.split('.')
  let cur = obj
  for (let i = 0; i < keys.length - 1; i++) {
    if (!cur[keys[i]]) return
    cur = cur[keys[i]]
  }
  delete cur[keys[keys.length - 1]]
}

function reviveValue(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return SupabaseTimestamp.fromDate(new Date(value))
  }
  if (Array.isArray(value)) return value.map(reviveValue)
  if (isPlainObject(value)) {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = reviveValue(v)
    return out
  }
  return value
}

async function fetchRow(path) {
  const { data, error } = await getClient().from('firestore_docs').select('*').eq('path', path).maybeSingle()
  if (error) throw error
  return data
}

async function fetchByParent(parentPath) {
  const { data, error } = await getClient().from('firestore_docs').select('*').eq('parent_path', parentPath)
  if (error) throw error
  return data || []
}

function autoId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 20; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return id
}

function matchesWhere(data, { field, op, value }) {
  const v = field.includes('.') ? field.split('.').reduce((o, k) => o?.[k], data) : data?.[field]
  switch (op) {
    case '==':
      return v === value
    case '!=':
      return v !== value
    case 'in':
      return Array.isArray(value) && value.includes(v)
    case 'not-in':
      return Array.isArray(value) && !value.includes(v)
    case 'array-contains':
      return Array.isArray(v) && v.includes(value)
    case '>':
      return v > value
    case '>=':
      return v >= value
    case '<':
      return v < value
    case '<=':
      return v <= value
    default:
      return true
  }
}

function applyConstraints(rows, constraints = []) {
  let result = [...rows]
  for (const c of constraints) {
    if (c.type === 'where') result = result.filter((r) => matchesWhere(r.data, c))
    if (c.type === 'orderBy') {
      result.sort((a, b) => {
        const av = a.data?.[c.field]
        const bv = b.data?.[c.field]
        if (av === bv) return 0
        if (av == null) return 1
        if (bv == null) return -1
        return c.direction === 'desc' ? (av < bv ? 1 : -1) : av > bv ? 1 : -1
      })
    }
    if (c.type === 'limit') result = result.slice(0, c.n)
  }
  return result
}

class DocumentSnapshot {
  constructor(row, ref) {
    this._row = row
    this.id = ref?.id || row?.doc_id
    this.ref = ref || (row ? new DocumentReference(row.path) : null)
    this.exists = Boolean(row)
  }

  data() {
    if (!this._row) return undefined
    return reviveValue(this._row.data || {})
  }
}

class QuerySnapshot {
  constructor(rows) {
    this.docs = rows.map((row) => new DocumentSnapshot(row, new DocumentReference(row.path)))
    this.empty = rows.length === 0
    this.size = rows.length
  }

  forEach(fn) {
    this.docs.forEach(fn)
  }
}

class DocumentReference {
  constructor(path) {
    this.path = path
    const parsed = splitPath(path)
    this.id = parsed.docId
    this.parent = new CollectionReference(parsed.parentPath)
  }

  collection(name) {
    return new CollectionReference(`${this.path}/${name}`)
  }

  async get() {
    const row = await fetchRow(this.path)
    return new DocumentSnapshot(row, this)
  }

  async set(data, options = {}) {
    const existing = options.merge ? (await fetchRow(this.path))?.data : null
    const payload = mergePatch(existing, data, { merge: Boolean(options.merge) })
    const parsed = splitPath(this.path)
    const now = new Date().toISOString()
    const row = {
      path: this.path,
      parent_path: parsed.parentPath,
      doc_id: parsed.docId,
      data: payload,
      updated_at: now,
    }
    if (!existing) row.created_at = now
    const { error } = await getClient().from('firestore_docs').upsert(row, { onConflict: 'path' })
    if (error) throw error
  }

  async update(data) {
    const existing = (await fetchRow(this.path))?.data || {}
    await this.set(mergePatch(existing, data, { merge: true }), { merge: true })
  }

  async delete() {
    const { error } = await getClient().from('firestore_docs').delete().eq('path', this.path)
    if (error) throw error
  }
}

class CollectionReference {
  constructor(path) {
    this.path = path
    this.id = path.split('/').filter(Boolean).pop() || path
  }

  doc(id) {
    return new DocumentReference(`${this.path}/${id}`)
  }

  async add(data) {
    const id = autoId()
    const ref = this.doc(id)
    await ref.set(data)
    return ref
  }

  where(field, op, value) {
    return new Query(this, [{ type: 'where', field, op, value }])
  }

  orderBy(field, direction = 'asc') {
    return new Query(this, [{ type: 'orderBy', field, direction }])
  }

  limit(n) {
    return new Query(this, [{ type: 'limit', n }])
  }

  async get() {
    return new Query(this, []).get()
  }
}

class Query {
  constructor(colRef, constraints) {
    this._col = colRef
    this._constraints = constraints
  }

  where(field, op, value) {
    return new Query(this._col, [...this._constraints, { type: 'where', field, op, value }])
  }

  orderBy(field, direction = 'asc') {
    return new Query(this._col, [...this._constraints, { type: 'orderBy', field, direction }])
  }

  limit(n) {
    return new Query(this._col, [...this._constraints, { type: 'limit', n }])
  }

  async get() {
    const rows = await fetchByParent(this._col.path)
    const filtered = applyConstraints(rows, this._constraints)
    return new QuerySnapshot(filtered)
  }
}

class WriteBatch {
  constructor(db) {
    this._db = db
    this._ops = []
  }

  set(ref, data, options) {
    this._ops.push(() => ref.set(data, options))
    return this
  }

  update(ref, data) {
    this._ops.push(() => ref.update(data))
    return this
  }

  delete(ref) {
    this._ops.push(() => ref.delete())
    return this
  }

  async commit() {
    for (const op of this._ops) await op()
  }
}

class Transaction {
  async get(ref) {
    return ref.get()
  }

  set(ref, data, options) {
    return ref.set(data, options)
  }

  update(ref, data) {
    return ref.update(data)
  }

  delete(ref) {
    return ref.delete()
  }
}

function createSupabaseFirestore() {
  const db = {
    doc(path) {
      return new DocumentReference(path)
    },
    collection(path) {
      return new CollectionReference(path)
    },
    batch() {
      return new WriteBatch(db)
    },
    async runTransaction(fn) {
      const tx = new Transaction()
      return fn(tx)
    },
  }
  return db
}

module.exports = {
  createSupabaseFirestore,
  FieldValue,
  Timestamp: SupabaseTimestamp,
  useSupabaseDatabase,
}
