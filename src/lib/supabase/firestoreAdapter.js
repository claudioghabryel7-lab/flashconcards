/**
 * Adapter Firestore → Supabase (tabela firestore_docs).
 * API compatível com firebase/firestore para operações usadas no app.
 */
import { getFirebaseIdToken, getSupabaseAuthClient, getSupabaseClient } from './client.js'

const DB = Symbol('supabase-db')
const SERVER_TS = Symbol('server-ts')
const DELETE_FIELD = Symbol('delete-field')
const INCREMENT = Symbol('increment')
const ARRAY_UNION = Symbol('array-union')

function normalizeError(err) {
  if (err instanceof Error && err.message && err.message !== '[object Object]') return err
  if (err && typeof err === 'object') {
    const msg = [err.message, err.details, err.hint, err.code].filter(Boolean).join(' — ')
    if (msg) return new Error(msg)
    try {
      return new Error(JSON.stringify(err))
    } catch {
      return new Error('Erro desconhecido no Supabase')
    }
  }
  return new Error(String(err ?? 'Erro desconhecido'))
}

async function supabaseRead() {
  const client = getSupabaseClient()
  if (!client) throw new Error('Supabase não configurado.')
  return client
}

async function supabaseWrite() {
  const client = getSupabaseAuthClient()
  if (!client) throw new Error('Supabase não configurado.')
  return client
}

async function persistRow(row) {
  if (typeof window !== 'undefined') {
    const token = await getFirebaseIdToken()
    if (!token) throw new Error('Usuário não autenticado.')
    const res = await fetch('/api/firestore/write', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ op: 'set', ...row }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Erro ao gravar (${res.status})`)
    }
    return
  }

  const sb = await supabaseWrite()
  const { error } = await sb.from('firestore_docs').upsert(row, { onConflict: 'path' })
  if (error) throw normalizeError(error)
}

async function removeRow(path) {
  if (typeof window !== 'undefined') {
    const token = await getFirebaseIdToken()
    if (!token) throw new Error('Usuário não autenticado.')
    const res = await fetch('/api/firestore/write', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ op: 'delete', path }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Erro ao deletar (${res.status})`)
    }
    return
  }

  const sb = await supabaseWrite()
  const { error } = await sb.from('firestore_docs').delete().eq('path', path)
  if (error) throw normalizeError(error)
}

async function supabaseQuery(run) {
  const sb = await supabaseRead()
  const { data, error } = await run(sb)
  if (error) throw normalizeError(error)
  return data
}

export function getFirestore() {
  return DB
}

export function serverTimestamp() {
  return { [SERVER_TS]: true }
}

export class Timestamp {
  constructor(seconds, nanoseconds = 0) {
    this.seconds = seconds
    this.nanoseconds = nanoseconds
  }

  toDate() {
    return new Date(this.seconds * 1000 + this.nanoseconds / 1e6)
  }

  toMillis() {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6)
  }

  static fromDate(date) {
    const ms = date.getTime()
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6)
  }

  static now() {
    return Timestamp.fromDate(new Date())
  }
}

export function arrayUnion(...values) {
  return { [ARRAY_UNION]: values }
}

export function arrayRemove(...values) {
  return { __arrayRemove: values }
}

export function increment(n = 1) {
  return { [INCREMENT]: n }
}

export function documentId() {
  return '__documentId__'
}

function autoId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 20; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return id
}

function buildPath(segments) {
  return segments.filter(Boolean).join('/')
}

function segmentString(value) {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return ''
}

function parsePathFromArgs(first, rest) {
  if (first === DB) return buildPath(rest.map(segmentString))
  if (first?.path) return first.path
  if (first?.parent?.path) return buildPath([first.parent.path, first.id, ...rest].map(segmentString))
  return buildPath([first?.path || first?.id, ...rest].map(segmentString).filter(Boolean))
}

export function collectionGroup(first, ...rest) {
  const name = first === DB ? segmentString(rest[0]) : segmentString(first)
  if (!name) throw new Error('collectionGroup: informe o nome da subcoleção.')
  return { path: `__collection_group__/${name}`, collectionGroup: name, type: 'collectionGroup' }
}

export function query(baseRef, ...constraints) {
  const isGroup = baseRef?.type === 'collectionGroup'
  return {
    path: baseRef?.path,
    parentPath: baseRef?.parentPath,
    collectionGroup: baseRef?.collectionGroup,
    type: isGroup ? 'collectionGroup' : 'query',
    constraints: [...(baseRef?.constraints || []), ...constraints],
  }
}

export function where(field, op, value) {
  return { type: 'where', field, op, value }
}

export function orderBy(field, direction = 'asc') {
  return { type: 'orderBy', field, direction }
}

export function limit(n) {
  return { type: 'limit', n }
}

function collectionRef(path) {
  const ref = { path, id: null, parentPath: path, type: 'collection' }
  const parts = path.split('/').filter(Boolean)
  if (parts.length >= 2) {
    ref.parent = docRef(parts.slice(0, -1).join('/'))
  }
  return ref
}

function docRef(path) {
  const parts = path.split('/').filter(Boolean)
  const id = parts[parts.length - 1] || ''
  const parentPath = parts.slice(0, -1).join('/')
  const ref = { path, id, parentPath, type: 'doc' }
  if (parentPath) ref.parent = collectionRef(parentPath)
  return ref
}

export function doc(first, ...rest) {
  const path = parsePathFromArgs(first, rest)
  return docRef(path)
}

export function collection(first, ...rest) {
  const path = parsePathFromArgs(first, rest)
  return { path, id: null, parentPath: path, type: 'collection' }
}

export function deleteField() {
  return DELETE_FIELD
}

function resolveValue(value) {
  if (value && value[SERVER_TS]) return new Date().toISOString()
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (value && typeof value === 'object' && value.toDate) return value.toDate().toISOString()
  if (Array.isArray(value)) return value.map(resolveValue)
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = resolveValue(v)
    return out
  }
  return value
}

function applyFieldValue(existing, key, value) {
  if (value && value[INCREMENT] != null) {
    const base = Number(existing?.[key] || 0)
    return base + value[INCREMENT]
  }
  if (value && value[ARRAY_UNION]) {
    const base = Array.isArray(existing?.[key]) ? [...existing[key]] : []
    for (const v of value[ARRAY_UNION]) {
      if (!base.some((x) => JSON.stringify(x) === JSON.stringify(v))) base.push(v)
    }
    return base
  }
  if (value && value.__arrayRemove) {
    const base = Array.isArray(existing?.[key]) ? [...existing[key]] : []
    return base.filter((x) => !value.__arrayRemove.some((r) => JSON.stringify(r) === JSON.stringify(x)))
  }
  return resolveValue(value)
}

function mergeData(existing, patch, merge = true) {
  const base = merge && existing ? { ...existing } : {}
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === DELETE_FIELD) delete base[k]
    else base[k] = applyFieldValue(base, k, v)
  }
  return base
}

function reviveValue(value) {
  if (value == null) return value
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    return Timestamp.fromDate(new Date(value))
  }
  if (Array.isArray(value)) return value.map(reviveValue)
  if (typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = reviveValue(v)
    return out
  }
  return value
}

function docSnapshot(row) {
  if (!row) {
    return {
      id: '',
      ref: null,
      data: () => undefined,
      exists() {
        return false
      },
    }
  }
  const ref = doc(row.path)
  const data = reviveValue({ ...(row.data || {}) })
  return {
    id: row.doc_id,
    ref,
    data: () => data,
    exists() {
      return true
    },
  }
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

async function fetchParentRows(parentPath) {
  return (await supabaseQuery((sb) => sb.from('firestore_docs').select('*').eq('parent_path', parentPath))) || []
}

async function fetchDoc(path) {
  return supabaseQuery((sb) => sb.from('firestore_docs').select('*').eq('path', path).maybeSingle())
}

async function fetchCollectionGroupRows(collectionGroupName) {
  const rows =
    (await supabaseQuery((sb) => sb.from('firestore_docs').select('*'))) || []
  const suffix = `/${collectionGroupName}/`
  return rows.filter((r) => {
    const idx = r.path.lastIndexOf(suffix)
    if (idx < 0) return false
    return !r.path.slice(idx + suffix.length).includes('/')
  })
}

export async function getDoc(ref) {
  const row = await fetchDoc(ref.path)
  return docSnapshot(row)
}

export async function setDoc(ref, data, { merge = false } = {}) {
  const existingRow = merge ? await fetchDoc(ref.path) : null
  const payload = mergeData(existingRow?.data, resolveValue(data), merge)
  const now = new Date().toISOString()
  const row = {
    path: ref.path,
    parent_path: ref.parentPath,
    doc_id: ref.id,
    data: payload,
    updated_at: now,
    ...(existingRow ? {} : { created_at: now }),
  }
  await persistRow(row)
}

export async function updateDoc(ref, patch) {
  const existing = (await fetchDoc(ref.path))?.data || {}
  await setDoc(ref, patch, { merge: true })
}

export async function addDoc(colRef, data) {
  const id = autoId()
  const ref = doc(colRef.path, id)
  await setDoc(ref, data)
  return ref
}

export async function deleteDoc(ref) {
  await removeRow(ref.path)
}

export async function getDocs(q) {
  let rows = []
  if (q.type === 'collectionGroup' || q.collectionGroup) {
    rows = await fetchCollectionGroupRows(q.collectionGroup)
  } else {
    rows = await fetchParentRows(q.path || q.parentPath)
  }
  rows = applyConstraints(rows, q.constraints)
  return {
    docs: rows.map((r) => docSnapshot(r)),
    empty: rows.length === 0,
    size: rows.length,
    forEach(fn) {
      this.docs.forEach(fn)
    },
  }
}

export function onSnapshot(refOrQuery, onNext, onError) {
  let active = true
  const pollMs = 4000

  const run = async () => {
    if (!active) return
    try {
      if (refOrQuery.type === 'doc') {
        const row = await fetchDoc(refOrQuery.path)
        if (active) onNext(docSnapshot(row))
      } else {
        const snap = await getDocs(refOrQuery)
        if (active) onNext(snap)
      }
    } catch (err) {
      onError?.(normalizeError(err))
    }
  }

  run()
  const intervalId = setInterval(run, pollMs)

  return () => {
    active = false
    clearInterval(intervalId)
  }
}

export function writeBatch() {
  const ops = []
  return {
    set(ref, data, opts) {
      ops.push(() => setDoc(ref, data, opts))
    },
    update(ref, data) {
      ops.push(() => updateDoc(ref, data))
    },
    delete(ref) {
      ops.push(() => deleteDoc(ref))
    },
    async commit() {
      for (const op of ops) await op()
    },
  }
}

export async function getCountFromServer(q) {
  const snap = await getDocs(q)
  return { data: () => ({ count: snap.size }) }
}

class Transaction {
  async get(ref) {
    return getDoc(ref)
  }

  set(ref, data, options) {
    return setDoc(ref, data, options)
  }

  update(ref, data) {
    return updateDoc(ref, data)
  }

  delete(ref) {
    return deleteDoc(ref)
  }
}

export async function runTransaction(_db, fn) {
  const tx = new Transaction()
  return fn(tx)
}
