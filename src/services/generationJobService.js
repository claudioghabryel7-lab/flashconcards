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
import { db, auth } from '../firebase/config'
import { FIREBASE_FUNCTIONS } from '../config/firebaseFunctions'
import { stripUndefined } from '../utils/firestoreHelpers'

export const GENERATION_JOB_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  WAITING_API: 'waiting_api',
  WAITING_RETRY: 'waiting_retry',
  WAITING_TIMEOUT: 'waiting_timeout',
  DONE: 'done',
  ERROR: 'error',
  CANCELLED: 'cancelled',
}

const MENTORADO_JOB_TYPES = [
  'guia_mentorado_automation',
  'guia_mentorado_cronograma',
  'guia_mentorado_backfill',
  'professor_supervisor',
]

/** Jobs em processo de cancelamento — evita nudge retomar enquanto para. */
const cancellingJobIds = new Set()

export function markJobCancelling(jobId) {
  if (jobId) cancellingJobIds.add(jobId)
}

export function unmarkJobCancelling(jobId) {
  if (jobId) cancellingJobIds.delete(jobId)
}

export function isJobCancelling(jobId) {
  return cancellingJobIds.has(jobId)
}

export const GENERATION_WAITING_STATUSES = [
  GENERATION_JOB_STATUS.WAITING_API,
  GENERATION_JOB_STATUS.WAITING_RETRY,
  GENERATION_JOB_STATUS.WAITING_TIMEOUT,
]

function jobsRef(userId) {
  return collection(db, 'users', userId, 'generationJobs')
}

export async function createGenerationJob({
  userId,
  courseId,
  jobType,
  topicKey = null,
  metadata = {},
  serverPayload = null,
  runOnServer = false,
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
      runOnServer: Boolean(runOnServer && serverPayload),
      serverPayload: runOnServer && serverPayload ? serverPayload : null,
      status: GENERATION_JOB_STATUS.PENDING,
      progress: 0,
      message: runOnServer && serverPayload ? 'Enviado ao servidor…' : 'Aguardando início…',
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
const STALE_SERVER_JOB_MS = 90 * 60 * 1000
const STALE_WAITING_API_MS = 24 * 60 * 60 * 1000
export const STALL_NUDGE_MS = 5 * 1000
export const STALL_PROGRESS_NUDGE_MS = 25 * 1000

function jobProgressTimestamp(job = {}) {
  return job.progressUpdatedAt || job.updatedAt
}

export function secondsSinceJobProgress(job, now = Date.now()) {
  const date =
    jobProgressTimestamp(job)?.toDate?.() ||
    (jobProgressTimestamp(job) instanceof Date ? jobProgressTimestamp(job) : null)
  if (!date) return null
  return Math.max(0, Math.floor((now - date.getTime()) / 1000))
}

export function isJobProgressStalled(job, now = Date.now(), stallMs = STALL_PROGRESS_NUDGE_MS) {
  if (!job || job.status !== GENERATION_JOB_STATUS.RUNNING) return false
  const secs = secondsSinceJobProgress(job, now)
  if (secs == null) return true
  return secs * 1000 >= stallMs
}

export function shouldNudgeJob(job, now = Date.now()) {
  if (!job?.runOnServer) return false
  if (isJobCancelling(job.id)) return false
  if (job.status === GENERATION_JOB_STATUS.PENDING) return true
  if (GENERATION_WAITING_STATUSES.includes(job.status)) return true
  if (job.status === GENERATION_JOB_STATUS.RUNNING) {
    return isJobProgressStalled(job, now)
  }
  return false
}

/** Marca jobs travados (ex.: aba fechada) como erro para não ficar banner infinito. */
export async function reconcileStaleGenerationJobs(userId) {
  if (!userId || !db) return

  const snap = await getDocs(
    query(
      jobsRef(userId),
      where('status', 'in', [
        GENERATION_JOB_STATUS.PENDING,
        GENERATION_JOB_STATUS.RUNNING,
        ...GENERATION_WAITING_STATUSES,
      ]),
    ),
  )

  const now = Date.now()
  const updates = []

  snap.docs.forEach((d) => {
    const data = d.data()
    if (MENTORADO_JOB_TYPES.includes(data.jobType)) return

    const updatedAt = data.updatedAt?.toDate?.() || data.createdAt?.toDate?.()
    if (!updatedAt) return

    const staleMs =
      data.status === GENERATION_JOB_STATUS.WAITING_API
        ? STALE_WAITING_API_MS
        : data.runOnServer
          ? STALE_SERVER_JOB_MS
          : STALE_JOB_MS
    if (now - updatedAt.getTime() < staleMs) return

    updates.push(
      updateDoc(d.ref, {
        status: GENERATION_JOB_STATUS.ERROR,
        progress: 100,
        message: data.runOnServer
          ? 'Geração no servidor expirou. Tente novamente.'
          : 'Geração interrompida. Tente novamente.',
        updatedAt: serverTimestamp(),
      }),
    )
  })

  if (updates.length) await Promise.all(updates)
}

export async function dismissGenerationJob(userId, jobId) {
  if (!userId || !jobId) return { ok: false }

  markJobCancelling(jobId)
  try {
    const user = auth?.currentUser
    if (user?.uid === userId) {
      const token = await user.getIdToken()
      const response = await fetch(FIREBASE_FUNCTIONS.cancelGenerationJob, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId, jobId }),
      })
      let data = {}
      try {
        data = await response.json()
      } catch {
        data = {}
      }
      if (response.ok && data.ok !== false) {
        return { ok: true, ...data }
      }
    }

    await updateGenerationJob(userId, jobId, {
      status: GENERATION_JOB_STATUS.CANCELLED,
      progress: 100,
      message: 'Cancelado pelo admin',
      finishedAt: serverTimestamp(),
    })
    return { ok: true, fallback: true }
  } finally {
    unmarkJobCancelling(jobId)
  }
}

const ACTIVE_JOB_STATUSES = [
  GENERATION_JOB_STATUS.PENDING,
  GENERATION_JOB_STATUS.RUNNING,
  ...GENERATION_WAITING_STATUSES,
]

/** Cancela todos os jobs ativos do usuário (força parada no servidor). */
export async function cancelAllGenerationJobs(userId) {
  if (!userId || !db) return { cancelled: 0 }

  const snap = await getDocs(
    query(jobsRef(userId), where('status', 'in', ACTIVE_JOB_STATUSES)),
  )

  if (!snap.docs.length) return { cancelled: 0 }

  snap.docs.forEach((d) => markJobCancelling(d.id))

  try {
    const user = auth?.currentUser
    if (user?.uid === userId) {
      const token = await user.getIdToken()
      const response = await fetch(FIREBASE_FUNCTIONS.cancelGenerationJob, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId, all: true }),
      })
      let data = {}
      try {
        data = await response.json()
      } catch {
        data = {}
      }
      if (response.ok) {
        return { cancelled: data.cancelled ?? snap.docs.length, ...data }
      }
    }

    await Promise.all(snap.docs.map((d) => dismissGenerationJob(userId, d.id)))
    return { cancelled: snap.docs.length }
  } finally {
    snap.docs.forEach((d) => unmarkJobCancelling(d.id))
  }
}

export function subscribeActiveGenerationJobs(userId, onData) {
  if (!userId || !db) return () => {}

  const q = query(
    jobsRef(userId),
    where('status', 'in', [
      GENERATION_JOB_STATUS.PENDING,
      GENERATION_JOB_STATUS.RUNNING,
      ...GENERATION_WAITING_STATUSES,
    ]),
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

export function waitForGenerationJob(userId, jobId, { timeoutMs = 90 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!userId || !jobId) {
      reject(new Error('Job de geração inválido.'))
      return
    }

    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      unsub()
      reject(new Error('Tempo esgotado aguardando geração.'))
    }, timeoutMs)

    const unsub = subscribeGenerationJob(userId, jobId, (job) => {
      if (!job || settled) return

      if (job.status === GENERATION_JOB_STATUS.DONE) {
        settled = true
        clearTimeout(timer)
        unsub()
        resolve(job)
      } else if (
        job.status === GENERATION_JOB_STATUS.ERROR ||
        job.status === GENERATION_JOB_STATUS.CANCELLED
      ) {
        settled = true
        clearTimeout(timer)
        unsub()
        reject(new Error(job.message || 'Erro na geração.'))
      }
    })
  })
}

/** Pede ao servidor que inicie um job pendente imediatamente. */
export async function kickGenerationJob(userId, jobId) {
  if (!userId || !jobId) return { ok: false, reason: 'missing_params' }

  const user = auth?.currentUser
  if (!user || user.uid !== userId) return { ok: false, reason: 'not_authenticated' }

  const token = await user.getIdToken()
  const response = await fetch(FIREBASE_FUNCTIONS.kickGenerationJob, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ userId, jobId }),
  })

  let data = {}
  try {
    data = await response.json()
  } catch {
    data = { ok: false, reason: 'invalid_response' }
  }

  if (!response.ok) {
    return { ok: false, reason: data.error || data.reason || 'request_failed' }
  }

  return data
}

/** Pede ao servidor que retome um job travado ou aguardando. */
export async function nudgeGenerationJobResume(userId, jobId) {
  if (!userId || !jobId) return { ok: false, reason: 'missing_params' }

  const user = auth?.currentUser
  if (!user || user.uid !== userId) return { ok: false, reason: 'not_authenticated' }

  const token = await user.getIdToken()
  const response = await fetch(FIREBASE_FUNCTIONS.nudgeGenerationJobResume, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ userId, jobId }),
  })

  let data = {}
  try {
    data = await response.json()
  } catch {
    data = { ok: false, reason: 'invalid_response' }
  }

  if (!response.ok) {
    return { ok: false, reason: data.error || data.reason || 'request_failed' }
  }

  return data
}
