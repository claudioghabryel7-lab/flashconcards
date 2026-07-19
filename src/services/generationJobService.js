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
import { BACKEND_FUNCTIONS } from '../config/backendFunctions'
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
let nudgePausedUntil = 0

export function markJobCancelling(jobId) {
  if (jobId) cancellingJobIds.add(jobId)
}

export function unmarkJobCancelling(jobId) {
  if (jobId) cancellingJobIds.delete(jobId)
}

export function isJobCancelling(jobId) {
  return cancellingJobIds.has(jobId)
}

/** Pausa retomadas automáticas após cancelamento em massa. */
export function pauseJobNudge(ms = 120_000) {
  nudgePausedUntil = Date.now() + ms
}

export function isJobNudgePaused() {
  return Date.now() < nudgePausedUntil
}

export function syncCancellingJobsWithActive(activeJobIds = []) {
  const active = new Set(activeJobIds)
  for (const jobId of [...cancellingJobIds]) {
    if (!active.has(jobId)) unmarkJobCancelling(jobId)
  }
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

  if (runOnServer && serverPayload) {
    kickGenerationJob(userId, ref.id).catch(() => null)
  }

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
/** Jobs longos (mentorado/professor) — só expira no cliente após 6h sem update. */
const STALE_LONG_SERVER_JOB_MS = 6 * 60 * 60 * 1000
const STALE_WAITING_API_MS = 24 * 60 * 60 * 1000
/** Jobs waiting/pending: nudge a cada 30s (cron servidor retoma a cada 10 min). */
export const STALL_NUDGE_MS = 30 * 1000
/** Jobs running só são nudgeados após 90s sem progresso — keep-alive do servidor é 15s. */
export const STALL_PROGRESS_NUDGE_MS = 90 * 1000

function jobProgressTimestamp(job = {}) {
  return job.progressUpdatedAt || job.updatedAt || job.lastHeartbeat
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
  if (isJobNudgePaused()) return false
  if (isJobCancelling(job.id)) return false
  if (job.status === GENERATION_JOB_STATUS.PENDING) return true
  if (GENERATION_WAITING_STATUSES.includes(job.status)) {
    // Evita spam: só nudge waiting se ficou ≥30s sem progresso
    const secs = secondsSinceJobProgress(job, now)
    if (secs != null && secs * 1000 < STALL_NUDGE_MS) return false
    return true
  }
  if (job.status === GENERATION_JOB_STATUS.RUNNING) {
    return isJobProgressStalled(job, now)
  }
  return false
}

/**
 * Jobs travados: locais → marca error; nuvem → cancela via CF (libera slot/fila).
 * Nunca marca error no cliente enquanto o servidor ainda pode estar processando.
 */
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
  const localUpdates = []
  const serverCancels = []

  snap.docs.forEach((d) => {
    const data = d.data()
    // waiting_* no servidor: resume cron gerencia — não matar no cliente
    if (data.runOnServer && GENERATION_WAITING_STATUSES.includes(data.status)) {
      return
    }

    const updatedAt =
      data.progressUpdatedAt?.toDate?.() ||
      data.lastHeartbeat?.toDate?.() ||
      data.updatedAt?.toDate?.() ||
      data.createdAt?.toDate?.()
    if (!updatedAt) return

    const isLongJob = MENTORADO_JOB_TYPES.includes(data.jobType)
    const staleMs = data.runOnServer
      ? isLongJob
        ? STALE_LONG_SERVER_JOB_MS
        : STALE_SERVER_JOB_MS
      : STALE_JOB_MS
    if (now - updatedAt.getTime() < staleMs) return

    const hb = data.lastHeartbeat?.toDate?.() || data.progressUpdatedAt?.toDate?.()
    if (hb && now - hb.getTime() < STALE_PROGRESS_NUDGE_MS) return

    if (data.runOnServer) {
      serverCancels.push(d.id)
      return
    }

    localUpdates.push(
      updateDoc(d.ref, {
        status: GENERATION_JOB_STATUS.ERROR,
        progress: 100,
        message: 'Geração interrompida. Tente novamente.',
        updatedAt: serverTimestamp(),
      }),
    )
  })

  if (localUpdates.length) await Promise.all(localUpdates)

  if (serverCancels.length) {
    const user = auth?.currentUser
    if (user?.uid === userId && BACKEND_FUNCTIONS.cancelGenerationJob) {
      try {
        const token = await user.getIdToken()
        await Promise.all(
          serverCancels.map((jobId) =>
            fetch(BACKEND_FUNCTIONS.cancelGenerationJob, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                userId,
                jobId,
                reason: 'client_stale_reconcile',
              }),
            }).catch(() => null),
          ),
        )
      } catch {
        // Sem token / rede — deixa o stall recovery do servidor cuidar
      }
    }
  }
}

async function markJobsCancelledLocally(userId, jobIds = []) {
  if (!userId || !jobIds.length || !db) return
  await Promise.all(
    jobIds.map((jobId) =>
      updateGenerationJob(userId, jobId, {
        status: GENERATION_JOB_STATUS.CANCELLED,
        progress: 100,
        message: 'Cancelado',
        finishedAt: serverTimestamp(),
      }).catch(() => null),
    ),
  )
}

export async function dismissGenerationJob(userId, jobId) {
  if (!userId || !jobId) return { ok: false }

  markJobCancelling(jobId)
  pauseJobNudge()

  // Cancela no Firestore primeiro — some do banner na hora
  await markJobsCancelledLocally(userId, [jobId])

  try {
    const user = auth?.currentUser
    if (user?.uid === userId) {
      const token = await user.getIdToken()
      const response = await fetch(BACKEND_FUNCTIONS.cancelGenerationJob, {
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
      if (response.status >= 400) {
        // Já marcamos cancelled localmente — servidor pode limpar fila depois
        return { ok: true, fallback: true, warning: data.error || 'Cancelado localmente.' }
      }
    }

    return { ok: true, fallback: true }
  } finally {
    // Mantém flag até o job sumir do snapshot ativo (syncCancellingJobsWithActive)
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

  const jobIds = snap.docs.map((d) => d.id)
  jobIds.forEach((id) => markJobCancelling(id))
  pauseJobNudge(300_000)

  await markJobsCancelledLocally(userId, jobIds)

  const user = auth?.currentUser
  if (user?.uid === userId) {
    try {
      const token = await user.getIdToken()
      const response = await fetch(BACKEND_FUNCTIONS.cancelGenerationJob, {
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
        return { cancelled: data.cancelled ?? jobIds.length, ...data }
      }
      return { cancelled: jobIds.length, fallback: true, warning: data.error }
    } catch (err) {
      return { cancelled: jobIds.length, fallback: true, warning: err?.message }
    }
  }

  return { cancelled: jobIds.length, fallback: true }
}

/** Admin: força parada de TODOS os jobs (todos os usuários). */
export async function forceStopAllGenerationJobsGlobally() {
  const user = auth?.currentUser
  if (!user || !BACKEND_FUNCTIONS.cancelGenerationJob) {
    throw new Error('Não autenticado ou função de cancelamento indisponível.')
  }

  pauseJobNudge(300_000)

  // Cancela jobs do admin visíveis localmente antes da CF (melhor UX)
  try {
    const localSnap = await getDocs(
      query(jobsRef(user.uid), where('status', 'in', ACTIVE_JOB_STATUSES)),
    )
    if (localSnap.docs.length) {
      await markJobsCancelledLocally(
        user.uid,
        localSnap.docs.map((d) => d.id),
      )
    }
  } catch {
    /* ignore */
  }

  const token = await user.getIdToken()
  const response = await fetch(BACKEND_FUNCTIONS.cancelGenerationJob, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ global: true }),
  })

  let data = {}
  try {
    data = await response.json()
  } catch {
    data = {}
  }

  if (!response.ok) {
    throw new Error(data.error || 'Falha ao forçar parada de todos os jobs.')
  }

  return data
}

export function subscribeActiveGenerationJobs(userId, onData, onError) {
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
    (err) => {
      console.error('Erro ao observar jobs de geração:', err)
      onError?.(err)
    },
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
      } else if (job.status === GENERATION_JOB_STATUS.CANCELLED) {
        settled = true
        clearTimeout(timer)
        unsub()
        resolve({ ...job, cancelled: true })
      } else if (job.status === GENERATION_JOB_STATUS.ERROR) {
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
  const response = await fetch(BACKEND_FUNCTIONS.kickGenerationJob, {
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

  try {
    const token = await user.getIdToken()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    const response = await fetch(BACKEND_FUNCTIONS.nudgeGenerationJobResume, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userId, jobId }),
      signal: controller.signal,
    })
    clearTimeout(timer)

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
  } catch (err) {
    return { ok: false, reason: err?.name === 'AbortError' ? 'timeout' : 'network_error' }
  }
}
