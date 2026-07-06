import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import dayjs from 'dayjs'
import { db } from '../firebase/config'
import { stripUndefined } from '../utils/firestoreHelpers'

const SESSION_TYPE = 'trilha_session'
const MANUAL_TYPE = 'trilha_manual'

function isPermissionDenied(err) {
  return err?.code === 'permission-denied'
}

function progressDocId(userId, kind) {
  return `${userId}_trilha_${kind}_${Date.now()}`
}

async function saveSessionFallback(userId, data) {
  const ref = doc(db, 'progress', progressDocId(userId, 'sess'))
  await setDoc(
    ref,
    stripUndefined({
      uid: userId,
      type: SESSION_TYPE,
      date: dayjs().format('YYYY-MM-DD'),
      ...data,
      createdAt: serverTimestamp(),
    }),
  )
  return ref.id
}

async function saveManualFallback(userId, data) {
  const ref = doc(db, 'progress', progressDocId(userId, 'manual'))
  await setDoc(
    ref,
    stripUndefined({
      uid: userId,
      type: MANUAL_TYPE,
      date: dayjs().format('YYYY-MM-DD'),
      durationMinutes: data.minutos,
      ...data,
      createdAt: serverTimestamp(),
    }),
  )
  return ref.id
}

async function saveConfigFallback(userId, config, courseId) {
  await setDoc(
    doc(db, 'userProgress', userId),
    stripUndefined({
      trilhaConfig: { ...config, courseId },
      trilhaConfigUpdatedAt: serverTimestamp(),
    }),
    { merge: true },
  )
}

export async function saveTrilhaSession(userId, sessionData) {
  try {
    const ref = await addDoc(collection(db, 'users', userId, 'trilhaSessions'), sessionData)
    return ref.id
  } catch (err) {
    if (!isPermissionDenied(err)) throw err
    console.warn('Trilha: usando fallback progress para sessão (publique firestore.rules).')
    return saveSessionFallback(userId, sessionData)
  }
}

export async function saveTrilhaManualEntry(userId, entryData) {
  try {
    const ref = await addDoc(collection(db, 'users', userId, 'trilhaManualEntries'), entryData)
    return ref.id
  } catch (err) {
    if (!isPermissionDenied(err)) throw err
    console.warn('Trilha: usando fallback progress para registro manual.')
    return saveManualFallback(userId, entryData)
  }
}

export async function saveTrilhaConfig(userId, config, courseId) {
  try {
    await setDoc(
      doc(db, 'users', userId, 'trilha', 'config'),
      stripUndefined({ ...config, courseId, updatedAt: serverTimestamp() }),
      { merge: true },
    )
    return true
  } catch (err) {
    if (!isPermissionDenied(err)) throw err
    console.warn('Trilha: usando fallback userProgress para config.')
    await saveConfigFallback(userId, config, courseId)
    return true
  }
}

function mapProgressRows(snapshot, type) {
  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((row) => row.type === type)
    .map((row) => ({
      ...row,
      durationMinutes: row.durationMinutes ?? row.minutos ?? 0,
      minutos: row.minutos ?? row.durationMinutes ?? 0,
    }))
}

function sortByCreatedAt(rows) {
  return [...rows].sort((a, b) => {
    const at = a.createdAt?.toMillis?.() || 0
    const bt = b.createdAt?.toMillis?.() || 0
    return bt - at
  })
}

export function subscribeTrilhaSessions(userId, onData) {
  if (!userId || !db) return () => {}

  let fallbackUnsub = null
  let usingFallback = false

  const startFallback = () => {
    if (usingFallback) return
    usingFallback = true
    const q = query(collection(db, 'progress'), where('uid', '==', userId))
    fallbackUnsub = onSnapshot(
      q,
      (snap) => onData(sortByCreatedAt(mapProgressRows(snap, SESSION_TYPE))),
      (err) => console.error('Erro ao carregar sessões (fallback):', err),
    )
  }

  const primaryUnsub = onSnapshot(
    collection(db, 'users', userId, 'trilhaSessions'),
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      onData(sortByCreatedAt(rows))
    },
    (err) => {
      if (isPermissionDenied(err)) startFallback()
      else console.error('Erro ao carregar sessões da Trilha:', err)
    },
  )

  return () => {
    primaryUnsub()
    fallbackUnsub?.()
  }
}

export function subscribeTrilhaManualEntries(userId, onData) {
  if (!userId || !db) return () => {}

  let fallbackUnsub = null
  let usingFallback = false

  const startFallback = () => {
    if (usingFallback) return
    usingFallback = true
    const q = query(collection(db, 'progress'), where('uid', '==', userId))
    fallbackUnsub = onSnapshot(
      q,
      (snap) => onData(sortByCreatedAt(mapProgressRows(snap, MANUAL_TYPE))),
      (err) => console.error('Erro ao carregar registros manuais (fallback):', err),
    )
  }

  const primaryUnsub = onSnapshot(
    collection(db, 'users', userId, 'trilhaManualEntries'),
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      onData(sortByCreatedAt(rows))
    },
    (err) => {
      if (isPermissionDenied(err)) startFallback()
      else console.error('Erro ao carregar registros manuais:', err)
    },
  )

  return () => {
    primaryUnsub()
    fallbackUnsub?.()
  }
}

export function subscribeTrilhaConfig(userId, onData) {
  if (!userId || !db) return () => {}

  let fallbackUnsub = null
  let usingFallback = false

  const startFallback = () => {
    if (usingFallback) return
    usingFallback = true
    fallbackUnsub = onSnapshot(doc(db, 'userProgress', userId), (snap) => {
      if (!snap.exists()) return
      const cfg = snap.data().trilhaConfig
      if (cfg) onData(cfg)
    })
  }

  const primaryUnsub = onSnapshot(
    doc(db, 'users', userId, 'trilha', 'config'),
    (snap) => {
      if (snap.exists()) onData(snap.data())
    },
    (err) => {
      if (isPermissionDenied(err)) startFallback()
      else console.error('Erro ao carregar config da Trilha:', err)
    },
  )

  return () => {
    primaryUnsub()
    fallbackUnsub?.()
  }
}

export async function deleteTrilhaSession(userId, sessionId) {
  if (!userId || !sessionId || !db) return
  try {
    await deleteDoc(doc(db, 'users', userId, 'trilhaSessions', sessionId))
  } catch (err) {
    if (!isPermissionDenied(err)) throw err
    await deleteDoc(doc(db, 'progress', sessionId))
  }
}

export async function deleteTrilhaManualEntry(userId, entryId) {
  if (!userId || !entryId || !db) return
  try {
    await deleteDoc(doc(db, 'users', userId, 'trilhaManualEntries', entryId))
  } catch (err) {
    if (!isPermissionDenied(err)) throw err
    await deleteDoc(doc(db, 'progress', entryId))
  }
}

export async function clearTrilhaHistory(userId) {
  if (!userId || !db) return { sessions: 0, manual: 0 }

  let sessions = 0
  let manual = 0

  try {
    const sessSnap = await getDocs(collection(db, 'users', userId, 'trilhaSessions'))
    await Promise.all(sessSnap.docs.map((d) => deleteDoc(d.ref)))
    sessions = sessSnap.size
  } catch (err) {
    if (!isPermissionDenied(err)) throw err
  }

  try {
    const manSnap = await getDocs(collection(db, 'users', userId, 'trilhaManualEntries'))
    await Promise.all(manSnap.docs.map((d) => deleteDoc(d.ref)))
    manual = manSnap.size
  } catch (err) {
    if (!isPermissionDenied(err)) throw err
  }

  try {
    const q = query(collection(db, 'progress'), where('uid', '==', userId))
    const snap = await getDocs(q)
    const trilhaDocs = snap.docs.filter((d) => {
      const t = d.data().type
      return t === SESSION_TYPE || t === MANUAL_TYPE
    })
    await Promise.all(trilhaDocs.map((d) => deleteDoc(d.ref)))
    sessions += trilhaDocs.filter((d) => d.data().type === SESSION_TYPE).length
    manual += trilhaDocs.filter((d) => d.data().type === MANUAL_TYPE).length
  } catch {
    /* ignore */
  }

  return { sessions, manual }
}
