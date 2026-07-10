import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from 'firebase/firestore'
import { db } from '../firebase/config'

const CONFIG_PATH = ['config', 'professorFiscalizador']

export function subscribeProfessorSupervisorConfig(onData) {
  if (!db) return () => {}
  const ref = doc(db, ...CONFIG_PATH)
  return onSnapshot(ref, (snap) => {
    onData(snap.exists() ? snap.data() : { enabled: false })
  })
}

export async function setProfessorSupervisorEnabled(userId, enabled) {
  if (!db || !userId) throw new Error('Não autenticado.')
  const ref = doc(db, ...CONFIG_PATH)
  await setDoc(
    ref,
    {
      enabled: Boolean(enabled),
      automationUserId: enabled ? userId : null,
      updatedAt: serverTimestamp(),
      ...(enabled
        ? { lastMessage: 'Professor fiscalizador ativado.' }
        : { lastMessage: 'Professor fiscalizador desativado.' }),
    },
    { merge: true },
  )
}

export function subscribePendingSupervisorReviews(onData, { max = 40 } = {}) {
  if (!db) return () => {}
  const q = query(
    collection(db, 'professorSupervisorReviews'),
    where('status', '==', 'pending_admin'),
    orderBy('createdAt', 'desc'),
    limit(max),
  )
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error('Erro ao observar revisões do fiscalizador:', err),
  )
}

export async function resolveSupervisorReview(reviewId, action = 'approved') {
  if (!db || !reviewId) return
  await updateDoc(doc(db, 'professorSupervisorReviews', reviewId), {
    status: action === 'rejected' ? 'rejected' : 'approved',
    resolvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function fetchSupervisorHistory({ max = 30 } = {}) {
  if (!db) return []
  const q = query(
    collection(db, 'professorSupervisorHistory'),
    orderBy('createdAt', 'desc'),
    limit(max),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}
