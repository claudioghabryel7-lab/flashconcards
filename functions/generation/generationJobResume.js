const admin = require('firebase-admin')
const {
  getGeminiKeysInOrder,
  silentProbeGeminiKey,
  collectMotherGeminiApiKey,
} = require('./geminiKeyPool')

const RETRY_INTERVAL_MS = 15 * 1000
const CONCURRENCY_RETRY_MS = 15 * 1000
const STALL_PROGRESS_MS = 45 * 1000
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

  // Jobs aguardando retomada não ocupam slot de concorrência.
  await clearActiveJob(jobId)
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

async function bumpResumeRetry(jobId, delayMs = RETRY_INTERVAL_MS) {
  const nextRetryAt = new Date(Date.now() + Math.max(0, delayMs))
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

function isJobProgressStale(jobData, stallMs = STALL_PROGRESS_MS) {
  const ts = jobData.progressUpdatedAt?.toDate?.() || jobData.updatedAt?.toDate?.()
  if (!ts) return true
  return Date.now() - ts.getTime() >= stallMs
}

async function forceResumeJob(userId, jobId, jobData, { waitReason = 'nudge', message } = {}) {
  const resumeFromTopicIndex =
    jobData.resumeState?.resumeFromTopicIndex ??
    jobData.serverPayload?.resumeFromTopicIndex ??
    0

  const db = getDb()
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
    waitReason,
    message: message || 'Forçando retomada…',
    retryDelayMs: 0,
  })

  await db.doc(`generationResumeQueue/${jobId}`).set(
    {
      nextRetryAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  const result = await resumeSingleGenerationJob(jobId)
  return { ok: true, reason: 'resumed', resumed: result.resumed ? 1 : 0 }
}

async function nudgeStalledGenerationJob(userId, jobId) {
  const db = getDb()
  const jobRef = db.doc(`users/${userId}/generationJobs/${jobId}`)
  const jobSnap = await jobRef.get()
  if (!jobSnap.exists) return { ok: false, reason: 'not_found' }

  const jobData = jobSnap.data()
  if (!jobData.runOnServer || !isMentoradoJob(jobData.jobType)) {
    return { ok: false, reason: 'not_server_job' }
  }
  if (await isJobCancelled(userId, jobId)) {
    return { ok: false, reason: 'cancelled' }
  }

  if (jobData.status === 'running') {
    if (!isJobProgressStale(jobData)) {
      return { ok: true, reason: 'still_active' }
    }
    return forceResumeJob(userId, jobId, jobData, {
      waitReason: 'nudge_stalled',
      message: 'Sem sinal — retomando automaticamente…',
    })
  }

  if (WAITING_STATUSES.includes(jobData.status)) {
    await db.doc(`generationResumeQueue/${jobId}`).set(
      {
        nextRetryAt: admin.firestore.Timestamp.now(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
    const result = await resumeSingleGenerationJob(jobId)
    return { ok: true, reason: 'nudged_waiting', resumed: result.resumed ? 1 : 0 }
  }

  return { ok: false, reason: 'not_waiting' }
}

async function recoverStalledRunningJobs() {
  const db = getDb()
  const cutoff = Date.now() - STALL_PROGRESS_MS
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

function mergeResumeServerPayload(jobData = {}, queueData = {}, resumeFromTopicIndex = 0) {
  const jobPayload = jobData.serverPayload || {}
  const queuePayload = queueData.serverPayload || {}
  return {
    ...jobPayload,
    ...queuePayload,
    courseId: queuePayload.courseId || jobPayload.courseId || jobData.courseId,
    dayKeys: queuePayload.dayKeys || jobPayload.dayKeys,
    resumeFromDayIndex:
      queuePayload.resumeFromDayIndex ?? jobPayload.resumeFromDayIndex ?? 0,
    resumeFromTopicIndex:
      resumeFromTopicIndex ??
      queuePayload.resumeFromTopicIndex ??
      jobPayload.resumeFromTopicIndex ??
      0,
    topics: queuePayload.topics?.length ? queuePayload.topics : jobPayload.topics,
    targetDate: queuePayload.targetDate || jobPayload.targetDate || null,
    autoPublish: queuePayload.autoPublish ?? jobPayload.autoPublish ?? true,
  }
}

async function resumeSingleGenerationJob(jobId, queueData = null) {
  const db = getDb()
  const now = admin.firestore.Timestamp.now()

  let data = queueData
  if (!data) {
    const queueSnap = await db.doc(`generationResumeQueue/${jobId}`).get()
    if (!queueSnap.exists) return { resumed: false, reason: 'no_queue' }
    data = queueSnap.data()
  }

  const nextRetry = data.nextRetryAt
  if (nextRetry && nextRetry.toMillis() > now.toMillis()) {
    return { resumed: false, reason: 'not_due' }
  }

  const { userId, courseId } = data
  if (!userId || !jobId) return { resumed: false, reason: 'invalid_queue' }

  if (await isJobCancelled(userId, jobId)) {
    const cancelledSnap = await db.doc(`users/${userId}/generationJobs/${jobId}`).get()
    const cancelledData = cancelledSnap.exists ? cancelledSnap.data() : data
    await handleGenerationJobCancelled(userId, jobId, {
      ...cancelledData,
      courseId: courseId || cancelledData.courseId,
      jobType: cancelledData.jobType || data.jobType,
    })
    return { resumed: false, reason: 'cancelled' }
  }

  const jobRef = db.doc(`users/${userId}/generationJobs/${jobId}`)
  const jobSnap = await jobRef.get()
  if (!jobSnap.exists) {
    await clearResumeQueue(jobId)
    return { resumed: false, reason: 'missing_job' }
  }

  const jobData = jobSnap.data()
  if (!WAITING_STATUSES.includes(jobData.status)) {
    await clearResumeQueue(jobId)
    return { resumed: false, reason: 'not_waiting' }
  }

  if (jobData.status === 'waiting_api') {
    const apiReady = await hasAvailableGeminiKey()
    if (!apiReady) {
      await bumpResumeRetry(jobId)
      return { resumed: false, reason: 'api_not_ready' }
    }
  }

  const effectiveJobType = jobData.jobType || data.jobType
  const resumeFromTopicIndex =
    jobData.resumeState?.resumeFromTopicIndex ??
    data.resumeState?.resumeFromTopicIndex ??
    0

  const serverPayload = mergeResumeServerPayload(jobData, data, resumeFromTopicIndex)

  await jobRef.update({
    status: 'running',
    message: 'Retomando geração automaticamente…',
    serverPayload,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  await touchActiveJob(userId, jobId, { status: 'running', jobType: effectiveJobType })

  const { processGenerationJob } = require('./jobProcessor')

  try {
    const outcome = await processGenerationJob(userId, jobId, {
      ...jobData,
      courseId: courseId || jobData.courseId,
      jobType: effectiveJobType,
      serverPayload,
    })
    if (!outcome?.paused) {
      await clearResumeQueue(jobId)
    }
    return { resumed: true, jobId, jobType: effectiveJobType, outcome }
  } catch (err) {
    console.error(`[resumeSingleGenerationJob] job ${jobId}:`, err)
    if (await isJobCancelled(userId, jobId)) {
      await handleGenerationJobCancelled(userId, jobId, {
        ...jobData,
        courseId: courseId || jobData.courseId,
        jobType: effectiveJobType,
      })
      return { resumed: false, reason: 'cancelled' }
    }
    if (isMentoradoJob(effectiveJobType)) {
      const pauseStatus = isApiQuotaError(err) ? 'waiting_api' : 'waiting_retry'
      await pauseJobForResume({
        userId,
        jobId,
        courseId: courseId || jobData.courseId,
        jobType: effectiveJobType,
        serverPayload,
        resumeFromTopicIndex,
        topicLabel: jobData.resumeState?.topicLabel || '',
        updateJob: async (uid, jid, patch) => {
          await db.doc(`users/${uid}/generationJobs/${jid}`).update({
            ...patch,
            serverPayload: patch.serverPayload || serverPayload,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          })
        },
        status: pauseStatus,
        waitReason: isApiQuotaError(err) ? 'api' : 'error',
        message: isApiQuotaError(err)
          ? 'API expirada — aguardando para retomar…'
          : `Erro temporário — tentando de novo em 15s… (${err.message || 'erro'})`,
      })
      await bumpResumeRetry(jobId)
      return { resumed: false, reason: 'error', error: err.message }
    }

    await jobRef.update({
      status: 'error',
      progress: 100,
      message: err.message || 'Falha ao retomar geração.',
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    await clearResumeQueue(jobId)
    return { resumed: false, reason: 'fatal', error: err.message }
  }
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

  const needsApi = snap.docs.some((d) => (d.data().status || '') === 'waiting_api')
  if (needsApi) {
    const apiReady = await hasAvailableGeminiKey()
    if (!apiReady) {
      for (const doc of snap.docs) {
        await bumpResumeRetry(doc.id)
      }
      return { resumed: 0, waiting: snap.size, apiReady: false, stalled }
    }
  }

  const { countActiveServerJobs, MAX_CONCURRENT_SERVER_JOBS } = require('./generationJobConcurrency')
  let activeCount = await countActiveServerJobs()
  const candidates = []

  for (const doc of snap.docs) {
    if (activeCount + candidates.length >= MAX_CONCURRENT_SERVER_JOBS) break
    candidates.push(doc)
  }

  if (!candidates.length) {
    return { resumed: 0, waiting: snap.size, stalled, slotsFull: true }
  }

  const results = await Promise.allSettled(
    candidates.map((doc) => resumeSingleGenerationJob(doc.id, doc.data())),
  )

  let resumed = 0
  results.forEach((result) => {
    if (result.status === 'fulfilled' && result.value?.resumed) resumed += 1
  })

  return { resumed, waiting: snap.size - resumed, stalled, parallel: candidates.length }
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
  resumeSingleGenerationJob,
  nudgeStalledGenerationJob,
  hasAvailableGeminiKey,
  touchActiveJob,
  clearActiveJob,
  clearResumeQueue,
  shouldCheckpointTimeout,
  runWithHeartbeat,
  CF_SAFE_MS,
  CONCURRENCY_RETRY_MS,
  STALL_PROGRESS_MS,
  WAITING_STATUSES,
}
