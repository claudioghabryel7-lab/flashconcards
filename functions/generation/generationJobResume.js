const admin = require('firebase-admin')
const {
  getGeminiKeysInOrder,
  silentProbeGeminiKey,
  collectMotherGeminiApiKey,
} = require('./geminiKeyPool')

const RETRY_INTERVAL_MS = 5 * 60 * 1000
const CONCURRENCY_RETRY_MS = 15 * 1000
const STALL_RUNNING_MS = 10 * 60 * 1000
const CF_SAFE_MS = 7 * 60 * 1000

const WAITING_STATUSES = ['waiting_api', 'waiting_retry', 'waiting_timeout']

function getDb() {
  return admin.firestore()
}

function isApiQuotaError(error) {
  const code = error?.code
  const msg = String(error?.message || '').toLowerCase()
  return (
    code === 'api_quota_exhausted' ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('resource has been exhausted') ||
    msg.includes('too many requests') ||
    msg.includes('429')
  )
}

function isResumableJob(jobType) {
  return (
    jobType === 'guia_mentorado_automation' ||
    jobType === 'guia_mentorado_cronograma' ||
    jobType === 'guia_mentorado_backfill' ||
    jobType === 'professor_supervisor'
  )
}

function isMentoradoJob(jobType) {
  return isResumableJob(jobType)
}

function createJobCancelledError() {
  const err = new Error('Job cancelado pelo admin')
  err.code = 'job_cancelled'
  return err
}

function isJobCancelledError(err) {
  return err?.code === 'job_cancelled'
}

async function throwIfCancelled(userId, jobId) {
  if (await isJobCancelled(userId, jobId)) {
    throw createJobCancelledError()
  }
}

async function isJobCancelled(userId, jobId) {
  const snap = await getDb().doc(`users/${userId}/generationJobs/${jobId}`).get()
  return snap.exists && snap.data().status === 'cancelled'
}

async function touchActiveJob(userId, jobId, patch = {}) {
  await getDb()
    .doc(`generationActiveJobs/${jobId}`)
    .set(
      {
        userId,
        jobId,
        lastHeartbeat: admin.firestore.FieldValue.serverTimestamp(),
        ...patch,
      },
      { merge: true },
    )
}

async function clearActiveJob(jobId) {
  await getDb().doc(`generationActiveJobs/${jobId}`).delete().catch(() => {})
}

async function pauseJobForResume({
  userId,
  jobId,
  courseId,
  jobType,
  serverPayload,
  resumeFromTopicIndex = 0,
  topicLabel = '',
  updateJob,
  status = 'waiting_retry',
  message,
  waitReason = 'retry',
  retryDelayMs = RETRY_INTERVAL_MS,
}) {
  const ts = admin.firestore.FieldValue.serverTimestamp()
  const nextRetryAt = new Date(Date.now() + Math.max(0, retryDelayMs))

  const resumeState = {
    resumeFromTopicIndex,
    targetDate: serverPayload?.targetDate || null,
    topicLabel,
    waitReason,
  }

  const defaultMessages = {
    waiting_api: topicLabel
      ? `API expirada — aguardando… (${topicLabel})`
      : 'API expirada — aguardando liberação das chaves…',
    waiting_timeout: topicLabel
      ? `Pausado (limite do servidor) — retomando… (${topicLabel})`
      : 'Pausado (limite do servidor) — retomando em instantes…',
    waiting_retry: topicLabel
      ? `Aguardando para retomar… (${topicLabel})`
      : 'Aguardando para retomar a geração…',
  }

  const finalMessage = message || defaultMessages[status] || defaultMessages.waiting_retry

  await updateJob(userId, jobId, {
    status,
    message: finalMessage,
    resumeState,
    waitReason,
    nextRetryAt: admin.firestore.Timestamp.fromDate(nextRetryAt),
  })

  await getDb().doc(`generationResumeQueue/${jobId}`).set({
    userId,
    jobId,
    courseId,
    jobType,
    serverPayload,
    resumeState,
    status,
    waitReason,
    nextRetryAt: admin.firestore.Timestamp.fromDate(nextRetryAt),
    updatedAt: ts,
    createdAt: ts,
  })

  if (jobType === 'professor_supervisor' || waitReason === 'concurrency') {
    await clearActiveJob(jobId)
  } else {
    await touchActiveJob(userId, jobId, { status, waitReason })
  }
}

async function pauseJobForApi(params) {
  return pauseJobForResume({ ...params, status: 'waiting_api', waitReason: 'api' })
}

async function hasAvailableGeminiKey() {
  const keys = getGeminiKeysInOrder()
  for (const key of keys) {
    const ok = await silentProbeGeminiKey(key)
    if (ok) return true
  }
  const mother = collectMotherGeminiApiKey()
  if (mother && !keys.includes(mother)) {
    return silentProbeGeminiKey(mother)
  }
  return false
}

async function bumpResumeRetry(jobId, minutes = 5) {
  const nextRetryAt = new Date(Date.now() + minutes * 60 * 1000)
  const ts = admin.firestore.Timestamp.fromDate(nextRetryAt)
  await getDb().doc(`generationResumeQueue/${jobId}`).set(
    { nextRetryAt: ts, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true },
  )
}

async function clearResumeQueue(jobId) {
  await getDb().doc(`generationResumeQueue/${jobId}`).delete().catch(() => {})
  await clearActiveJob(jobId)
}

function shouldCheckpointTimeout(jobStartedAt) {
  return Date.now() - jobStartedAt >= CF_SAFE_MS
}

async function handleGenerationJobCancelled(userId, jobId, jobData = {}) {
  await clearResumeQueue(jobId)

  if (jobData.jobType === 'guia_mentorado_automation') {
    const courseId = jobData.courseId
    const targetDate =
      jobData.serverPayload?.targetDate || jobData.resumeState?.targetDate || null
    if (courseId && targetDate) {
      const { resetGeneratingTopicsOnCancel } = require('./guiaMentoradoStatus')
      await resetGeneratingTopicsOnCancel(courseId, targetDate)
    }
  }
}

async function runWithHeartbeat(work, onHeartbeat, intervalMs = 15000, shouldAbort = null) {
  let active = true
  let abortError = null

  const runAbortCheck = async () => {
    if (abortError) throw abortError
    if (!shouldAbort) return
    if (await shouldAbort()) {
      abortError = createJobCancelledError()
      active = false
      throw abortError
    }
  }

  const timer = setInterval(() => {
    if (!active) return
    Promise.resolve(runAbortCheck())
      .then(() => {
        if (!abortError) return onHeartbeat?.()
      })
      .catch((err) => {
        if (isJobCancelledError(err)) abortError = err
      })
  }, intervalMs)

  try {
    await runAbortCheck()
    const result = await work(runAbortCheck)
    if (abortError) throw abortError
    await runAbortCheck()
    return result
  } finally {
    active = false
    clearInterval(timer)
  }
}

async function recoverStalledRunningJobs() {
  const db = getDb()
  const cutoff = Date.now() - STALL_RUNNING_MS
  const snap = await db.collection('generationActiveJobs').limit(30).get()
  let recovered = 0

  for (const doc of snap.docs) {
    const data = doc.data()
    const heartbeat = data.lastHeartbeat?.toDate?.()
    if (!heartbeat || heartbeat.getTime() > cutoff) continue

    const { userId, jobId } = data
    if (!userId || !jobId) continue

    const jobSnap = await db.doc(`users/${userId}/generationJobs/${jobId}`).get()
    if (!jobSnap.exists) {
      await clearActiveJob(jobId)
      continue
    }

    const jobData = jobSnap.data()
    if (jobData.status !== 'running' || !isMentoradoJob(jobData.jobType)) continue
    if (await isJobCancelled(userId, jobId)) {
      await handleGenerationJobCancelled(userId, jobId, jobData)
      continue
    }

    const resumeFromTopicIndex =
      jobData.resumeState?.resumeFromTopicIndex ??
      jobData.serverPayload?.resumeFromTopicIndex ??
      0

    await pauseJobForResume({
      userId,
      jobId,
      courseId: jobData.courseId,
      jobType: jobData.jobType,
      serverPayload: {
        ...(jobData.serverPayload || {}),
        resumeFromTopicIndex,
      },
      resumeFromTopicIndex,
      topicLabel: jobData.resumeState?.topicLabel || '',
      updateJob: async (uid, jid, patch) => {
        await db.doc(`users/${uid}/generationJobs/${jid}`).update({
          ...patch,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      },
      status: 'waiting_retry',
      waitReason: 'stalled',
      message: 'Geração pausada (sem atualização) — retomando automaticamente…',
    })
    recovered += 1
  }

  return recovered
}

async function resumeWaitingGenerationJobs() {
  const db = getDb()
  const now = admin.firestore.Timestamp.now()

  const stalled = await recoverStalledRunningJobs()

  const snap = await db
    .collection('generationResumeQueue')
    .where('nextRetryAt', '<=', now)
    .limit(20)
    .get()

  if (snap.empty) return { resumed: 0, waiting: 0, stalled }

  const needsApi = snap.docs.some((d) => {
    const s = d.data().status || 'waiting_api'
    return s === 'waiting_api'
  })

  if (needsApi) {
    const apiReady = await hasAvailableGeminiKey()
    if (!apiReady) {
      for (const doc of snap.docs) {
        await bumpResumeRetry(doc.id)
      }
      return { resumed: 0, waiting: snap.size, apiReady: false, stalled }
    }
  }

  const { processGenerationJob } = require('./jobProcessor')
  const { countActiveServerJobs, MAX_CONCURRENT_SERVER_JOBS } = require('./generationJobConcurrency')
  let resumed = 0

  for (const doc of snap.docs) {
    const activeCount = await countActiveServerJobs()
    if (activeCount >= MAX_CONCURRENT_SERVER_JOBS) break

    const data = doc.data()
    const { userId, jobId, courseId, jobType } = data
    if (!userId || !jobId) continue

    if (await isJobCancelled(userId, jobId)) {
      const cancelledSnap = await db.doc(`users/${userId}/generationJobs/${jobId}`).get()
      const cancelledData = cancelledSnap.exists ? cancelledSnap.data() : data
      await handleGenerationJobCancelled(userId, jobId, {
        ...cancelledData,
        courseId: courseId || cancelledData.courseId,
        jobType: jobType || cancelledData.jobType,
      })
      continue
    }

    const jobRef = db.doc(`users/${userId}/generationJobs/${jobId}`)
    const jobSnap = await jobRef.get()
    if (!jobSnap.exists) {
      await clearResumeQueue(jobId)
      continue
    }

    const jobData = jobSnap.data()
    if (!WAITING_STATUSES.includes(jobData.status)) {
      await clearResumeQueue(jobId)
      continue
    }

    const resumeFromTopicIndex =
      jobData.resumeState?.resumeFromTopicIndex ??
      data.resumeState?.resumeFromTopicIndex ??
      0

    const serverPayload = {
      ...(jobData.serverPayload || data.serverPayload || {}),
      resumeFromTopicIndex,
    }

    await jobRef.update({
      status: 'running',
      message: 'Retomando geração automaticamente…',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    await touchActiveJob(userId, jobId, { status: 'running' })

    try {
      const outcome = await processGenerationJob(userId, jobId, {
        ...jobData,
        courseId: courseId || jobData.courseId,
        jobType: jobType || jobData.jobType,
        serverPayload,
      })
      if (!outcome?.paused) {
        await clearResumeQueue(jobId)
      }
      resumed += 1
    } catch (err) {
      console.error(`[resumeWaitingGenerationJobs] job ${jobId}:`, err)
      if (await isJobCancelled(userId, jobId)) {
        await handleGenerationJobCancelled(userId, jobId, {
          ...jobData,
          courseId: courseId || jobData.courseId,
          jobType: jobType || jobData.jobType,
        })
        continue
      }
      if (isMentoradoJob(jobType || jobData.jobType)) {
        const pauseStatus = isApiQuotaError(err) ? 'waiting_api' : 'waiting_retry'
        await pauseJobForResume({
          userId,
          jobId,
          courseId: courseId || jobData.courseId,
          jobType: jobType || jobData.jobType,
          serverPayload,
          resumeFromTopicIndex,
          updateJob: async (uid, jid, patch) => {
            await db.doc(`users/${uid}/generationJobs/${jid}`).update({
              ...patch,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            })
          },
          status: pauseStatus,
          waitReason: isApiQuotaError(err) ? 'api' : 'error',
          message: isApiQuotaError(err)
            ? 'API expirada — aguardando para retomar…'
            : `Erro temporário — tentando de novo em 5 min… (${err.message || 'erro'})`,
        })
        await bumpResumeRetry(jobId)
      } else {
        await jobRef.update({
          status: 'error',
          progress: 100,
          message: err.message || 'Falha ao retomar geração.',
          finishedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        await clearResumeQueue(jobId)
      }
    }
  }

  return { resumed, waiting: snap.size - resumed, stalled, apiReady: true }
}

module.exports = {
  isApiQuotaError,
  isJobCancelled,
  isJobCancelledError,
  isMentoradoJob,
  isResumableJob,
  throwIfCancelled,
  handleGenerationJobCancelled,
  pauseJobForApi,
  pauseJobForResume,
  resumeWaitingGenerationJobs,
  hasAvailableGeminiKey,
  touchActiveJob,
  clearActiveJob,
  clearResumeQueue,
  shouldCheckpointTimeout,
  runWithHeartbeat,
  CF_SAFE_MS,
  CONCURRENCY_RETRY_MS,
  WAITING_STATUSES,
}
