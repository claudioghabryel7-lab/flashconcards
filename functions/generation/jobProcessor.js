const admin = require('firebase-admin')
const { generateAiJson } = require('./geminiServer')
const {
  sanitizeTopicKeyForFirestore,
  normalizeTopicKeyForStorage,
  sanitizeDisciplinaKey,
} = require('./topicKeyUtils')

const CONTENT_STATUS = {
  AVAILABLE: 'disponivel',
  UNAVAILABLE: 'indisponivel',
}

const MIN_FLASHCARDS = 40
const MAX_FLASHCARDS = 60
const BATCH_SIZE = 30

function getDb() {
  return admin.firestore()
}

async function updateJob(userId, jobId, patch) {
  await getDb()
    .doc(`users/${userId}/generationJobs/${jobId}`)
    .update({
      ...patch,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
}

async function resolveTopicoPublishStatus(courseId, topicKey) {
  const sanitized = sanitizeTopicKeyForFirestore(topicKey)
  if (!sanitized) return CONTENT_STATUS.UNAVAILABLE

  const snap = await getDb().doc(`courses/${courseId}/topicoStatus/${sanitized}`).get()
  if (snap.exists() && snap.data().status === CONTENT_STATUS.AVAILABLE) {
    return CONTENT_STATUS.AVAILABLE
  }
  return CONTENT_STATUS.UNAVAILABLE
}

async function resolveIncidenciaContentStatus(courseId, disciplinaNome) {
  const key = sanitizeDisciplinaKey(disciplinaNome)
  const snap = await getDb().doc(`courses/${courseId}/conteudosIncidencia/${key}`).get()
  if (snap.exists()) {
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
- Sem markdown nos textos
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
  await updateJob(userId, jobId, { progress: 15, message: 'Gerando conteúdo com IA…' })

  const parsed = await generateAiJson(prompt, {
    useRAG: aiOptions.useRAG ?? true,
    useGoogleSearch: aiOptions.useGoogleSearch ?? true,
    generationConfig: {
      maxOutputTokens: 32000,
      temperature: 0.35,
      ...(aiOptions.generationConfig || {}),
    },
  })

  await updateJob(userId, jobId, { progress: 85, message: 'Salvando conteúdo…' })

  const topicKey = savePlan.topicKey || ''
  const sanitizedKey = savePlan.docId || sanitizeTopicKeyForFirestore(topicKey)
  const status =
    savePlan.status ||
    (await resolveTopicoPublishStatus(courseId, topicKey))

  const resultRef = await saveMergeDoc(courseId, 'conteudosCompletos', sanitizedKey, parsed, {
    materia: parsed.materia || parsed.titulo || topicKey,
    numero: parsed.numero || topicKey,
    topicKey,
    status,
  })

  return { resultRef, parsed }
}

async function processQuestoesTopico(userId, jobId, courseId, serverPayload) {
  const { prompt, aiOptions = {}, savePlan = {} } = serverPayload
  await updateJob(userId, jobId, { progress: 15, message: 'Gerando questões com IA…' })

  const parsed = await generateAiJson(prompt, {
    useRAG: aiOptions.useRAG ?? true,
    useGoogleSearch: aiOptions.useGoogleSearch ?? true,
    generationConfig: aiOptions.generationConfig,
  })

  await updateJob(userId, jobId, { progress: 85, message: 'Salvando questões…' })

  const topicKey = savePlan.topicKey || ''
  const nivel = savePlan.nivel ?? 1
  const sanitizedKey = savePlan.docId || `${sanitizeTopicKeyForFirestore(topicKey)}_nivel_${nivel}`
  const status =
    savePlan.status ||
    (await resolveTopicoPublishStatus(courseId, topicKey))

  const resultRef = await saveMergeDoc(courseId, 'questoesTopico', sanitizedKey, parsed, {
    topico: parsed.topico || savePlan.topicoNome || topicKey,
    nivel,
    status,
  })

  return { resultRef, parsed }
}

async function processConteudoIncidencia(userId, jobId, courseId, serverPayload) {
  const { prompt, aiOptions = {}, savePlan = {} } = serverPayload
  await updateJob(userId, jobId, { progress: 15, message: 'Gerando conteúdo de incidência…' })

  const parsed = await generateAiJson(prompt, {
    useRAG: aiOptions.useRAG ?? true,
    useGoogleSearch: aiOptions.useGoogleSearch ?? true,
    generationConfig: aiOptions.generationConfig,
  })

  await updateJob(userId, jobId, { progress: 85, message: 'Salvando conteúdo…' })

  const docId = savePlan.docId || sanitizeDisciplinaKey(savePlan.disciplinaNome)
  let status = savePlan.status

  if (!status) {
    const existing = await getDb().doc(`courses/${courseId}/conteudosIncidencia/${docId}`).get()
    const prevStatus = existing.exists() ? existing.data().status : null
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

  const parsed = await generateAiJson(prompt, {
    useRAG: aiOptions.useRAG ?? true,
    useGoogleSearch: aiOptions.useGoogleSearch ?? true,
    generationConfig: aiOptions.generationConfig,
  })

  await updateJob(userId, jobId, { progress: 85, message: 'Salvando questões…' })

  const docId =
    savePlan.docId ||
    `${sanitizeDisciplinaKey(savePlan.disciplinaNome)}_nivel_${savePlan.nivel ?? 1}`

  let status = savePlan.status
  if (!status && savePlan.disciplinaNome) {
    status = await resolveIncidenciaContentStatus(courseId, savePlan.disciplinaNome)
  }
  if (!status) status = CONTENT_STATUS.UNAVAILABLE

  const resultRef = await saveMergeDoc(courseId, 'questoesIncidencia', docId, parsed, {
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
  const batch1 = await generateAiJson(batch1Prompt, {
    generationConfig: { maxOutputTokens: 24000, temperature: 0.35, ...(aiOptions.generationConfig || {}) },
  })
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
    const batch2 = await generateAiJson(batch2Prompt, {
      generationConfig: { maxOutputTokens: 24000, temperature: 0.35 },
    })
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
    const batch3 = await generateAiJson(batch3Prompt, {
      generationConfig: { maxOutputTokens: 24000, temperature: 0.35 },
    })
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
    const frente = item.frente || item.pergunta || ''
    const verso = item.verso || item.resposta || ''

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

async function processGenerationJob(userId, jobId, jobData) {
  const { courseId, jobType, serverPayload } = jobData
  const noPromptJobs = [
    'flashcards_topico',
    'admin_edital_verticalizado',
    'guia_mentorado_automation',
    'guia_mentorado_cronograma',
  ]
  if (!serverPayload?.prompt && !noPromptJobs.includes(jobType)) {
    throw new Error('Payload de geração inválido.')
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
  if (!courseId) {
    throw new Error('courseId ausente no job.')
  }

  await updateJob(userId, jobId, {
    status: 'running',
    progress: 5,
    message: 'Processando no servidor…',
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
  })

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
      await updateJob(userId, jobId, {
        status: 'done',
        progress: 100,
        message:
          outcome.errors?.length > 0
            ? `Concluído com ${outcome.errors.length} aviso(s) em alguns tópicos`
            : `Automação concluída — ${outcome.totalTopics} tópico(s) processado(s)`,
        resultRef: null,
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
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
    case 'admin_materia_revisada': {
      const { prompt, aiOptions = {}, savePlan = {} } = serverPayload
      await updateJob(userId, jobId, { progress: 20, message: 'Gerando matéria revisada…' })
      const parsed = await generateAiJson(prompt, {
        useRAG: aiOptions.useRAG ?? true,
        generationConfig: aiOptions.generationConfig || { maxOutputTokens: 16000, temperature: 0.7 },
      })
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

  return outcome
}

module.exports = {
  processGenerationJob,
}
