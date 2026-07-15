const admin = require('firebase-admin')
const { generateAiJsonWithJobHeartbeat } = require('./generationJobResume')
const {
  sanitizeTopicKeyForFirestore,
  normalizeTopicKeyForStorage,
  sanitizeDisciplinaKey,
} = require('./topicKeyUtils')

const CONTENT_STATUS = {
  AVAILABLE: 'disponivel',
  UNAVAILABLE: 'indisponivel',
}

const { sanitizeFlashcardText, AI_TEXT_FORMAT_RULES, sanitizeQuestaoAlternativas } = require('./aiTextFormatting')
const MIN_FLASHCARDS = 40
const MAX_FLASHCARDS = 60
const BATCH_SIZE = 30

function getDb() {
  return admin.firestore()
}

/** Garante alternativas A→E em cada questão antes de gravar. */
function normalizeParsedQuestoes(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const list = parsed.questoes || parsed.questions
  if (!Array.isArray(list)) return parsed
  const normalized = list.map((q) => {
    if (!q || typeof q !== 'object') return q
    if (q.alternativas == null) return q
    return { ...q, alternativas: sanitizeQuestaoAlternativas(q.alternativas) }
  })
  if (Array.isArray(parsed.questoes)) return { ...parsed, questoes: normalized }
  if (Array.isArray(parsed.questions)) return { ...parsed, questions: normalized }
  return parsed
}

async function updateJob(userId, jobId, patch) {
  const ts = admin.firestore.FieldValue.serverTimestamp()
  const { stripUndefinedDeep } = require('./generationJobResume')
  await getDb()
    .doc(`users/${userId}/generationJobs/${jobId}`)
    .update(
      stripUndefinedDeep({
        ...patch,
        updatedAt: ts,
        progressUpdatedAt: ts,
      }),
    )
}

async function resolveTopicoPublishStatus(courseId, topicKey) {
  const sanitized = sanitizeTopicKeyForFirestore(topicKey)
  if (!sanitized) return CONTENT_STATUS.UNAVAILABLE

  const snap = await getDb().doc(`courses/${courseId}/topicoStatus/${sanitized}`).get()
  if (snap.exists && snap.data().status === CONTENT_STATUS.AVAILABLE) {
    return CONTENT_STATUS.AVAILABLE
  }
  return CONTENT_STATUS.UNAVAILABLE
}

async function resolveIncidenciaContentStatus(courseId, disciplinaNome) {
  const key = sanitizeDisciplinaKey(disciplinaNome)
  const snap = await getDb().doc(`courses/${courseId}/conteudosIncidencia/${key}`).get()
  if (snap.exists) {
    const status = snap.data().status
    if (status === CONTENT_STATUS.AVAILABLE || status === 'disponivel') {
      return CONTENT_STATUS.AVAILABLE
    }
  }
  return CONTENT_STATUS.UNAVAILABLE
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
    ? `\nNÃO repita estas frentes já geradas:\n${existingFronts.slice(0, 40).map((f) => `- ${f}`).join('\n')}`
    : ''

  return `Gere flashcards para o tópico do edital abaixo.

CURSO: ${meta.courseName || ''}
DISCIPLINA: ${meta.disciplina}
TÓPICO: ${meta.topicoNumero ? `${meta.topicoNumero} - ` : ''}${meta.topicoNome}
MÓDULO: ${meta.modulo}
BANCA: ${meta.banca || 'não informada'}
LOTE: ${batchNumber}/${totalBatches} — gere exatamente ${cardsInBatch} cards neste lote.
${existingList}

EDITAL (trecho):
${(meta.editalText || '').slice(0, 12000)}

FORMATO JSON OBRIGATÓRIO:
{
  "flashcards": [
    { "frente": "pergunta", "verso": "resposta completa", "dificuldade": "fácil|médio|difícil" }
  ]
}

REGRAS:
- Retorne APENAS JSON válido
- ${AI_TEXT_FORMAT_RULES}
- Separe ideias no verso com linha em branco entre parágrafos
- Respostas completas e detalhadas (mínimo 2-4 frases no verso), nunca superficiais
- Cubra TODO o tópico — são necessários ${MIN_FLASHCARDS} a ${MAX_FLASHCARDS} cards no total
- Conteúdo fiel à legislação e ao edital`
}

async function deleteExistingFlashcards(courseId, topicKey, disciplina, modulo) {
  const db = getDb()
  const normalizedTopicKey = normalizeTopicKeyForStorage(topicKey)
  const flashcardsRef = db.collection(`courses/${courseId}/flashcards`)

  let docs = []
  if (normalizedTopicKey) {
    const byTopic = await flashcardsRef.where('topicKey', '==', normalizedTopicKey).get()
    docs = byTopic.docs
  }

  if (!docs.length && disciplina && modulo) {
    const byModule = await flashcardsRef
      .where('materia', '==', disciplina)
      .where('modulo', '==', modulo)
      .get()
    docs = byModule.docs
  }

  if (!docs.length) return

  const batch = db.batch()
  docs.forEach((d) => batch.delete(d.ref))
  await batch.commit()
}

async function saveMergeDoc(courseId, collectionName, docId, parsed, extraFields = {}) {
  const ref = getDb().doc(`courses/${courseId}/${collectionName}/${docId}`)
  await ref.set(
    {
      ...parsed,
      ...extraFields,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  return { collection: collectionName, docId }
}

async function processConteudoCompleto(userId, jobId, courseId, serverPayload) {
  const { prompt, aiOptions = {}, savePlan = {} } = serverPayload
  const { validateConteudoCompletoPayload } = require('./conteudoCompletoValidate')
  const { hydrateConteudoCompletoMaterial } = require('./materialFormatting')
  await updateJob(userId, jobId, { progress: 15, message: 'Gerando conteúdo com IA…' })

  const parsed = await generateAiJsonWithJobHeartbeat(
    userId,
    jobId,
    prompt,
    {
      useRAG: aiOptions.useRAG ?? true,
      useGoogleSearch: aiOptions.useGoogleSearch ?? true,
      generationConfig: {
        maxOutputTokens: 32000,
        temperature: 0.35,
        ...(aiOptions.generationConfig || {}),
      },
      rejectTruncatedJson: true,
      maxParseAttempts: 4,
    },
    'Gerando conteúdo com IA…',
  )

  const validation = validateConteudoCompletoPayload(parsed)
  if (!validation.ok) {
    const err = new Error(`Material incompleto — ${validation.errors.join(' ')}`)
    err.code = 'material_incomplete'
    throw err
  }

  const topicKey = savePlan.topicKey || ''
  const normalized = hydrateConteudoCompletoMaterial(parsed, topicKey)

  await updateJob(userId, jobId, { progress: 85, message: 'Salvando conteúdo…' })

  const sanitizedKey = savePlan.docId || sanitizeTopicKeyForFirestore(topicKey)
  const status =
    savePlan.status ||
    (await resolveTopicoPublishStatus(courseId, topicKey))

  const resultRef = await saveMergeDoc(courseId, 'conteudosCompletos', sanitizedKey, normalized, {
    materia: normalized.materia,
    numero: normalized.numero || topicKey,
    topicKey,
    status,
  })

  return { resultRef, parsed: normalized }
}

async function processQuestoesTopico(userId, jobId, courseId, serverPayload) {
  const { prompt, aiOptions = {}, savePlan = {} } = serverPayload
  await updateJob(userId, jobId, { progress: 15, message: 'Gerando questões com IA…' })

  const parsed = await generateAiJsonWithJobHeartbeat(
    userId,
    jobId,
    prompt,
    {
      useRAG: aiOptions.useRAG ?? true,
      useGoogleSearch: aiOptions.useGoogleSearch ?? true,
      generationConfig: aiOptions.generationConfig,
    },
    'Gerando questões com IA…',
  )

  await updateJob(userId, jobId, { progress: 85, message: 'Salvando questões…' })

  const topicKey = savePlan.topicKey || ''
  const nivel = savePlan.nivel ?? 1
  const sanitizedKey = savePlan.docId || `${sanitizeTopicKeyForFirestore(topicKey)}_nivel_${nivel}`
  const status =
    savePlan.status ||
    (await resolveTopicoPublishStatus(courseId, topicKey))

  const resultRef = await saveMergeDoc(courseId, 'questoesTopico', sanitizedKey, normalizeParsedQuestoes(parsed), {
    topico: parsed.topico || savePlan.topicoNome || topicKey,
    nivel,
    status,
  })

  return { resultRef, parsed }
}

async function processConteudoIncidencia(userId, jobId, courseId, serverPayload) {
  const { prompt, aiOptions = {}, savePlan = {} } = serverPayload
  await updateJob(userId, jobId, { progress: 15, message: 'Gerando conteúdo de incidência…' })

  const parsed = await generateAiJsonWithJobHeartbeat(
    userId,
    jobId,
    prompt,
    {
      useRAG: aiOptions.useRAG ?? true,
      useGoogleSearch: aiOptions.useGoogleSearch ?? true,
      generationConfig: aiOptions.generationConfig,
    },
    'Gerando conteúdo de incidência…',
  )

  await updateJob(userId, jobId, { progress: 85, message: 'Salvando conteúdo…' })

  const docId = savePlan.docId || sanitizeDisciplinaKey(savePlan.disciplinaNome)
  let status = savePlan.status

  if (!status) {
    const existing = await getDb().doc(`courses/${courseId}/conteudosIncidencia/${docId}`).get()
    const prevStatus = existing.exists ? existing.data().status : null
    status =
      prevStatus === CONTENT_STATUS.AVAILABLE || prevStatus === 'disponivel'
        ? CONTENT_STATUS.AVAILABLE
        : CONTENT_STATUS.UNAVAILABLE
  }

  const resultRef = await saveMergeDoc(courseId, 'conteudosIncidencia', docId, parsed, {
    disciplinaIdx: savePlan.disciplinaIdx,
    status,
  })

  return { resultRef, parsed }
}

async function processQuestoesIncidencia(userId, jobId, courseId, serverPayload) {
  const { prompt, aiOptions = {}, savePlan = {} } = serverPayload
  await updateJob(userId, jobId, { progress: 15, message: 'Gerando questões de incidência…' })

  const parsed = await generateAiJsonWithJobHeartbeat(
    userId,
    jobId,
    prompt,
    {
      useRAG: aiOptions.useRAG ?? true,
      useGoogleSearch: aiOptions.useGoogleSearch ?? true,
      generationConfig: aiOptions.generationConfig,
    },
    'Gerando questões de incidência…',
  )

  await updateJob(userId, jobId, { progress: 85, message: 'Salvando questões…' })

  const docId =
    savePlan.docId ||
    `${sanitizeDisciplinaKey(savePlan.disciplinaNome)}_nivel_${savePlan.nivel ?? 1}`

  let status = savePlan.status
  if (!status && savePlan.disciplinaNome) {
    status = await resolveIncidenciaContentStatus(courseId, savePlan.disciplinaNome)
  }
  if (!status) status = CONTENT_STATUS.UNAVAILABLE

  const resultRef = await saveMergeDoc(courseId, 'questoesIncidencia', docId, normalizeParsedQuestoes(parsed), {
    disciplinaIdx: savePlan.disciplinaIdx,
    nivel: savePlan.nivel ?? 1,
    status,
  })

  return { resultRef, parsed }
}

async function processFlashcardsTopico(userId, jobId, courseId, serverPayload) {
  const { aiOptions = {}, savePlan = {} } = serverPayload
  const meta = savePlan.flashcardMeta || {}

  await updateJob(userId, jobId, { progress: 10, message: 'Preparando flashcards…' })

  const normalizedTopicKey = normalizeTopicKeyForStorage(meta.topicKey)
  await deleteExistingFlashcards(courseId, normalizedTopicKey, meta.disciplina, meta.modulo)

  const baseMeta = { ...meta, editalText: meta.editalText || '' }
  let allItems = []

  const firstBatchCount = Math.min(BATCH_SIZE, MAX_FLASHCARDS)
  await updateJob(userId, jobId, { progress: 20, message: 'Gerando flashcards (lote 1)…' })

  const batch1Prompt = buildFlashcardPrompt(baseMeta, 1, 2, firstBatchCount, [])
  const batch1 = await generateAiJsonWithJobHeartbeat(
    userId,
    jobId,
    batch1Prompt,
    {
      generationConfig: {
        maxOutputTokens: 24000,
        temperature: 0.35,
        ...(aiOptions.generationConfig || {}),
      },
    },
    'Gerando flashcards (lote 1)…',
  )
  allItems = dedupeFlashcards(batch1.flashcards || [])

  if (allItems.length < MIN_FLASHCARDS) {
    await updateJob(userId, jobId, { progress: 45, message: 'Gerando flashcards (lote 2)…' })
    const remaining = Math.min(MAX_FLASHCARDS - allItems.length, BATCH_SIZE)
    const batch2Prompt = buildFlashcardPrompt(
      baseMeta,
      2,
      2,
      remaining,
      allItems.map((c) => c.frente || c.pergunta),
    )
    const batch2 = await generateAiJsonWithJobHeartbeat(
      userId,
      jobId,
      batch2Prompt,
      { generationConfig: { maxOutputTokens: 24000, temperature: 0.35 } },
      'Gerando flashcards (lote 2)…',
    )
    allItems = dedupeFlashcards([...allItems, ...(batch2.flashcards || [])])
  }

  if (allItems.length < MIN_FLASHCARDS) {
    await updateJob(userId, jobId, { progress: 65, message: 'Gerando flashcards (lote 3)…' })
    const remaining = Math.min(MAX_FLASHCARDS - allItems.length, BATCH_SIZE)
    const batch3Prompt = buildFlashcardPrompt(
      baseMeta,
      3,
      3,
      remaining,
      allItems.map((c) => c.frente || c.pergunta),
    )
    const batch3 = await generateAiJsonWithJobHeartbeat(
      userId,
      jobId,
      batch3Prompt,
      { generationConfig: { maxOutputTokens: 24000, temperature: 0.35 } },
      'Gerando flashcards (lote 3)…',
    )
    allItems = dedupeFlashcards([...allItems, ...(batch3.flashcards || [])])
  }

  allItems = allItems.slice(0, MAX_FLASHCARDS)

  if (allItems.length < MIN_FLASHCARDS) {
    throw new Error(
      `A IA gerou apenas ${allItems.length} flashcards. São necessários no mínimo ${MIN_FLASHCARDS}.`,
    )
  }

  await updateJob(userId, jobId, { progress: 85, message: 'Salvando flashcards…' })

  const initialStatus =
    savePlan.status || (await resolveTopicoPublishStatus(courseId, normalizedTopicKey))

  const db = getDb()
  const flashcardsRef = db.collection(`courses/${courseId}/flashcards`)
  let batch = db.batch()
  let opCount = 0

  for (let index = 0; index < allItems.length; index += 1) {
    const item = allItems[index]
    const docRef = flashcardsRef.doc()
    const frente = sanitizeFlashcardText(item.frente || item.pergunta || '')
    const verso = sanitizeFlashcardText(item.verso || item.resposta || '')

    batch.set(docRef, {
      disciplina: meta.disciplina,
      materia: meta.disciplina,
      topico: meta.topicoNome,
      topicoNumero: meta.topicoNumero || '',
      modulo: meta.modulo,
      topicKey: normalizedTopicKey,
      frente,
      verso,
      pergunta: frente,
      resposta: verso,
      dificuldade: item.dificuldade || 'médio',
      courseId,
      shared: true,
      status: initialStatus,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      order: index,
    })

    opCount += 1
    if (opCount >= 400) {
      await batch.commit()
      batch = db.batch()
      opCount = 0
    }
  }

  if (opCount > 0) await batch.commit()

  return {
    resultRef: { collection: 'flashcards', count: allItems.length },
    parsed: { count: allItems.length },
  }
}

const { processAdminEditalVerticalizado } = require('./adminEditalProcessor')
const { processGuiaMentoradoAutomation } = require('./guiaMentoradoAutomation')
const { processGuiaMentoradoCronograma } = require('./guiaMentoradoCronograma')
const { processProfessorSupervisor } = require('./professorSupervisor')
const {
  clearResumeQueue,
  touchActiveJob,
  clearActiveJob,
  pauseJobForResume,
  startJobSelfKeepAlive,
} = require('./generationJobResume')
const { tryAcquireServerJobSlot, MAX_CONCURRENT_SERVER_JOBS } = require('./generationJobConcurrency')

const CONCURRENCY_RETRY_MS = 15 * 1000

async function processGenerationJob(userId, jobId, jobData) {
  const db = admin.firestore()
  const jobRef = db.doc(`users/${userId}/generationJobs/${jobId}`)

  // Slot ANTES de marcar running — evita N "running" sem vaga e bypass no resume
  const slot = await tryAcquireServerJobSlot(userId, jobId, jobData.jobType)
  if (!slot.acquired) {
    if (slot.reason === 'limit' || slot.reason === 'backfill_limit') {
      const waitMessage =
        slot.reason === 'backfill_limit'
          ? 'Aguardando outro backfill terminar (1 por vez)…'
          : `Aguardando vaga (${MAX_CONCURRENT_SERVER_JOBS} job por vez no servidor)…`
      await updateJob(userId, jobId, {
        status: 'waiting_timeout',
        message: waitMessage,
      })
      await pauseJobForResume({
        userId,
        jobId,
        courseId: jobData.courseId,
        jobType: jobData.jobType,
        serverPayload: jobData.serverPayload || {},
        resumeFromTopicIndex:
          jobData.resumeState?.resumeFromTopicIndex ??
          jobData.serverPayload?.resumeFromTopicIndex ??
          0,
        topicLabel: jobData.resumeState?.topicLabel || '',
        updateJob: (uid, jid, patch) => updateJob(uid, jid, patch),
        status: 'waiting_timeout',
        waitReason: slot.reason === 'backfill_limit' ? 'backfill_serial' : 'concurrency',
        message: waitMessage,
        retryDelayMs: CONCURRENCY_RETRY_MS,
      })
      return { paused: true, reason: slot.reason }
    }
    return { skipped: true, reason: slot.reason || 'no_slot' }
  }

  if (jobData.status === 'pending') {
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(jobRef)
      if (!snap.exists || snap.data().status !== 'pending') return false
      tx.update(jobRef, {
        status: 'running',
        message: 'Processando no servidor…',
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        progressUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      return true
    })
    if (!claimed) {
      const { releaseServerJobSlot } = require('./generationJobConcurrency')
      await releaseServerJobSlot(jobId)
      return { skipped: true, reason: 'already_claimed' }
    }
  }

  const { courseId, jobType, serverPayload } = jobData
  const noPromptJobs = [
    'flashcards_topico',
    'admin_edital_verticalizado',
    'guia_mentorado_automation',
    'guia_mentorado_cronograma',
    'guia_mentorado_backfill',
    'professor_supervisor',
  ]
  if (!serverPayload?.prompt && !noPromptJobs.includes(jobType)) {
    throw new Error('Payload de geração inválido.')
  }
  if (serverPayload?.prompt != null) {
    const promptLen = String(serverPayload.prompt).length
    if (promptLen < 20) {
      const err = new Error('Prompt de geração inválido ou muito curto.')
      err.code = 'invalid_payload'
      throw err
    }
    // ~200k chars — evita abuso / estouro de contexto
    if (promptLen > 200000) {
      const err = new Error('Prompt de geração excede o tamanho máximo permitido.')
      err.code = 'invalid_payload'
      throw err
    }
  }
  if (jobType === 'flashcards_topico' && !serverPayload?.savePlan?.flashcardMeta) {
    throw new Error('Metadados de flashcards ausentes.')
  }
  if (jobType === 'admin_edital_verticalizado' && !serverPayload?.editalText) {
    throw new Error('Texto do edital ausente.')
  }
  if (jobType === 'guia_mentorado_cronograma' && !serverPayload?.config) {
    throw new Error('Configuração ausente para gerar cronograma do Guia Mentorado.')
  }
  if (jobType === 'guia_mentorado_automation' && !serverPayload?.topics?.length) {
    throw new Error('Lista de tópicos ausente para automação do Guia Mentorado.')
  }
  if (jobType === 'guia_mentorado_backfill' && !serverPayload?.courseId) {
    throw new Error('courseId ausente para backfill do Guia Mentorado.')
  }
  if (jobType === 'professor_supervisor' && !serverPayload?.itemType) {
    throw new Error('Payload ausente para professor fiscalizador.')
  }
  if (jobType === 'vespera_prova' && !serverPayload?.prompt) {
    throw new Error('Prompt ausente para véspera de prova.')
  }
  if (!courseId) {
    throw new Error('courseId ausente no job.')
  }

  // Todos os jobs processados aqui usam Gemini no servidor (custo).
  // Cron/automação já gravam sob users/{adminUid}/generationJobs.
  const userSnap = await db.doc(`users/${userId}`).get()
  const role = userSnap.exists ? userSnap.data()?.role : null
  if (role !== 'admin') {
    throw new Error('Apenas administradores podem executar jobs de geração na nuvem.')
  }

  if (jobType === 'guia_mentorado_automation') {
    const triggeredBy =
      jobData.metadata?.triggeredBy || serverPayload?.triggeredBy || serverPayload?.metadata?.triggeredBy
    if (triggeredBy !== 'daily_cron' && triggeredBy !== 'cronograma') {
      const { loadGuiaMentoradoConfig } = require('./guiaMentoradoDaily')
      const { automation } = await loadGuiaMentoradoConfig(courseId)
      if (!automation.triggers.allowManualDay) {
        throw new Error('Geração manual desabilitada nas configurações do Guia Mentorado.')
      }
    }
  }

  if (jobType === 'guia_mentorado_backfill') {
    const { loadGuiaMentoradoConfig } = require('./guiaMentoradoDaily')
    const { automation } = await loadGuiaMentoradoConfig(courseId)
    if (!automation.triggers.allowBackfill) {
      throw new Error('Backfill desabilitado nas configurações do Guia Mentorado.')
    }
  }

  let stopKeepAlive = () => {}
  try {
    if (jobData.status !== 'pending') {
      await updateJob(userId, jobId, {
        status: 'running',
        progress: 5,
        message: 'Processando no servidor…',
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    } else {
      await updateJob(userId, jobId, {
        progress: 5,
        message: 'Processando no servidor…',
      })
    }
    await touchActiveJob(userId, jobId, { jobType, status: 'running' })
    // Auto-atualiza a cada 15s para não parecer travado / não cair em stall recovery
    stopKeepAlive = startJobSelfKeepAlive(userId, jobId)

    let outcome

    switch (jobType) {
      case 'conteudo_completo':
        outcome = await processConteudoCompleto(userId, jobId, courseId, serverPayload)
        break
      case 'questoes_topico':
        outcome = await processQuestoesTopico(userId, jobId, courseId, serverPayload)
        break
      case 'conteudo_incidencia':
        outcome = await processConteudoIncidencia(userId, jobId, courseId, serverPayload)
        break
      case 'questoes_incidencia':
        outcome = await processQuestoesIncidencia(userId, jobId, courseId, serverPayload)
        break
      case 'flashcards_topico':
        outcome = await processFlashcardsTopico(userId, jobId, courseId, serverPayload)
        break
      case 'vespera_prova': {
        const { processVesperaProva } = require('./vesperaProvaProcessor')
        outcome = await processVesperaProva(userId, jobId, courseId, serverPayload)
        break
      }
      case 'admin_edital_verticalizado':
        outcome = await processAdminEditalVerticalizado(userId, jobId, courseId, serverPayload)
        break
      case 'guia_mentorado_automation':
        outcome = await processGuiaMentoradoAutomation(
          userId,
          jobId,
          courseId,
          serverPayload,
          (uid, jid, patch) => updateJob(uid, jid, patch),
        )
        if (outcome.cancelled) {
          await clearResumeQueue(jobId)
          return outcome
        }
        if (outcome.paused) {
          return outcome
        }
        await clearResumeQueue(jobId)
        // Marca o dia só após sucesso — permite retry no cron se o job falhar antes
        try {
          const targetDate = serverPayload?.targetDate
          if (targetDate) {
            const { markDailyRun } = require('./guiaMentoradoDaily')
            await markDailyRun(courseId, targetDate, { lastError: null })
          }
        } catch (markErr) {
          console.warn('[jobProcessor] markDailyRun:', markErr?.message || markErr)
        }
        await updateJob(userId, jobId, {
          status: 'done',
          progress: 100,
          message: `Dia concluído — ${outcome.publishedCount}/${outcome.totalTopics} tópico(s) liberado(s)`,
          resultRef: null,
          finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        return outcome
      case 'professor_supervisor':
        outcome = await processProfessorSupervisor(
          userId,
          jobId,
          courseId,
          serverPayload,
          (uid, jid, patch) => updateJob(uid, jid, patch),
        )
        if (outcome.cancelled || outcome.paused) {
          return outcome
        }
        await clearResumeQueue(jobId)
        return outcome
      case 'guia_mentorado_cronograma':
        outcome = await processGuiaMentoradoCronograma(
          userId,
          jobId,
          courseId,
          serverPayload,
          (uid, jid, patch) => updateJob(uid, jid, patch),
        )
        await updateJob(userId, jobId, {
          status: 'done',
          progress: 100,
          message: outcome.autoGerarConteudo
            ? `Cronograma pronto (${outcome.totalDays} dias). Conteúdos do dia iniciados.`
            : `Cronograma gerado — ${outcome.totalDays} dias em ${outcome.monthsCount} mês(es).`,
          resultRef: null,
          finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        return outcome
      case 'guia_mentorado_backfill': {
        const { processGuiaMentoradoBackfill } = require('./guiaMentoradoBackfill')
        outcome = await processGuiaMentoradoBackfill(
          userId,
          jobId,
          courseId,
          serverPayload,
          (uid, jid, patch) => updateJob(uid, jid, patch),
        )
        if (outcome.cancelled || outcome.paused) {
          return outcome
        }
        await clearResumeQueue(jobId)
        await updateJob(userId, jobId, {
          status: 'done',
          progress: 100,
          message: `Backfill concluído — ${outcome.daysProcessed || 0} dia(s) processado(s).`,
          resultRef: null,
          finishedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        return outcome
      }
      case 'admin_materia_revisada': {
        const { prompt, aiOptions = {}, savePlan = {} } = serverPayload
        await updateJob(userId, jobId, { progress: 20, message: 'Gerando matéria revisada…' })
        const parsed = await generateAiJsonWithJobHeartbeat(
          userId,
          jobId,
          prompt,
          {
            useRAG: aiOptions.useRAG ?? true,
            generationConfig:
              aiOptions.generationConfig || { maxOutputTokens: 16000, temperature: 0.7 },
          },
          'Gerando matéria revisada…',
        )
        await updateJob(userId, jobId, { progress: 85, message: 'Salvando matéria…' })
        const docId = savePlan.docId || savePlan.materia?.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100)
        const resultRef = await saveMergeDoc(courseId, 'materiasRevisadas', docId, parsed, {
          materia: savePlan.materia,
          status: savePlan.status || 'indisponivel',
        })
        outcome = { resultRef, parsed }
        break
      }
      default:
        throw new Error(`Tipo de job não suportado no servidor: ${jobType}`)
    }

    await updateJob(userId, jobId, {
      status: 'done',
      progress: 100,
      message: 'Concluído',
      resultRef: outcome.resultRef || null,
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    await clearActiveJob(jobId)
    return outcome
  } finally {
    stopKeepAlive()
    // Garante liberação do slot se o job já terminou (done/error/cancelled)
    try {
      const snap = await jobRef.get()
      const status = snap.exists ? snap.data()?.status : null
      if (!status || ['done', 'error', 'cancelled'].includes(status)) {
        await clearActiveJob(jobId)
      }
    } catch {
      /* ignore */
    }
  }
}

module.exports = {
  processGenerationJob,
}
