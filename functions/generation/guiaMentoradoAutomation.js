const { generateAiJson } = require('./geminiServer')
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
  pauseJobForApi,
  pauseJobForResume,
  touchActiveJob,
  clearActiveJob,
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

const MIN_FLASHCARDS = 40
const MAX_FLASHCARDS = 60
const BATCH_SIZE = 30

function getDb() {
  const admin = require('firebase-admin')
  return admin.firestore()
}

function normalizeCardText(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function dedupeFlashcards(items = []) {
  const seen = new Set()
  return items.filter((item) => {
    const front = normalizeCardText(item.frente || item.pergunta)
    if (!front || seen.has(front)) return false
    seen.add(front)
    return true
  })
}

function buildFlashcardPrompt(meta, batchNumber, totalBatches, cardsInBatch, existingFronts = []) {
  const existingList = existingFronts.length
    ? `\nNÃO repita:\n${existingFronts.slice(0, 40).map((f) => `- ${f}`).join('\n')}`
    : ''

  return `Gere flashcards para o tópico:
CURSO: ${meta.courseName || ''}
DISCIPLINA: ${meta.disciplina}
TÓPICO: ${meta.topicoNumero ? `${meta.topicoNumero} - ` : ''}${meta.topicoNome}
LOTE: ${batchNumber}/${totalBatches} — ${cardsInBatch} cards
${existingList}

EDITAL:
${(meta.editalText || '').slice(0, 12000)}

JSON: { "flashcards": [{ "frente": "", "verso": "", "dificuldade": "médio" }] }
Retorne APENAS JSON válido.`
}

async function hasFlashcards(courseId, topicKey, disciplina, modulo) {
  const snap = await getDb().collection(`courses/${courseId}/flashcards`).get()
  const normalized = normalizeTopicKeyForStorage(topicKey)
  return snap.docs.some((d) => {
    const data = d.data()
    if (normalizeTopicKeyForStorage(data.topicKey) === normalized) return true
    return data.materia === disciplina && data.modulo === modulo
  })
}

async function hasConteudo(courseId, topicKey) {
  const key = sanitizeTopicKeyForFirestore(topicKey)
  const snap = await getDb().doc(`courses/${courseId}/conteudosCompletos/${key}`).get()
  if (!snap.exists) return false
  const data = snap.data()
  return Boolean(data.content || (data.secoes && data.secoes.length) || data.revisaoTurbo?.length)
}

async function hasQuestoes(courseId, topicKey) {
  const key = `${sanitizeTopicKeyForFirestore(topicKey)}_nivel_1`
  const snap = await getDb().doc(`courses/${courseId}/questoesTopico/${key}`).get()
  return snap.exists
}

async function isTopicContentComplete(courseId, topic) {
  const [fc, mat, q] = await Promise.all([
    hasFlashcards(courseId, topic.topicKey, topic.disciplina, topic.modulo),
    hasConteudo(courseId, topic.topicKey),
    hasQuestoes(courseId, topic.topicKey),
  ])
  return { complete: fc && mat && q, flashcards: fc, material: mat, questoes: q }
}

async function deleteExistingFlashcards(courseId, topicKey, disciplina, modulo) {
  const snap = await getDb().collection(`courses/${courseId}/flashcards`).get()
  const normalized = normalizeTopicKeyForStorage(topicKey)
  const batch = getDb().batch()
  let count = 0

  snap.docs.forEach((d) => {
    const data = d.data()
    const match =
      normalizeTopicKeyForStorage(data.topicKey) === normalized ||
      (data.materia === disciplina && data.modulo === modulo)
    if (match) {
      batch.delete(d.ref)
      count += 1
    }
  })

  if (count) await batch.commit()
}

async function generateAndSaveFlashcards(courseId, topic, onHeartbeat, shouldAbort) {
  const meta = topic.flashcardMeta
  if (await hasFlashcards(courseId, topic.topicKey, topic.disciplina, topic.modulo)) {
    return { skipped: true, type: 'flashcards' }
  }

  await deleteExistingFlashcards(courseId, topic.topicKey, topic.disciplina, topic.modulo)

  let allItems = []
  const firstBatchCount = Math.min(BATCH_SIZE, MAX_FLASHCARDS)

  const runBatch = async (label, fn) =>
    runWithHeartbeat(fn, () => onHeartbeat?.(label), JOB_HEARTBEAT_MS, shouldAbort)

  await onHeartbeat?.('flashcards lote 1/2')
  const batch1 = await runBatch('flashcards lote 1/2', () =>
    generateAiJson(buildFlashcardPrompt(meta, 1, 2, firstBatchCount, []), {
      generationConfig: { maxOutputTokens: 24000, temperature: 0.35 },
    }),
  )
  allItems = dedupeFlashcards(batch1.flashcards || [])

  if (allItems.length < MIN_FLASHCARDS) {
    await onHeartbeat?.('flashcards lote 2/2')
    const remaining = Math.min(MAX_FLASHCARDS - allItems.length, BATCH_SIZE)
    const batch2 = await runBatch('flashcards lote 2/2', () =>
      generateAiJson(
        buildFlashcardPrompt(
          meta,
          2,
          2,
          remaining,
          allItems.map((c) => c.frente || c.pergunta),
        ),
        { generationConfig: { maxOutputTokens: 24000, temperature: 0.35 } },
      ),
    )
    allItems = dedupeFlashcards([...allItems, ...(batch2.flashcards || [])])
  }

  allItems = allItems.slice(0, MAX_FLASHCARDS)
  if (allItems.length < MIN_FLASHCARDS) {
    throw new Error(`Flashcards insuficientes para ${topic.topicoNome} (${allItems.length})`)
  }

  const db = getDb()
  const flashcardsRef = db.collection(`courses/${courseId}/flashcards`)
  let batch = db.batch()
  let opCount = 0
  const ts = require('firebase-admin').firestore.FieldValue.serverTimestamp()
  const draftStatus = CONTENT_STATUS.UNAVAILABLE

  for (let index = 0; index < allItems.length; index += 1) {
    const item = allItems[index]
    const docRef = flashcardsRef.doc()
    const frente = item.frente || item.pergunta || ''
    const verso = item.verso || item.resposta || ''

    batch.set(docRef, {
      disciplina: meta.disciplina,
      materia: meta.disciplina,
      topico: meta.topicoNome,
      topicoNumero: meta.topicoNumero || '',
      modulo: meta.modulo,
      topicKey: normalizeTopicKeyForStorage(meta.topicKey),
      frente,
      verso,
      pergunta: frente,
      resposta: verso,
      dificuldade: item.dificuldade || 'médio',
      courseId,
      shared: true,
      status: draftStatus,
      createdAt: ts,
      updatedAt: ts,
      order: index,
    })

    opCount += 1
    if (opCount >= 400) {
      await batch.commit()
      batch = db.batch()
      opCount = 0
    }
  }

  if (opCount) await batch.commit()
  return { skipped: false, type: 'flashcards', count: allItems.length }
}

async function generateAndSaveConteudo(courseId, topic, onHeartbeat, shouldAbort) {
  if (await hasConteudo(courseId, topic.topicKey)) {
    return { skipped: true, type: 'conteudo' }
  }

  const { validateConteudoCompletoPayload } = require('./conteudoCompletoValidate')
  const { hydrateConteudoCompletoMaterial } = require('./materialFormatting')

  const parsed = await runWithHeartbeat(
    () =>
      generateAiJson(topic.conteudoPrompt, {
        useRAG: true,
        useGoogleSearch: true,
        generationConfig: { maxOutputTokens: 32000, temperature: 0.35 },
        rejectTruncatedJson: true,
        maxParseAttempts: 4,
      }),
    () => onHeartbeat?.('material'),
    JOB_HEARTBEAT_MS,
    shouldAbort,
  )

  const validation = validateConteudoCompletoPayload(parsed)
  if (!validation.ok) {
    const err = new Error(`Material incompleto — ${validation.errors.join(' ')}`)
    err.code = 'material_incomplete'
    throw err
  }

  const hydrated = hydrateConteudoCompletoMaterial(parsed, topic.topicKey)
  const sanitizedKey = sanitizeTopicKeyForFirestore(topic.topicKey)
  const ts = require('firebase-admin').firestore.FieldValue.serverTimestamp()

  await getDb()
    .doc(`courses/${courseId}/conteudosCompletos/${sanitizedKey}`)
    .set(
      {
        ...hydrated,
        materia: hydrated.materia,
        numero: hydrated.numero || topic.topicKey,
        topicKey: topic.topicKey,
        status: CONTENT_STATUS.UNAVAILABLE,
        updatedAt: ts,
        generatedAt: ts,
      },
      { merge: true },
    )

  return { skipped: false, type: 'conteudo' }
}

async function generateAndSaveQuestoes(courseId, topic, onHeartbeat, shouldAbort) {
  if (await hasQuestoes(courseId, topic.topicKey)) {
    return { skipped: true, type: 'questoes' }
  }

  const parsed = await runWithHeartbeat(
    () =>
      generateAiJson(topic.questoesPrompt, {
        useRAG: true,
        useGoogleSearch: true,
        generationConfig: { maxOutputTokens: 32000, temperature: 0.35 },
      }),
    () => onHeartbeat?.('questões'),
    JOB_HEARTBEAT_MS,
    shouldAbort,
  )

  const sanitizedKey = `${sanitizeTopicKeyForFirestore(topic.topicKey)}_nivel_1`
  const ts = require('firebase-admin').firestore.FieldValue.serverTimestamp()

  await getDb()
    .doc(`courses/${courseId}/questoesTopico/${sanitizedKey}`)
    .set(
      {
        ...parsed,
        topico: parsed.topico || topic.topicoNome,
        nivel: 1,
        topicKey: topic.topicKey,
        status: CONTENT_STATUS.UNAVAILABLE,
        updatedAt: ts,
        generatedAt: ts,
      },
      { merge: true },
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

  const flashcardsSnap = await db.collection(`courses/${courseId}/flashcards`).get()
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

  for (const d of flashcardsSnap.docs) {
    const data = d.data()
    if (
      normalizeTopicKeyForStorage(data.topicKey) === normalized ||
      (data.materia === topic.disciplina && data.modulo === topic.modulo)
    ) {
      await queue(d.ref, { status, topicKey: normalized, updatedAt: ts })
    }
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

  await generateAndSaveFlashcards(courseId, topic, heartbeat, shouldAbort)
  await throwIfCancelled(userId, jobId)
  await updateTopicStep(courseId, targetDate, topic.topicKey, { flashcards: 'done', step: 'material' })

  await updateJob(userId, jobId, {
    progress: Math.min(basePct + 15, 98),
    message: `[${index + 1}/${total}] ${label} — gerando material…`,
  })

  await generateAndSaveConteudo(courseId, topic, heartbeat, shouldAbort)
  await throwIfCancelled(userId, jobId)
  await updateTopicStep(courseId, targetDate, topic.topicKey, { material: 'done', step: 'questoes' })

  await updateJob(userId, jobId, {
    progress: Math.min(basePct + 28, 98),
    message: `[${index + 1}/${total}] ${label} — gerando questões…`,
  })

  await generateAndSaveQuestoes(courseId, topic, heartbeat, shouldAbort)
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
    const statusSnap = await getDb().doc(`courses/${courseId}/mentoradoAutomation/${targetDate}`).get()
    const totalPublished = statusSnap.exists ? statusSnap.data().publishedCount || 0 : publishedCount
    await finalizeDayStatus(courseId, targetDate, { errors: [], total })
    await updateDayStatus(courseId, targetDate, {
      publishedCount: totalPublished,
      status: totalPublished >= total ? 'done' : 'partial',
    })
    if (totalPublished >= total) {
      await markDayContentGenerated(courseId, targetDate, totalPublished, total)
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
