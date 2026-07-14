const admin = require('firebase-admin')
const { getTodayKeyInSaoPaulo, collectDayKeysUpToToday } = require('./guiaMentoradoShared')
const { prepareDayAutomation } = require('./guiaMentoradoDaily')
const { processGuiaMentoradoAutomation } = require('./guiaMentoradoAutomation')
const {
  shouldCheckpointTimeout,
  touchActiveJob,
  clearActiveJob,
  pauseJobForResume,
  isJobCancelled,
  JOB_HEARTBEAT_MS,
} = require('./generationJobResume')

function getDb() {
  return admin.firestore()
}

async function processGuiaMentoradoBackfill(userId, jobId, courseId, serverPayload, updateJob) {
  const jobStartedAt = Date.now()
  const dayKeys = serverPayload?.dayKeys?.length
    ? serverPayload.dayKeys
    : await collectDayKeysUpToToday(courseId, getDb)

  if (!dayKeys.length) {
    throw new Error('Nenhum dia de estudo encontrado no cronograma até hoje.')
  }

  const startDayIndex = Math.max(0, Number(serverPayload?.resumeFromDayIndex) || 0)
  const totalDays = dayKeys.length

  await touchActiveJob(userId, jobId, {
    jobType: 'guia_mentorado_backfill',
    courseId,
    status: 'running',
  })

  const keepAliveTimer = setInterval(() => {
    touchActiveJob(userId, jobId, { status: 'running', keepAlive: true }).catch(() => {})
  }, JOB_HEARTBEAT_MS)

  try {
  for (let i = startDayIndex; i < dayKeys.length; i += 1) {
    if (await isJobCancelled(userId, jobId)) {
      await clearActiveJob(jobId)
      return { cancelled: true }
    }

    if (shouldCheckpointTimeout(jobStartedAt)) {
      await updateJob(userId, jobId, {
        status: 'waiting_timeout',
        message: `Retomando em instantes — dia ${i + 1}/${totalDays}…`,
        serverPayload: {
          ...serverPayload,
          courseId,
          dayKeys,
          resumeFromDayIndex: i,
          resumeFromTopicIndex: 0,
        },
      })
      await pauseJobForResume({
        userId,
        jobId,
        courseId,
        jobType: 'guia_mentorado_backfill',
        serverPayload: {
          ...serverPayload,
          courseId,
          dayKeys,
          resumeFromDayIndex: i,
          resumeFromTopicIndex: 0,
        },
        resumeFromTopicIndex: 0,
        topicLabel: dayKeys[i],
        updateJob,
        status: 'waiting_timeout',
        waitReason: 'timeout',
        message: `Retomando em instantes — dia ${i + 1}/${totalDays}…`,
      })
      return { paused: true, resumeFromDayIndex: i }
    }

    const dayKey = dayKeys[i]
    const resumeTopicIndex =
      i === startDayIndex ? Math.max(0, Number(serverPayload?.resumeFromTopicIndex) || 0) : 0

    await updateJob(userId, jobId, {
      status: 'running',
      progress: Math.min(Math.round((i / totalDays) * 100), 99),
      message: `Gerando dia ${dayKey} (${i + 1}/${totalDays})…`,
      serverPayload: {
        ...serverPayload,
        courseId,
        dayKeys,
        resumeFromDayIndex: i,
        resumeFromTopicIndex: resumeTopicIndex,
      },
    })

    const prepared = await prepareDayAutomation(courseId, dayKey, { intent: 'backfill' })
    if (!prepared.ok) {
      continue
    }

    const automationPayload = {
      topics: prepared.topicPayloads,
      targetDate: dayKey,
      autoPublish: true,
      resumeFromTopicIndex: resumeTopicIndex,
    }

    const outcome = await processGuiaMentoradoAutomation(
      userId,
      jobId,
      courseId,
      automationPayload,
      updateJob,
      { nestedInBackfill: true },
    )

    if (outcome.cancelled) {
      await clearActiveJob(jobId)
      return outcome
    }

    if (outcome.paused) {
      const jobSnap = await getDb().doc(`users/${userId}/generationJobs/${jobId}`).get()
      const jobData = jobSnap.exists ? jobSnap.data() : {}
      const topicIdx = outcome.resumeFromTopicIndex ?? resumeTopicIndex

      await pauseJobForResume({
        userId,
        jobId,
        courseId,
        jobType: 'guia_mentorado_backfill',
        serverPayload: {
          ...serverPayload,
          courseId,
          dayKeys,
          resumeFromDayIndex: i,
          resumeFromTopicIndex: topicIdx,
          targetDate: dayKey,
          autoPublish: true,
        },
        resumeFromTopicIndex: topicIdx,
        topicLabel:
          prepared.topicPayloads?.[topicIdx]?.topicoNome ||
          dayKey,
        updateJob,
        status: jobData.status || 'waiting_retry',
        waitReason: jobData.waitReason || 'retry',
        message:
          jobData.message ||
          `Aguardando para retomar… (${dayKey})`,
      })

      return { paused: true, resumeFromDayIndex: i, resumeFromTopicIndex: topicIdx }
    }
  }

  await clearActiveJob(jobId)
  return { daysProcessed: totalDays, courseId }
  } finally {
    clearInterval(keepAliveTimer)
  }
}

module.exports = {
  processGuiaMentoradoBackfill,
}
