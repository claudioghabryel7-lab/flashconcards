const admin = require('firebase-admin')
const { processGenerationJob } = require('./jobProcessor')
const {
  isResumableJob,
  isApiQuotaError,
  isTransientGenerationError,
  isJobCancelledError,
  pauseJobForResume,
  clearActiveJob,
  clearResumeQueue,
  isJobCancelled,
} = require('./generationJobResume')

const PENDING_KICK_GRACE_MS = 8 * 1000

function getDb() {
  return admin.firestore()
}

function parseUserIdFromJobPath(path = '') {
  const parts = String(path).split('/')
  if (parts[0] === 'users' && parts[2] === 'generationJobs') return parts[1]
  return null
}

async function handleServerJobError(userId, jobId, data, error, updateRef) {
  console.error(`[runServerGenerationJob] job ${jobId}:`, error)

  if (isJobCancelledError(error) || (await isJobCancelled(userId, jobId))) {
    await clearResumeQueue(jobId)
    await clearActiveJob(jobId)
    return { ok: false, cancelled: true, reason: 'cancelled' }
  }

  if (isResumableJob(data.jobType) && isTransientGenerationError(error)) {
    if (await isJobCancelled(userId, jobId)) {
      await clearResumeQueue(jobId)
      await clearActiveJob(jobId)
      return { ok: false, cancelled: true, reason: 'cancelled' }
    }
    const pauseStatus = isApiQuotaError(error) ? 'waiting_api' : 'waiting_retry'
    const pauseResult = await pauseJobForResume({
      userId,
      jobId,
      courseId: data.courseId,
      jobType: data.jobType,
      serverPayload: data.serverPayload || {},
      resumeFromTopicIndex:
        data.resumeState?.resumeFromTopicIndex ??
        data.serverPayload?.resumeFromTopicIndex ??
        0,
      topicLabel: data.resumeState?.topicLabel || '',
      updateJob: async (_uid, _jid, patch) => {
        await updateRef.update({
          ...patch,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          progressUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      },
      status: pauseStatus,
      waitReason: isApiQuotaError(error) ? 'api' : 'error',
      message: isApiQuotaError(error)
        ? 'API indisponível — trocando chave e retomando…'
        : `Erro temporário — tentando outra API em 15s… (${error?.message || 'erro'})`,
    })
    if (pauseResult?.skipped && pauseResult.reason === 'cancelled') {
      return { ok: false, cancelled: true, reason: 'cancelled' }
    }
    return { ok: false, paused: true, error: error.message }
  }

  if (await isJobCancelled(userId, jobId)) {
    await clearResumeQueue(jobId)
    await clearActiveJob(jobId)
    return { ok: false, cancelled: true, reason: 'cancelled' }
  }

  await updateRef
    .update({
      status: 'error',
      progress: 100,
      message: error?.message || 'Falha na geração com IA. Tente novamente.',
      errorCode: error?.code || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    .catch(() => {})

  // Libera slot imediatamente — evita travar concorrência até o prune
  await clearActiveJob(jobId)
  await clearResumeQueue(jobId)

  return { ok: false, error: error.message }
}

async function runServerGenerationJob(userId, jobId, initialData = null) {
  const ref = getDb().doc(`users/${userId}/generationJobs/${jobId}`)
  const snap = initialData ? null : await ref.get()
  const data = initialData || (snap?.exists ? snap.data() : null)

  if (!data) return { ok: false, reason: 'not_found' }
  if (!data.runOnServer) return { ok: false, reason: 'not_server' }
  if (data.status === 'cancelled' || (await isJobCancelled(userId, jobId))) {
    return { ok: false, reason: 'cancelled' }
  }

  try {
    const outcome = await processGenerationJob(userId, jobId, data)
    return { ok: true, outcome }
  } catch (error) {
    return handleServerJobError(userId, jobId, data, error, ref)
  }
}

/** Dispara processamento de um job pendente (fallback se onCreate não rodar). */
async function kickGenerationJob(userId, jobId, { wait = true } = {}) {
  const ref = getDb().doc(`users/${userId}/generationJobs/${jobId}`)
  const snap = await ref.get()
  if (!snap.exists) return { ok: false, reason: 'not_found' }

  const data = snap.data()
  if (!data.runOnServer) return { ok: false, reason: 'not_server' }

  if (data.status === 'cancelled' || (await isJobCancelled(userId, jobId))) {
    return { ok: true, reason: 'cancelled', status: 'cancelled' }
  }

  if (['done', 'error', 'cancelled'].includes(data.status)) {
    return { ok: true, reason: 'already_finished', status: data.status }
  }

  if (data.status !== 'pending') {
    // Waiting: encaminha para retomada com claim (kick antigo só cobria pending)
    if (['waiting_api', 'waiting_retry', 'waiting_timeout'].includes(data.status)) {
      const { nudgeStalledGenerationJob } = require('./generationJobResume')
      return nudgeStalledGenerationJob(userId, jobId)
    }
    return { ok: true, reason: 'already_started', status: data.status }
  }

  if (!wait) {
    runServerGenerationJob(userId, jobId, data).catch((err) => {
      console.error(`[kickGenerationJob] async ${jobId}:`, err)
    })
    return { ok: true, reason: 'kick_scheduled' }
  }

  return runServerGenerationJob(userId, jobId, data)
}

/** Varre jobs presos em pending (fila + collection group fallback). */
async function processStuckPendingGenerationJobs() {
  const db = getDb()
  const now = Date.now()
  let kicked = 0
  const seen = new Set()

  const { countActiveServerJobs, MAX_CONCURRENT_SERVER_JOBS } = require('./generationJobConcurrency')
  const activeCount = await countActiveServerJobs()
  let slotsLeft = Math.max(0, MAX_CONCURRENT_SERVER_JOBS - activeCount)
  if (slotsLeft <= 0) {
    return { kicked: 0, scanned: 0, skipped: 'no_slots', activeCount }
  }

  const tryKick = async (userId, jobId) => {
    if (slotsLeft <= 0) return
    if (!userId || !jobId || seen.has(jobId)) return
    const jobSnap = await db.doc(`users/${userId}/generationJobs/${jobId}`).get()
    if (!jobSnap.exists) return
    const data = jobSnap.data()
    if (data.status !== 'pending' || !data.runOnServer) return
    const createdMs = data.createdAt?.toMillis?.() || 0
    if (createdMs && now - createdMs < PENDING_KICK_GRACE_MS) return
    seen.add(jobId)
    try {
      const result = await kickGenerationJob(userId, jobId)
      if (result.ok || result.paused) {
        kicked += 1
        if (result.ok) slotsLeft -= 1
      }
    } catch (err) {
      console.error(`[processStuckPending] ${jobId}:`, err)
    }
  }

  const queueSnap = await db.collection('generationResumeQueue').limit(80).get()
  for (const doc of queueSnap.docs) {
    if (slotsLeft <= 0) break
    const data = doc.data() || {}
    await tryKick(data.userId, data.jobId || doc.id)
  }

  // Pending sem fila (onCreate falhou)
  if (slotsLeft > 0) {
    try {
      const pendingSnap = await db
        .collectionGroup('generationJobs')
        .where('status', '==', 'pending')
        .where('runOnServer', '==', true)
        .limit(40)
        .get()
      for (const doc of pendingSnap.docs) {
        if (slotsLeft <= 0) break
        const userId = parseUserIdFromJobPath(doc.ref.path)
        await tryKick(userId, doc.id)
      }
    } catch (err) {
      console.warn('[processStuckPending] collectionGroup:', err.message)
    }
  }

  return { kicked, scanned: seen.size, activeCount, slotsLeft }
}

module.exports = {
  runServerGenerationJob,
  kickGenerationJob,
  processStuckPendingGenerationJobs,
}
