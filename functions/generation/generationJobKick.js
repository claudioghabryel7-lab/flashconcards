const admin = require('firebase-admin')
const { processGenerationJob } = require('./jobProcessor')
const {
  isResumableJob,
  isApiQuotaError,
  pauseJobForResume,
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

  if (isResumableJob(data.jobType)) {
    const pauseStatus = isApiQuotaError(error) ? 'waiting_api' : 'waiting_retry'
    await pauseJobForResume({
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
        })
      },
      status: pauseStatus,
      waitReason: isApiQuotaError(error) ? 'api' : 'error',
      message: isApiQuotaError(error)
        ? 'API expirada — aguardando para retomar…'
        : `Erro temporário — tentando de novo em 5s… (${error?.message || 'erro'})`,
    })
    return { ok: false, paused: true, error: error.message }
  }

  await updateRef.update({
    status: 'error',
    progress: 100,
    message: error?.message || 'Falha na geração com IA. Tente novamente.',
    errorCode: error?.code || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    finishedAt: admin.firestore.FieldValue.serverTimestamp(),
  })
  return { ok: false, error: error.message }
}

async function runServerGenerationJob(userId, jobId, initialData = null) {
  const ref = getDb().doc(`users/${userId}/generationJobs/${jobId}`)
  const snap = initialData ? null : await ref.get()
  const data = initialData || (snap?.exists ? snap.data() : null)

  if (!data) return { ok: false, reason: 'not_found' }
  if (!data.runOnServer) return { ok: false, reason: 'not_server' }

  try {
    const outcome = await processGenerationJob(userId, jobId, data)
    return { ok: true, outcome }
  } catch (error) {
    return handleServerJobError(userId, jobId, data, error, ref)
  }
}

/** Dispara processamento de um job pendente (fallback se onCreate não rodar). */
async function kickGenerationJob(userId, jobId) {
  const ref = getDb().doc(`users/${userId}/generationJobs/${jobId}`)
  const snap = await ref.get()
  if (!snap.exists) return { ok: false, reason: 'not_found' }

  const data = snap.data()
  if (!data.runOnServer) return { ok: false, reason: 'not_server' }

  if (['done', 'error', 'cancelled'].includes(data.status)) {
    return { ok: true, reason: 'already_finished', status: data.status }
  }

  if (data.status !== 'pending') {
    return { ok: true, reason: 'already_started', status: data.status }
  }

  return runServerGenerationJob(userId, jobId, data)
}

/** Varre jobs presos em pending via generationActiveJobs + fila de retomada. */
async function processStuckPendingGenerationJobs() {
  const db = getDb()
  const now = Date.now()
  let kicked = 0
  const seen = new Set()

  const queueSnap = await db.collection('generationResumeQueue').limit(30).get()
  for (const doc of queueSnap.docs) {
    const data = doc.data() || {}
    const { userId, jobId } = data
    if (!userId || !jobId || seen.has(jobId)) continue

    const jobSnap = await db.doc(`users/${userId}/generationJobs/${jobId}`).get()
    if (!jobSnap.exists || jobSnap.data().status !== 'pending') continue
    if (!jobSnap.data().runOnServer) continue

    const createdMs = jobSnap.data().createdAt?.toMillis?.() || 0
    if (createdMs && now - createdMs < PENDING_KICK_GRACE_MS) continue

    seen.add(jobId)
    try {
      const result = await kickGenerationJob(userId, jobId)
      if (result.ok || result.paused) kicked += 1
    } catch (err) {
      console.error(`[processStuckPending] ${jobId}:`, err)
    }
  }

  return { kicked, scanned: seen.size }
}

module.exports = {
  runServerGenerationJob,
  kickGenerationJob,
  processStuckPendingGenerationJobs,
}
