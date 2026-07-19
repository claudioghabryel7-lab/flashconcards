const {
  auditTopicBundleConsistency,
} = require('./unifiedContentGeneration')
const {
  isFlashcardsComplete,
  isMaterialComplete,
  isQuestoesComplete,
} = require('./generationCheckpoint')
const {
  runFlashcardsWithCheckpoint,
  runMaterialWithCheckpoint,
  runQuestoesWithCheckpoint,
} = require('./topicGenerationRunner')
const {
  sanitizeTopicKeyForFirestore,
  normalizeTopicKeyForStorage,
} = require('./topicKeyUtils')
const {
  initDayStatus,
  updateDayStatus,
  updateTopicStep,
  finalizeDayStatus,
} = require('./guiaMentoradoStatus')
const { markDayContentGenerated } = require('./guiaMentoradoStatus')
const {
  isApiQuotaError,
  isJobCancelled,
  isJobCancelledError,
  isPermanentGenerationError,
  pauseJobForApi,
  pauseJobForResume,
  touchActiveJob,
  clearActiveJob,
  clearResumeQueue,
  shouldCheckpointTimeout,
  runWithHeartbeat,
  throwIfCancelled,
  handleGenerationJobCancelled,
  JOB_HEARTBEAT_MS,
} = require('./generationJobResume')

const CONTENT_STATUS = {
  AVAILABLE: 'disponivel',
  UNAVAILABLE: 'indisponivel',
}

function getDb() {
  const admin = require('firebase-admin')
  return admin.firestore()
}

async function hasFlashcards(courseId, topicKey, disciplina, modulo) {
  return isFlashcardsComplete(courseId, topicKey, disciplina, modulo)
}

async function hasConteudo(courseId, topicKey) {
  return isMaterialComplete(courseId, topicKey)
}

async function hasQuestoes(courseId, topicKey) {
  return isQuestoesComplete(courseId, topicKey)
}

async function isTopicContentComplete(courseId, topic) {
  const [fc, mat, q] = await Promise.all([
    hasFlashcards(courseId, topic.topicKey, topic.disciplina, topic.modulo),
    hasConteudo(courseId, topic.topicKey),
    hasQuestoes(courseId, topic.topicKey),
  ])
  return { complete: fc && mat && q, flashcards: fc, material: mat, questoes: q }
}

async function generateAndSaveFlashcards(courseId, topic, jobId, onHeartbeat, shouldAbort) {
  const meta = topic.flashcardMeta
  if (await hasFlashcards(courseId, topic.topicKey, topic.disciplina, topic.modulo)) {
    return { skipped: true, type: 'flashcards' }
  }

  const runBatch = async (label, fn) =>
    runWithHeartbeat(fn, () => onHeartbeat?.(label), JOB_HEARTBEAT_MS, shouldAbort)

  const result = await runBatch('flashcards auditados', () =>
    runFlashcardsWithCheckpoint({
      courseId,
      jobId,
      meta,
      draftStatus: CONTENT_STATUS.UNAVAILABLE,
      onProgress: async (msg, partialCount) => {
        await onHeartbeat?.(
          partialCount ? `flashcards ${partialCount}/30 — ${msg}` : msg,
        )
      },
    }),
  )

  return { skipped: false, type: 'flashcards', count: result.count, resumed: result.resumed }
}

async function generateAndSaveConteudo(courseId, topic, jobId, onHeartbeat, shouldAbort) {
  if (await hasConteudo(courseId, topic.topicKey)) {
    return { skipped: true, type: 'conteudo' }
  }

  const runBatch = async (label, fn) =>
    runWithHeartbeat(fn, () => onHeartbeat?.(label), JOB_HEARTBEAT_MS, shouldAbort)

  await runBatch('material', () =>
    runMaterialWithCheckpoint({
      courseId,
      jobId,
      finalStatus: CONTENT_STATUS.UNAVAILABLE,
      params: {
        prompt: topic.conteudoPrompt,
        disciplina: topic.disciplina,
        topicoNome: topic.topicoNome,
        topicKey: topic.topicKey,
        banca: topic.flashcardMeta?.banca,
        concursoName: topic.flashcardMeta?.courseName,
        courseName: topic.flashcardMeta?.courseName,
        cargo: topic.flashcardMeta?.cargo,
        editalText: topic.flashcardMeta?.editalText,
      },
      onProgress: (msg) => onHeartbeat?.(msg),
    }),
  )

  return { skipped: false, type: 'conteudo' }
}

async function generateAndSaveQuestoes(courseId, topic, jobId, onHeartbeat, shouldAbort) {
  if (await hasQuestoes(courseId, topic.topicKey)) {
    return { skipped: true, type: 'questoes' }
  }

  const runBatch = async (label, fn) =>
    runWithHeartbeat(fn, () => onHeartbeat?.(label), JOB_HEARTBEAT_MS, shouldAbort)

  await runBatch('questões', () =>
    runQuestoesWithCheckpoint({
      courseId,
      jobId,
      finalStatus: CONTENT_STATUS.UNAVAILABLE,
      params: {
        prompt: topic.questoesPrompt,
        disciplina: topic.disciplina,
        topicoNome: topic.topicoNome,
        topicKey: topic.topicKey,
        banca: topic.flashcardMeta?.banca,
        concursoName: topic.flashcardMeta?.courseName,
        cargo: topic.flashcardMeta?.cargo,
        editalText: topic.flashcardMeta?.editalText,
      },
      onProgress: (msg) => onHeartbeat?.(msg),
    }),
  )

  return { skipped: false, type: 'questoes' }
}

async function publishTopicoStatus(courseId, topic) {
  const status = CONTENT_STATUS.AVAILABLE
  const normalized = normalizeTopicKeyForStorage(topic.topicKey)
  const sanitized = sanitizeTopicKeyForFirestore(topic.topicKey)
  const ts = require('firebase-admin').firestore.FieldValue.serverTimestamp()
  const db = getDb()

  await db.doc(`courses/${courseId}/topicoStatus/${sanitized}`).set(
    {
      topicKey: normalized,
      status,
      disciplinaNome: topic.disciplina,
      releasedAssets: {
        flashcards: true,
        material: true,
        questoes: true,
      },
      updatedAt: ts,
      mentoradoAutomation: true,
    },
    { merge: true },
  )

  const flashcardsRef = db.collection(`courses/${courseId}/flashcards`)
  let flashcardDocs = []
  if (normalized) {
    const byTopic = await flashcardsRef.where('topicKey', '==', normalized).get()
    flashcardDocs = byTopic.docs
  }
  if (!flashcardDocs.length && topic.disciplina && topic.modulo) {
    const byModulo = await flashcardsRef
      .where('materia', '==', topic.disciplina)
      .where('modulo', '==', topic.modulo)
      .get()
    flashcardDocs = byModulo.docs
  }

  let batch = db.batch()
  let ops = 0

  const queue = async (ref, data) => {
    batch.set(ref, data, { merge: true })
    ops += 1
    if (ops >= 400) {
      await batch.commit()
      batch = db.batch()
      ops = 0
    }
  }

  for (const d of flashcardDocs) {
    await queue(d.ref, { status, topicKey: normalized, updatedAt: ts })
  }

  const conteudoRef = db.doc(`courses/${courseId}/conteudosCompletos/${sanitized}`)
  if ((await conteudoRef.get()).exists) {
    await queue(conteudoRef, { status, topicKey: topic.topicKey, updatedAt: ts })
  }

  const questoesRef = db.doc(`courses/${courseId}/questoesTopico/${sanitized}_nivel_1`)
  if ((await questoesRef.get()).exists) {
    await queue(questoesRef, { status, topicKey: normalized, updatedAt: ts })
  }

  if (ops) await batch.commit()
}

async function processSingleTopic(
  courseId,
  targetDate,
  topic,
  updateJob,
  userId,
  jobId,
  index,
  total,
) {
  const label = topic.topicoNome || topic.topicKey
  const basePct = Math.round((index / total) * 100)

  const shouldAbort = () => isJobCancelled(userId, jobId)

  const heartbeat = async (step) => {
    await throwIfCancelled(userId, jobId)
    await updateJob(userId, jobId, {
      progress: Math.min(basePct + 3, 98),
      message: `[${index + 1}/${total}] ${label} — ${step}… (aguarde)`,
    })
    await touchActiveJob(userId, jobId, { step, topicIndex: index })
  }

  await throwIfCancelled(userId, jobId)
  await updateTopicStep(courseId, targetDate, topic.topicKey, {
    status: 'generating',
    step: 'flashcards',
  })

  await updateJob(userId, jobId, {
    progress: Math.min(basePct + 3, 98),
    message: `[${index + 1}/${total}] ${label} — gerando flashcards…`,
  })

  await generateAndSaveFlashcards(courseId, topic, jobId, heartbeat, shouldAbort)
  await throwIfCancelled(userId, jobId)
  await updateTopicStep(courseId, targetDate, topic.topicKey, { flashcards: 'done', step: 'material' })

  await updateJob(userId, jobId, {
    progress: Math.min(basePct + 15, 98),
    message: `[${index + 1}/${total}] ${label} — gerando material…`,
  })

  await generateAndSaveConteudo(courseId, topic, jobId, heartbeat, shouldAbort)
  await throwIfCancelled(userId, jobId)
  await updateTopicStep(courseId, targetDate, topic.topicKey, { material: 'done', step: 'questoes' })

  await updateJob(userId, jobId, {
    progress: Math.min(basePct + 28, 98),
    message: `[${index + 1}/${total}] ${label} — gerando questões…`,
  })

  await generateAndSaveQuestoes(courseId, topic, jobId, heartbeat, shouldAbort)
  await updateTopicStep(courseId, targetDate, topic.topicKey, { questoes: 'done', step: 'publicando' })

  const readiness = await isTopicContentComplete(courseId, topic)
  if (!readiness.complete) {
    const missing = []
    if (!readiness.flashcards) missing.push('flashcards')
    if (!readiness.material) missing.push('material')
    if (!readiness.questoes) missing.push('questões')
    const err = new Error(`Incompleto: falta ${missing.join(', ')}`)
    err.code = 'topic_incomplete'
    throw err
  }

  await heartbeat('auditoria cruzada')
  const db = getDb()
  const normalized = normalizeTopicKeyForStorage(topic.topicKey)
  const sanitized = sanitizeTopicKeyForFirestore(topic.topicKey)
  let fcDocs = []
  if (normalized) {
    fcDocs = (await db.collection(`courses/${courseId}/flashcards`).where('topicKey', '==', normalized).get()).docs
  }
  const fcItems = fcDocs.map((d) => d.data())
  const matSnap = await db.doc(`courses/${courseId}/conteudosCompletos/${sanitized}`).get()
  const qSnap = await db.doc(`courses/${courseId}/questoesTopico/${sanitized}_nivel_1`).get()
  await auditTopicBundleConsistency({
    flashcards: fcItems,
    materialSample: matSnap.exists ? JSON.stringify(matSnap.data()).slice(0, 8000) : '',
    questoesSample: qSnap.exists ? JSON.stringify(qSnap.data()).slice(0, 8000) : '',
    courseContext: {
      banca: topic.flashcardMeta?.banca,
      concursoName: topic.flashcardMeta?.courseName,
      cargo: topic.flashcardMeta?.cargo,
      disciplina: topic.disciplina,
      topicoNome: topic.topicoNome,
    },
  })

  await publishTopicoStatus(courseId, topic)
  await updateTopicStep(courseId, targetDate, topic.topicKey, {
    status: 'published',
    step: 'concluído',
    error: null,
  })
  await updateJob(userId, jobId, {
    progress: Math.min(basePct + 35, 99),
    message: `[${index + 1}/${total}] ${label} — liberado para alunos ✓`,
  })
  return { published: true }
}

async function pauseAutomationJob({
  err,
  userId,
  jobId,
  courseId,
  serverPayload,
  topicIndex,
  topics,
  targetDate,
  updateJob,
  nestedInBackfill = false,
}) {
  const label = topics[topicIndex]?.topicoNome || topics[topicIndex]?.topicKey || ''
  const waitReason = isApiQuotaError(err) ? 'api' : err?.code === 'cf_timeout' ? 'timeout' : 'retry'
  const jobStatus = isApiQuotaError(err)
    ? 'waiting_api'
    : waitReason === 'timeout'
      ? 'waiting_timeout'
      : 'waiting_retry'

  const defaultMessages = {
    waiting_api: label ? `API expirada — aguardando… (${label})` : 'API expirada — aguardando…',
    waiting_timeout: label
      ? `Pausado (limite do servidor) — retomando… (${label})`
      : 'Pausado (limite do servidor) — retomando…',
    waiting_retry: label ? `Aguardando para retomar… (${label})` : 'Aguardando para retomar…',
  }

  const finalMessage =
    isApiQuotaError(err)
      ? defaultMessages.waiting_api
      : waitReason === 'timeout'
        ? defaultMessages.waiting_timeout
        : err?.message
          ? `Aguardando para retomar… (${label})`
          : defaultMessages.waiting_retry

  if (nestedInBackfill) {
    await updateJob(userId, jobId, {
      status: jobStatus,
      message: finalMessage,
      resumeState: {
        resumeFromTopicIndex: topicIndex,
        targetDate,
        topicLabel: label,
        waitReason,
      },
      waitReason,
    })
    return {
      paused: true,
      resumeFromTopicIndex: topicIndex,
      targetDate,
    }
  }

  const pauseFn = isApiQuotaError(err) ? pauseJobForApi : pauseJobForResume
  await pauseFn({
    userId,
    jobId,
    courseId,
    jobType: 'guia_mentorado_automation',
    serverPayload: { ...serverPayload, resumeFromTopicIndex: topicIndex },
    resumeFromTopicIndex: topicIndex,
    topicLabel: label,
    updateJob,
    status: jobStatus,
    waitReason,
    message: finalMessage,
  })

  if (targetDate) {
    await updateDayStatus(courseId, targetDate, {
      status: jobStatus,
      reason: err?.message || 'Aguardando retomada automática',
    })
  }

  return {
    paused: true,
    resumeFromTopicIndex: topicIndex,
    targetDate,
  }
}

async function abortAutomationJob({
  userId,
  jobId,
  courseId,
  serverPayload,
  targetDate,
  topics,
  topicIndex,
}) {
  await clearActiveJob(jobId)
  await handleGenerationJobCancelled(userId, jobId, {
    courseId,
    jobType: 'guia_mentorado_automation',
    serverPayload,
    resumeState: { targetDate },
  })
}

async function processGuiaMentoradoAutomation(
  userId,
  jobId,
  courseId,
  serverPayload,
  updateJob,
  options = {},
) {
  const topics = serverPayload?.topics || []
  const autoPublish = serverPayload?.autoPublish !== false
  const targetDate = serverPayload?.targetDate || null
  const startIndex = Math.max(0, Number(serverPayload?.resumeFromTopicIndex) || 0)
  const jobStartedAt = Date.now()
  const nestedInBackfill = Boolean(options.nestedInBackfill)

  if (!topics.length) {
    throw new Error('Nenhum tópico enviado para automação do Guia Mentorado.')
  }
  if (!autoPublish) {
    throw new Error('Automação requer publicação automática após geração.')
  }

  if (await isJobCancelled(userId, jobId)) {
    await abortAutomationJob({
      userId,
      jobId,
      courseId,
      serverPayload,
      targetDate,
      topics,
      topicIndex: startIndex,
    })
    return { cancelled: true }
  }

  const total = topics.length
  let publishedCount = 0

  if (targetDate && startIndex === 0) {
    await initDayStatus(courseId, targetDate, topics, jobId, userId)
  } else if (targetDate && startIndex > 0) {
    await updateDayStatus(courseId, targetDate, { status: 'running', jobId })
  }

  const dateLabel = targetDate ? ` ${targetDate}` : ''
  await updateJob(userId, jobId, {
    status: 'running',
    progress: Math.min(Math.round((startIndex / total) * 100), 99),
    message:
      startIndex > 0
        ? `Retomando dia${dateLabel} — tópico ${startIndex + 1}/${total}…`
        : `Dia${dateLabel} — ${total} tópico(s), um por vez…`,
  })
  await touchActiveJob(userId, jobId, {
    jobType: 'guia_mentorado_automation',
    courseId,
    status: 'running',
  })

  let keepAliveTimer = null
  const startKeepAlive = () => {
    if (keepAliveTimer) return
    keepAliveTimer = setInterval(() => {
      touchActiveJob(userId, jobId, { status: 'running', keepAlive: true }).catch(() => {})
    }, JOB_HEARTBEAT_MS)
  }
  const stopKeepAlive = () => {
    if (!keepAliveTimer) return
    clearInterval(keepAliveTimer)
    keepAliveTimer = null
  }

  startKeepAlive()

  try {
  for (let i = startIndex; i < topics.length; i += 1) {
    if (await isJobCancelled(userId, jobId)) {
      await abortAutomationJob({
        userId,
        jobId,
        courseId,
        serverPayload,
        targetDate,
        topics,
        topicIndex: i,
      })
      return { cancelled: true, publishedCount }
    }

    if (shouldCheckpointTimeout(jobStartedAt)) {
      const err = new Error('Checkpoint do servidor — retomando em instantes')
      err.code = 'cf_timeout'
      return pauseAutomationJob({
        err,
        userId,
        jobId,
        courseId,
        serverPayload,
        topicIndex: i,
        topics,
        targetDate,
        updateJob,
        nestedInBackfill,
      })
    }

    try {
      const result = await processSingleTopic(
        courseId,
        targetDate,
        topics[i],
        updateJob,
        userId,
        jobId,
        i,
        total,
      )
      if (result.published) publishedCount += 1
      await touchActiveJob(userId, jobId, { topicIndex: i, publishedCount })
    } catch (err) {
      if (isJobCancelledError(err) || (await isJobCancelled(userId, jobId))) {
        await abortAutomationJob({
          userId,
          jobId,
          courseId,
          serverPayload,
          targetDate,
          topics,
          topicIndex: i,
        })
        return { cancelled: true, publishedCount }
      }
      if (isPermanentGenerationError(err)) {
        const topicKey = topics[i]?.topicKey
        if (targetDate && topicKey) {
          await updateTopicStep(courseId, targetDate, topicKey, {
            status: 'error',
            error: err.message,
          })
          await updateDayStatus(courseId, targetDate, {
            status: 'error',
            reason: err.message,
          })
        }
        await updateJob(userId, jobId, {
          status: 'error',
          progress: 100,
          message: err.message || 'Erro permanente na automação.',
          finishedAt: require('firebase-admin').firestore.FieldValue.serverTimestamp(),
        })
        await clearActiveJob(jobId)
        await clearResumeQueue(jobId)
        return { error: err.message, publishedCount }
      }
      return pauseAutomationJob({
        err,
        userId,
        jobId,
        courseId,
        serverPayload,
        topicIndex: i,
        topics,
        targetDate,
        updateJob,
        nestedInBackfill,
      })
    }
  }

  await clearActiveJob(jobId)

  if (targetDate) {
    await finalizeDayStatus(courseId, targetDate, { errors: [], total })
    await updateDayStatus(courseId, targetDate, {
      publishedCount,
      status: publishedCount >= total ? 'done' : 'partial',
    })
    if (publishedCount >= total) {
      await markDayContentGenerated(courseId, targetDate, publishedCount, total)
      try {
        const { normalizeMentoradoAutomationConfig } = require('./guiaMentoradoConfig')
        const cfgSnap = await getDb().doc(`courses/${courseId}/config/guiaMentorado`).get()
        const automation = normalizeMentoradoAutomationConfig(cfgSnap.exists ? cfgSnap.data() : {})
        if (automation.vespera.releaseOnDayComplete) {
          const { releaseNextVesperaDisciplina } = require('./vesperaDailyRelease')
          await releaseNextVesperaDisciplina(courseId)
        }
      } catch (vesperaErr) {
        console.warn(`[mentorado] véspera release ${courseId}:`, vesperaErr.message)
      }
    }
  }

  return { totalTopics: total, publishedCount, targetDate, paused: false }
  } finally {
    stopKeepAlive()
  }
}

module.exports = {
  processGuiaMentoradoAutomation,
  isTopicContentComplete,
  publishTopicoStatus,
}
