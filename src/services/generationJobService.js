import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { stripUndefined } from '../utils/firestoreHelpers'

export const GENERATION_JOB_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  ERROR: 'error',
  CANCELLED: 'cancelled',
}

function jobsRef(userId) {
  return collection(db, 'users', userId, 'generationJobs')
}

export async function createGenerationJob({
  userId,
  courseId,
  jobType,
  topicKey = null,
  metadata = {},
}) {
  if (!userId || !db) throw new Error('Usuário não autenticado.')

  const ref = await addDoc(
    jobsRef(userId),
    stripUndefined({
      userId,
      courseId: courseId || null,
      jobType,
      topicKey,
      metadata,
      status: GENERATION_JOB_STATUS.PENDING,
      progress: 0,
      message: 'Aguardando início…',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  )
  return ref.id
}

export async function updateGenerationJob(userId, jobId, patch) {
  if (!userId || !jobId || !db) return
  await updateDoc(doc(db, 'users', userId, 'generationJobs', jobId), {
    ...patch,
    updatedAt: serverTimestamp(),
  })
}

const STALE_JOB_MS = 45 * 60 * 1000

/** Marca jobs travados (ex.: aba fechada) como erro para não ficar banner infinito. */
export async function reconcileStaleGenerationJobs(userId) {
  if (!userId || !db) return

  const snap = await getDocs(
    query(
      jobsRef(userId),
      where('status', 'in', [GENERATION_JOB_STATUS.PENDING, GENERATION_JOB_STATUS.RUNNING]),
    ),
  )

  const now = Date.now()
  const updates = []

  snap.docs.forEach((d) => {
    const data = d.data()
    const updatedAt = data.updatedAt?.toDate?.() || data.createdAt?.toDate?.()
    if (!updatedAt) return
    if (now - updatedAt.getTime() < STALE_JOB_MS) return

    updates.push(
      updateDoc(d.ref, {
        status: GENERATION_JOB_STATUS.ERROR,
        progress: 100,
        message: 'Geração interrompida. Tente novamente.',
        updatedAt: serverTimestamp(),
      }),
    )
  })

  if (updates.length) await Promise.all(updates)
}

export async function dismissGenerationJob(userId, jobId) {
  if (!userId || !jobId) return
  await updateGenerationJob(userId, jobId, {
    status: GENERATION_JOB_STATUS.CANCELLED,
    progress: 100,
    message: 'Dispensado',
  })
}

export function subscribeActiveGenerationJobs(userId, onData) {
  if (!userId || !db) return () => {}

  const q = query(
    jobsRef(userId),
    where('status', 'in', [GENERATION_JOB_STATUS.PENDING, GENERATION_JOB_STATUS.RUNNING]),
  )

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      onData(rows)
    },
    (err) => console.error('Erro ao observar jobs de geração:', err),
  )
}

export function subscribeGenerationJob(userId, jobId, onData) {
  if (!userId || !jobId || !db) return () => {}
  return onSnapshot(doc(db, 'users', userId, 'generationJobs', jobId), (snap) => {
    onData(snap.exists() ? { id: snap.id, ...snap.data() } : null)
  })
}
