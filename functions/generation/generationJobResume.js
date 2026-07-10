const admin = require('firebase-admin')
const {
  getGeminiKeysInOrder,
  silentProbeGeminiKey,
} = require('./geminiKeyPool')

const RETRY_INTERVAL_MS = 5 * 60 * 1000

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

async function pauseJobForApi({
  userId,
  jobId,
  courseId,
  jobType,
  serverPayload,
  resumeFromTopicIndex = 0,
  topicLabel = '',
  updateJob,
}) {
  const ts = admin.firestore.FieldValue.serverTimestamp()
  const nextRetryAt = new Date(Date.now() + RETRY_INTERVAL_MS)

  const resumeState = {
    resumeFromTopicIndex,
    targetDate: serverPayload?.targetDate || null,
    topicLabel,
  }

  const message = topicLabel
    ? `API expirada — aguardando… (${topicLabel})`
    : 'API expirada — aguardando liberação das chaves…'

  await updateJob(userId, jobId, {
    status: 'waiting_api',
    message,
    resumeState,
    nextRetryAt: admin.firestore.Timestamp.fromDate(nextRetryAt),
  })

  await getDb().doc(`generationResumeQueue/${jobId}`).set({
    userId,
    jobId,
    courseId,
    jobType,
    serverPayload,
    resumeState,
    nextRetryAt: admin.firestore.Timestamp.fromDate(nextRetryAt),
    updatedAt: ts,
    createdAt: ts,
  })
}

async function hasAvailableGeminiKey() {
  const keys = getGeminiKeysInOrder()
  for (const key of keys) {
    const ok = await silentProbeGeminiKey(key)
    if (ok) return true
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
}

async function resumeWaitingGenerationJobs() {
  const db = getDb()
  const now = admin.firestore.Timestamp.now()
  const snap = await db
    .collection('generationResumeQueue')
    .where('nextRetryAt', '<=', now)
    .limit(20)
    .get()

  if (snap.empty) return { resumed: 0, waiting: 0 }

  const apiReady = await hasAvailableGeminiKey()
  if (!apiReady) {
    for (const doc of snap.docs) {
      await bumpResumeRetry(doc.id)
    }
    return { resumed: 0, waiting: snap.size, apiReady: false }
  }

  const { processGenerationJob } = require('./jobProcessor')
  let resumed = 0

  for (const doc of snap.docs) {
    const data = doc.data()
    const { userId, jobId, courseId, jobType } = data
    if (!userId || !jobId) continue

    const jobRef = db.doc(`users/${userId}/generationJobs/${jobId}`)
    const jobSnap = await jobRef.get()
    if (!jobSnap.exists) {
      await clearResumeQueue(jobId)
      continue
    }

    const jobData = jobSnap.data()
    if (jobData.status !== 'waiting_api') {
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
      message: 'API disponível — retomando geração…',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    try {
      await processGenerationJob(userId, jobId, {
        ...jobData,
        courseId: courseId || jobData.courseId,
        jobType: jobType || jobData.jobType,
        serverPayload,
      })
      await clearResumeQueue(jobId)
      resumed += 1
    } catch (err) {
      console.error(`[resumeWaitingGenerationJobs] job ${jobId}:`, err)
      if (isApiQuotaError(err)) {
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

  return { resumed, waiting: snap.size - resumed, apiReady: true }
}

module.exports = {
  isApiQuotaError,
  pauseJobForApi,
  resumeWaitingGenerationJobs,
  hasAvailableGeminiKey,
}
