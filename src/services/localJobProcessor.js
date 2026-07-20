/**
 * Processa jobs de geração na aba do admin (Gemini + Firestore client).
 * Sem Cloud Functions / Firebase Admin.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { generateAiJson } from '../utils/geminiApi'
import { isLikelyLegalDiscipline } from '../utils/contentVerification'
import { buildFlashcardPrompt } from '../utils/unifiedPrompt'
import { buildMentoradoCronogramaPrompt } from '../utils/guiaMentoradoPrompts'
import { DEFAULT_PLANNING_DAYS } from '../constants/guiaMentorado'
import { CONTENT_STATUS } from '../utils/contentStatus'
import {
  normalizeTopicKeyForStorage,
  sanitizeTopicKeyForFirestore,
  toSafeFirestoreDocId,
} from '../utils/topicKeyFirestore'
import { setTopicoPublishStatus } from './topicoPublishService'
import dayjs from 'dayjs'
import {
  FLASHCARD_TARGET,
  FLASHCARD_BATCH_SIZE,
  appendFlashcardBatch,
  finalizeFlashcardsCheckpoint,
  loadFlashcardsByTopicKey,
  legacyAggressiveTopicKey,
  markBundleAuditPassed,
  prepareFlashcardsRun,
  prepareMaterialRun,
  prepareQuestoesRun,
  saveMaterialCheckpoint,
  saveQuestoesCheckpoint,
  setFlashcardsStatus,
} from './localGenerationCheckpoint'
import {
  buildExamFidelityBlock,
  buildExamFidelityInline,
  normalizeExamContext,
  toCourseAiContextShape,
} from '../utils/examFidelityContext'

const TRUSTED_AI = {
  trustedGeneration: true,
  useRAG: false,
  // 1 passagem: gera + Google Search + auto-checagem (máxima economia)
  useGoogleSearch: true,
  verifyContent: false,
  forceAudit: false,
}

/** Tentativas automáticas por tópico (erros temporários da IA) — sem clicar de novo. */
const TOPIC_AUTO_RETRIES = 2
const TOPIC_RETRY_DELAY_MS = 2500
/** Varredura final nos que falharam com erro temporário. */
const DAY_SWEEP_RETRIES = 1

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Erros em que vale retentar do checkpoint (não precisa clicar "Gerar" de novo). */
function isTransientGenerationError(err) {
  const code = String(err?.code || '')
  const msg = String(err?.message || err || '').toLowerCase()
  // legal_audit_failed NÃO é transitório — regenerar queima cota sem resolver interpretação
  return (
    code === 'ai_empty_response' ||
    code === 'ai_json_parse_error' ||
    code === 'ai_blocked' ||
    code === 'ai_generation_error' ||
    code === 'flashcards_invalid' ||
    code === 'questoes_invalid' ||
    code === 'material_incomplete' ||
    msg.includes('não retornou texto') ||
    msg.includes('nao retornou texto') ||
    msg.includes('não retornou resposta') ||
    msg.includes('json') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('429') ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('overloaded') ||
    msg.includes('unavailable')
  )
}

function resolvePlanningEndDate(config = {}) {
  const today = dayjs().startOf('day')
  if (config.dataProva) {
    const prova = dayjs(config.dataProva).startOf('day')
    if (prova.isAfter(today)) return prova
  }
  return today.add(DEFAULT_PLANNING_DAYS, 'day')
}

function sanitizeTopicKey(topicKey = '') {
  return (
    toSafeFirestoreDocId(topicKey) ||
    sanitizeTopicKeyForFirestore(normalizeTopicKeyForStorage(topicKey)) ||
    legacyAggressiveTopicKey(topicKey) ||
    'topic_unknown'
  )
}

function sanitizeDisciplinaKey(name = '') {
  return sanitizeTopicKey(name).toLowerCase() || 'disciplina'
}

async function saveMerge(courseId, collectionName, docId, parsed, extra = {}) {
  const ref = doc(db, 'courses', courseId, collectionName, docId)
  await setDoc(
    ref,
    {
      ...parsed,
      ...extra,
      updatedAt: serverTimestamp(),
      generatedAt: serverTimestamp(),
    },
    { merge: true },
  )
  return { collection: collectionName, docId }
}

/** Só marca como jurídico quando a disciplina realmente é de Direito. */
function resolveLegalFlag(disciplina = '', explicit) {
  if (explicit === true) return true
  if (explicit === false) return false
  return isLikelyLegalDiscipline(disciplina)
}

function buildTrustedOptions(disciplina = '', extra = {}) {
  const isLegal = resolveLegalFlag(disciplina, extra.isLegalContent)
  return {
    ...TRUSTED_AI,
    isLegalContent: isLegal,
    verifyContent: false,
    forceAudit: false,
    useGoogleSearch: true,
    useRAG: false,
    disciplina,
    ...extra,
  }
}

async function processPromptSave(
  courseId,
  serverPayload,
  updateProgress,
  label,
  collectionName,
  docId,
  extra = {},
  { jobId = null } = {},
) {
  const { prompt, aiOptions = {} } = serverPayload
  if (!prompt?.trim()) throw new Error(`Prompt ausente para ${label}.`)
  const disciplina = extra.disciplina || serverPayload?.savePlan?.disciplina || ''
  const topicKey = extra.topicKey || serverPayload?.savePlan?.topicKey || null
  const forceFresh = Boolean(serverPayload?.forceFresh)
  const status = extra.status || 'indisponivel'

  // Checkpoint: material / questões por tópico — não regenera se já existe
  if (topicKey && extra.contentType === 'material') {
    const prep = await prepareMaterialRun({ courseId, topicKey, jobId, forceFresh })
    if (prep.alreadyComplete && prep.existingDraft) {
      await updateProgress(90, `${label} já no checkpoint — pulando API`)
      return {
        resultRef: { collection: collectionName, docId, resumed: true },
        parsed: prep.existingDraft,
        resumed: true,
      }
    }
  }
  if (topicKey && extra.contentType === 'questoes') {
    const nivel = extra.nivel ?? 1
    const prep = await prepareQuestoesRun({
      courseId,
      topicKey,
      jobId,
      nivel,
      forceFresh,
      minCount: 1,
    })
    if (prep.alreadyComplete && prep.existingDraft) {
      await updateProgress(90, `${label} já no checkpoint — pulando API`)
      return {
        resultRef: { collection: collectionName, docId, resumed: true },
        parsed: prep.existingDraft,
        resumed: true,
      }
    }
  }

  const examCtx = normalizeExamContext({
    banca: extra.banca || serverPayload?.savePlan?.banca,
    cargo: extra.cargo || serverPayload?.savePlan?.cargo,
    concursoName: extra.concursoName || serverPayload?.savePlan?.concursoName,
    courseName: extra.courseName || serverPayload?.savePlan?.courseName,
    nivel: extra.nivelCurso || serverPayload?.savePlan?.nivelCurso,
    disciplina,
  })

  await updateProgress(20, `Gerando ${label} (Google Search)…`)
  const parsed = await generateAiJson(prompt, {
    courseId,
    ...buildTrustedOptions(disciplina, {
      isLegalContent: aiOptions.isLegalContent,
      contentType: extra.contentType || aiOptions.contentType || '',
      generationConfig: aiOptions.generationConfig,
      courseContext: toCourseAiContextShape({ ...examCtx, disciplina }),
    }),
  })
  await updateProgress(85, `Salvando ${label} (checkpoint)…`)

  if (topicKey && extra.contentType === 'material') {
    await saveMaterialCheckpoint({
      courseId,
      topicKey,
      jobId,
      parsed,
      extra: { disciplina, topico: extra.topico, ...extra },
      status,
    })
    return { resultRef: { collection: collectionName, docId }, parsed, resumed: false }
  }
  if (topicKey && extra.contentType === 'questoes') {
    await saveQuestoesCheckpoint({
      courseId,
      topicKey,
      jobId,
      nivel: extra.nivel ?? 1,
      parsed,
      extra: { topico: extra.topico, disciplina, ...extra },
      status,
    })
    return { resultRef: { collection: collectionName, docId }, parsed, resumed: false }
  }

  const resultRef = await saveMerge(courseId, collectionName, docId, parsed, extra)
  return { resultRef, parsed, resumed: false }
}

function normalizeCard(card = {}) {
  const pergunta = String(card.pergunta || card.frente || card.front || card.question || '').trim()
  const resposta = String(card.resposta || card.verso || card.back || card.answer || '').trim()
  return {
    pergunta,
    resposta,
    frente: pergunta,
    verso: resposta,
    dificuldade: card.dificuldade || 'médio',
    prioridade: card.prioridade || 'alta',
  }
}

function dedupeCards(cards = []) {
  const seen = new Set()
  return cards.filter((c) => {
    const key = String(c.pergunta || c.frente || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * 30 flashcards em lotes de 10 — checkpoint após CADA lote auditado.
 * Retry retoma do próximo lote sem regastar API nos já salvos.
 */
async function processFlashcardsTopico(
  courseId,
  serverPayload,
  updateProgress,
  { jobId = null } = {},
) {
  const meta = serverPayload?.savePlan?.flashcardMeta || {}
  const status = serverPayload?.savePlan?.status || 'indisponivel'
  const forceFresh = Boolean(serverPayload?.forceFresh)
  const disciplina = meta.disciplina || ''
  const topicKey = meta.topicKey || serverPayload?.savePlan?.topicKey
  const batchCount = Math.ceil(FLASHCARD_TARGET / FLASHCARD_BATCH_SIZE)
  const examCtx = normalizeExamContext(meta)

  if (!topicKey) {
    throw new Error('topicKey ausente — checkpoint de flashcards exige topicKey.')
  }

  const prep = await prepareFlashcardsRun({
    courseId,
    topicKey,
    jobId,
    forceFresh,
  })

  let allCards = dedupeCards((prep.existingItems || []).map(normalizeCard))
  let allIds = [...(prep.existingIds || [])]

  if (prep.alreadyComplete && allCards.length >= FLASHCARD_TARGET - 2) {
    await updateProgress(90, `Flashcards já no checkpoint (${allCards.length}) — pulando API`)
    await finalizeFlashcardsCheckpoint({
      courseId,
      topicKey,
      jobId,
      cardIds: allIds,
      finalStatus: status,
    })
    return {
      resultRef: { collection: 'flashcards', count: allCards.length, ids: allIds, resumed: true },
      parsed: { count: allCards.length, cards: allCards },
      cardIds: allIds,
      cards: allCards,
      resumed: true,
    }
  }

  const startBatch = prep.startBatch || 1
  if (prep.resume && allCards.length > 0) {
    await updateProgress(
      12,
      `Retomando flashcards — lote ${startBatch}/${batchCount} (${allCards.length} já salvos, sem re-gerar)…`,
    )
  } else {
    await updateProgress(10, 'Gerando flashcards em lotes auditados…')
  }

  const basePrompt = await buildFlashcardPrompt(
    courseId,
    disciplina,
    meta.editalText || '',
  )

  for (let batchNum = startBatch; batchNum <= batchCount; batchNum += 1) {
    const remaining = FLASHCARD_TARGET - allCards.length
    if (remaining <= 0) break
    const cardsInBatch = Math.min(FLASHCARD_BATCH_SIZE, remaining)
    const pct = 10 + Math.round((batchNum / batchCount) * 65)
    await updateProgress(
      pct,
      `Flashcards lote ${batchNum}/${batchCount} (${cardsInBatch} cards + Google Search)…`,
    )

    const existingFronts = allCards.map((c) => c.pergunta || c.frente).filter(Boolean)
    const existingList = existingFronts.length
      ? `\nNÃO repita estas frentes:\n${existingFronts
          .slice(0, 40)
          .map((f) => `- ${f}`)
          .join('\n')}`
      : ''

    const topicoNome = meta.topicoNome || meta.topicKey || ''
    const prompt = `${buildExamFidelityBlock(examCtx)}
${basePrompt}

═══ TRAVA DE TÓPICO (OBRIGATÓRIA) ═══
DISCIPLINA: ${disciplina}
TÓPICO EXATO: ${topicoNome}
MÓDULO: ${meta.modulo || ''}
${buildExamFidelityInline(examCtx)}

TAREFA: Criar exatamente ${cardsInBatch} flashcards (lote ${batchNum}/${batchCount} de ${FLASHCARD_TARGET} total).

REGRAS DE OURO (violação = card inválido):
1. CADA card DEVE ser 100% sobre o TÓPICO EXATO acima — nada de assuntos vizinhos ou genéricos da disciplina.
2. Perguntas no estilo da banca ${examCtx.banca} para o cargo ${examCtx.cargo} (${examCtx.concursoName}).
3. Use Google Search. Para cada card pergunte: "isso está certo mesmo?". FALSO → corrija ou omita. Dúvida factual → NÃO inclua.
4. PROIBIDO: "O que é X?" com definição vaga; curiosidades; conteúdo óbvio; misturar outro tópico.
5. Verso: 2–5 frases técnicas, corretas e cobráveis em prova.
6. Prefira menos cards corretos a muitos duvidosos.
${existingList}

Retorne APENAS JSON:
{ "flashcards": [ { "pergunta": "...", "resposta": "..." } ] }`

    const { validateFlashcardBatchOrThrow } = await import('../utils/flashcardQuality')
    const minKeep = Math.max(1, Math.ceil(cardsInBatch * 0.4))
    let batchCards = []

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const parsed = await generateAiJson(
        attempt === 1
          ? prompt
          : `${prompt}\n\nREGENERAÇÃO: o lote anterior foi REJEITADO (vazio/genérico/curto). Gere de novo, 100% no TÓPICO EXATO.`,
        {
          courseId,
          ...buildTrustedOptions(disciplina, {
            contentType: 'flashcards',
            courseContext: toCourseAiContextShape({
              ...examCtx,
              disciplina,
              topicoNome,
            }),
            generationConfig: serverPayload?.aiOptions?.generationConfig || {
              maxOutputTokens: 8192,
              temperature: attempt === 1 ? 0.2 : 0.25,
            },
            auditSoftPassOnFail: true,
          }),
        },
      )

      const rawBatch = dedupeCards(
        (parsed?.flashcards || parsed?.cards || []).map(normalizeCard),
      ).filter((c) => c.pergunta && c.resposta)

      try {
        batchCards = validateFlashcardBatchOrThrow(rawBatch, { topicoNome, disciplina }, { minKeep })
        break
      } catch (qualityErr) {
        if (attempt >= 2) throw qualityErr
        await updateProgress(
          pct,
          `Lote ${batchNum}: qualidade baixa — regenerando (tentativa ${attempt + 1})…`,
        )
      }
    }

    if (batchCards.length < 1) {
      const err = new Error(`Lote ${batchNum} de flashcards vazio após geração.`)
      err.code = 'flashcards_invalid'
      throw err
    }

    // Checkpoint imediato — se cair aqui, o próximo run não re-gera este lote
    const saved = await appendFlashcardBatch({
      courseId,
      jobId,
      meta: { ...meta, topicKey, disciplina },
      batchItems: batchCards,
      batchNum,
      draftStatus: status,
      startOrder: allCards.length,
    })

    allCards = dedupeCards([...allCards, ...batchCards])
    allIds = [...allIds, ...saved.ids]
    await updateProgress(
      pct + 2,
      `Checkpoint: lote ${batchNum} salvo (${allCards.length}/${FLASHCARD_TARGET})`,
    )
  }

  allCards = allCards.slice(0, FLASHCARD_TARGET)
  if (allCards.length < Math.max(5, FLASHCARD_TARGET - 10)) {
    const err = new Error(
      `Flashcards insuficientes: ${allCards.length} (alvo ~${FLASHCARD_TARGET}). Checkpoint mantido — retome o job.`,
    )
    err.code = 'flashcards_invalid'
    throw err
  }

  await updateProgress(85, `Finalizando checkpoint de ${allCards.length} flashcards…`)
  await finalizeFlashcardsCheckpoint({
    courseId,
    topicKey,
    jobId,
    cardIds: allIds,
    finalStatus: status,
  })

  return {
    resultRef: { collection: 'flashcards', count: allCards.length, ids: allIds },
    parsed: { count: allCards.length, cards: allCards },
    cardIds: allIds,
    cards: allCards,
    resumed: Boolean(prep.resume),
  }
}

function dayStatusRef(courseId, targetDate) {
  return doc(db, 'courses', courseId, 'mentoradoAutomation', targetDate)
}

async function initLocalDayStatus(courseId, targetDate, topics, jobId, userId) {
  const ref = dayStatusRef(courseId, targetDate)
  const snap = await getDoc(ref)
  const prevTopics = snap.exists() ? snap.data()?.topics || [] : []
  const prevByKey = new Map(prevTopics.map((t) => [t.topicKey, t]))

  // Preserva progresso de tópicos já feitos — retry não zera o dia
  const mergedTopics = topics.map((t) => {
    const prev = prevByKey.get(t.topicKey)
    if (prev?.status === 'published') {
      return { ...prev, error: null }
    }
    return {
      topicKey: t.topicKey,
      topicoNome: t.topicoNome || t.topicKey,
      disciplina: t.disciplina || '',
      status: prev?.status === 'error' ? 'pending' : prev?.status || 'pending',
      step: prev?.step || 'aguardando',
      flashcards: prev?.flashcards || 'pending',
      material: prev?.material || 'pending',
      questoes: prev?.questoes || 'pending',
      error: prev?.status === 'published' ? null : prev?.error || null,
    }
  })

  await setDoc(
    ref,
    {
      date: targetDate,
      courseId,
      status: 'running',
      totalTopics: topics.length,
      publishedCount: mergedTopics.filter((t) => t.status === 'published').length,
      jobId: jobId || null,
      automationUserId: userId || null,
      topics: mergedTopics,
      reason: null,
      updatedAt: serverTimestamp(),
      ...(snap.exists() ? {} : { startedAt: serverTimestamp() }),
    },
    { merge: true },
  )
}

async function patchLocalTopicStatus(courseId, targetDate, topicKey, patch) {
  const ref = dayStatusRef(courseId, targetDate)
  const snap = await getDoc(ref)
  if (!snap.exists()) return
  const data = snap.data()
  const topics = (data.topics || []).map((t) =>
    t.topicKey === topicKey ? { ...t, ...patch } : t,
  )
  const publishedCount = topics.filter((t) => t.status === 'published').length
  await setDoc(
    ref,
    { topics, publishedCount, updatedAt: serverTimestamp() },
    { merge: true },
  )
}

async function finalizeLocalDayStatus(courseId, targetDate, { errors = [], total = 0 } = {}) {
  const ref = dayStatusRef(courseId, targetDate)
  const snap = await getDoc(ref)
  const topics = snap.exists() ? snap.data().topics || [] : []
  const publishedCount = topics.filter((t) => t.status === 'published').length
  let status = 'done'
  if (publishedCount === 0 && errors.length) status = 'error'
  else if (publishedCount < total) status = 'partial'
  await setDoc(
    ref,
    {
      status,
      publishedCount,
      errors: errors.slice(0, 20),
      finishedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

/**
 * Libera no Edital Verticalizado + assets (mesma lógica do botão Liberar do admin).
 */
async function publishTopicAssets(
  courseId,
  {
    topicKey,
    cardIds = [],
    disciplinaNome = '',
    topicoNome = '',
    moduloLabel = '',
  } = {},
) {
  const available = CONTENT_STATUS.AVAILABLE
  const normalizedTopicKey = normalizeTopicKeyForStorage(topicKey)
  if (!normalizedTopicKey) {
    throw new Error('topicKey ausente na liberação do tópico.')
  }

  // Mesma função do botão "Liberar" no Edital — garante topicoStatus + conteúdo alinhados
  await setTopicoPublishStatus(courseId, normalizedTopicKey, available, {
    disciplinaNome: disciplinaNome || '',
    moduloLabel: moduloLabel || topicoNome || '',
  })

  // Docs gerados com ID legado agressivo (antes da unificação)
  const softId = sanitizeTopicKeyForFirestore(normalizedTopicKey)
  const legacyId = legacyAggressiveTopicKey(normalizedTopicKey)
  if (legacyId && legacyId !== softId) {
    await setDoc(
      doc(db, 'courses', courseId, 'conteudosCompletos', legacyId),
      { status: available, topicKey: normalizedTopicKey, updatedAt: serverTimestamp() },
      { merge: true },
    ).catch(() => {})
    await setDoc(
      doc(db, 'courses', courseId, 'questoesTopico', `${legacyId}_nivel_1`),
      { status: available, topicKey: normalizedTopicKey, updatedAt: serverTimestamp() },
      { merge: true },
    ).catch(() => {})
  }

  // Garante flashcards do job atual (IDs frescos) mesmo se o scan geral falhar
  if (cardIds.length) {
    await setFlashcardsStatus(courseId, cardIds, available)
  }
}

/**
 * Processa 1 tópico (material → questões → FC → publish).
 * Usa checkpoint: etapas já ok não regeram.
 */
async function processSingleMentoradoTopic({
  courseId,
  topic,
  jobId,
  forceFresh,
  autoPublish,
  draftStatus,
  updateProgress,
  pctBase,
  index,
  total,
}) {
  const topicKey = topic.topicKey || topic.topicoNome
  const sanitized = sanitizeTopicKey(topicKey)
  const label = topic.topicoNome || topicKey
  const disciplina = topic.disciplina || topic.flashcardMeta?.disciplina || ''
  const examCtx = normalizeExamContext(topic.examContext || topic.flashcardMeta || {})
  const courseContext = toCourseAiContextShape({
    ...examCtx,
    disciplina,
    topicoNome: topic.topicoNome,
  })

  let materialParsed = null
  let questoesParsed = null
  let fcResult = null

  await patchLocalTopicStatus(courseId, topic._targetDate, topicKey, {
    status: 'generating',
    step: 'material',
    error: null,
  })
  await updateProgress(pctBase, `Tópico ${index + 1}/${total}: ${label} — material (Search)`)

  const matPrep = await prepareMaterialRun({ courseId, topicKey, jobId, forceFresh })
  if (matPrep.alreadyComplete && matPrep.existingDraft) {
    materialParsed = matPrep.existingDraft
    await updateProgress(pctBase + 1, `${label}: material do checkpoint — sem API`)
  } else if (topic.conteudoPrompt) {
    materialParsed = await generateAiJson(topic.conteudoPrompt, {
      courseId,
      ...buildTrustedOptions(disciplina, {
        contentType: 'material',
        courseContext,
        generationConfig: { maxOutputTokens: 32000, temperature: 0.2 },
      }),
    })
    await saveMaterialCheckpoint({
      courseId,
      topicKey,
      jobId,
      parsed: materialParsed,
      extra: {
        disciplina: topic.disciplina,
        topico: topic.topicoNome,
        banca: examCtx.banca,
        cargo: examCtx.cargo,
        concurso: examCtx.concursoName,
      },
      status: draftStatus,
    })
  } else {
    throw new Error('Prompt de material ausente — tópico não publicado.')
  }
  await patchLocalTopicStatus(courseId, topic._targetDate, topicKey, {
    material: 'done',
    step: 'questoes',
  })

  await updateProgress(pctBase + 3, `Tópico ${index + 1}/${total}: ${label} — questões (Search)`)
  const qPrep = await prepareQuestoesRun({
    courseId,
    topicKey,
    jobId,
    nivel: 1,
    forceFresh,
    minCount: 1,
  })
  if (qPrep.alreadyComplete && qPrep.existingDraft) {
    questoesParsed = qPrep.existingDraft
    await updateProgress(pctBase + 4, `${label}: questões do checkpoint — sem API`)
  } else if (topic.questoesPrompt) {
    questoesParsed = await generateAiJson(topic.questoesPrompt, {
      courseId,
      ...buildTrustedOptions(disciplina, {
        contentType: 'questoes',
        courseContext,
        generationConfig: { maxOutputTokens: 32000, temperature: 0.2 },
      }),
    })
    await saveQuestoesCheckpoint({
      courseId,
      topicKey,
      jobId,
      nivel: 1,
      parsed: questoesParsed,
      extra: {
        topico: topic.topicoNome,
        disciplina,
        banca: examCtx.banca,
        cargo: examCtx.cargo,
        concurso: examCtx.concursoName,
      },
      status: draftStatus,
    })
  } else {
    throw new Error('Prompt de questões ausente — tópico não publicado.')
  }
  await patchLocalTopicStatus(courseId, topic._targetDate, topicKey, {
    questoes: 'done',
    step: 'flashcards',
  })

  await updateProgress(pctBase + 6, `Tópico ${index + 1}/${total}: ${label} — flashcards (Search)`)
  if (topic.flashcardMeta) {
    fcResult = await processFlashcardsTopico(
      courseId,
      {
        forceFresh,
        savePlan: {
          flashcardMeta: {
            ...topic.flashcardMeta,
            ...examCtx,
            topicKey,
            disciplina,
          },
          status: draftStatus,
          topicKey,
        },
      },
      async (p, msg) =>
        updateProgress(Math.min(pctBase + 6 + Math.round((p || 0) / 20), pctBase + 12), msg),
      { jobId },
    )
  } else {
    throw new Error('Meta de flashcards ausente — tópico não publicado.')
  }

  await patchLocalTopicStatus(courseId, topic._targetDate, topicKey, {
    flashcards: 'done',
    step: 'publicando',
  })

  await markBundleAuditPassed(courseId, topicKey, jobId)

  // Sempre libera no Edital ao concluir (LIBERADO no mentorado = Liberar no edital)
  if (autoPublish !== false) {
    await updateProgress(pctBase + 11, `${label}: liberando no Edital…`)
    await publishTopicAssets(courseId, {
      topicKey,
      cardIds: fcResult?.cardIds || [],
      disciplinaNome: disciplina,
      topicoNome: topic.topicoNome || label,
      moduloLabel: topic.modulo || topic.flashcardMeta?.modulo || topic.topicoNome || label,
    })
  }

  await patchLocalTopicStatus(courseId, topic._targetDate, topicKey, {
    status: 'published',
    step: 'concluído',
    flashcards: 'done',
    material: 'done',
    questoes: 'done',
    error: null,
  })

  return { topicKey, published: true }
}

/**
 * Tenta um tópico com retentativas automáticas (checkpoint).
 * Ex.: "A IA não retornou texto" → espera → continua do que já salvou.
 */
async function runTopicWithAutoRetry(ctx) {
  const { courseId, topic, updateProgress, pctBase, label } = ctx
  const topicKey = topic.topicKey || topic.topicoNome
  let lastErr = null

  for (let attempt = 1; attempt <= TOPIC_AUTO_RETRIES; attempt += 1) {
    try {
      if (attempt > 1) {
        await patchLocalTopicStatus(courseId, topic._targetDate, topicKey, {
          status: 'generating',
          step: 'retentando',
          error: `Retentativa automática ${attempt}/${TOPIC_AUTO_RETRIES}: ${lastErr?.message || ''}`,
        })
        await updateProgress(
          pctBase + 12,
          `${label}: IA falhou (“${lastErr?.message || 'erro'}”) — retentando ${attempt}/${TOPIC_AUTO_RETRIES} do checkpoint…`,
        )
        await sleep(TOPIC_RETRY_DELAY_MS * Math.min(attempt, 3))
      }
      // Retentativa NUNCA usa forceFresh — sempre retoma checkpoint
      await processSingleMentoradoTopic({
        ...ctx,
        forceFresh: attempt === 1 ? ctx.forceFresh : false,
      })
      return { ok: true, topicKey }
    } catch (err) {
      lastErr = err
      const transient = isTransientGenerationError(err)
      console.warn(
        `[localJob] ${topicKey} tentativa ${attempt}/${TOPIC_AUTO_RETRIES}:`,
        err?.message || err,
        transient ? '(retentará)' : '(definitivo)',
      )
      if (!transient || attempt >= TOPIC_AUTO_RETRIES) {
        break
      }
    }
  }

  const message = lastErr?.message || String(lastErr)
  await patchLocalTopicStatus(courseId, topic._targetDate, topicKey, {
    status: 'error',
    step: 'aguardando',
    error: message,
  }).catch(() => {})
  await updateProgress(
    pctBase + 12,
    `${label}: ainda com erro após ${TOPIC_AUTO_RETRIES} tentativas — checkpoint salvo`,
  )
  return {
    ok: false,
    topicKey,
    error: message,
    code: lastErr?.code || null,
    transient: isTransientGenerationError(lastErr),
  }
}

/**
 * Gera material + questões + FC como rascunho (indisponível).
 * Checkpoint + retentativa automática em erros temporários da IA (sem clicar de novo).
 */
async function processGuiaMentoradoDay(courseId, serverPayload, updateProgress, { userId, jobId } = {}) {
  const topics = serverPayload?.topics || []
  if (!topics.length) throw new Error('Lista de tópicos ausente.')
  const targetDate = serverPayload?.targetDate
  if (!targetDate) throw new Error('Data do dia ausente.')

  const autoPublish = serverPayload?.autoPublish !== false
  const forceFresh = Boolean(serverPayload?.forceFresh)
  const draftStatus = 'indisponivel'
  const errors = []
  let done = 0

  await initLocalDayStatus(courseId, targetDate, topics, jobId, userId)
  await updateProgress(
    8,
    `Gerando ${topics.length} tópico(s) do dia ${targetDate} (checkpoint + auto-retry)…`,
  )

  const daySnap = await getDoc(dayStatusRef(courseId, targetDate))
  const dayTopics = daySnap.exists() ? daySnap.data()?.topics || [] : []
  const dayByKey = new Map(dayTopics.map((t) => [t.topicKey, t]))

  const topicStates = topics.map((t, i) => ({
    topic: { ...t, _targetDate: targetDate },
    index: i,
    topicKey: t.topicKey || t.topicoNome,
  }))

  async function runTopicEntry(entry, useForceFresh) {
    const label = entry.topic.topicoNome || entry.topicKey
    const pctBase = Math.round((entry.index / topics.length) * 90) + 8
    const prev = dayByKey.get(entry.topicKey)
    if (prev?.status === 'published' && !useForceFresh) {
      // Repara: LIBERADO no mentorado sem botão Bloquear no Edital
      try {
        await publishTopicAssets(courseId, {
          topicKey: entry.topicKey,
          disciplinaNome: entry.topic.disciplina || '',
          topicoNome: entry.topic.topicoNome || label,
          moduloLabel: entry.topic.modulo || entry.topic.topicoNome || label,
        })
      } catch (repairErr) {
        console.warn('[localJob] reparo de liberação no Edital:', repairErr?.message)
      }
      await updateProgress(pctBase + 12, `${label} já publicado — liberação sincronizada no Edital`)
      return { ok: true, topicKey: entry.topicKey, skipped: true }
    }
    return runTopicWithAutoRetry({
      courseId,
      topic: entry.topic,
      jobId,
      forceFresh: useForceFresh,
      autoPublish,
      draftStatus,
      updateProgress,
      pctBase,
      label,
      index: entry.index,
      total: topics.length,
    })
  }

  for (const entry of topicStates) {
    const result = await runTopicEntry(entry, forceFresh)
    if (result.ok) {
      done += 1
      dayByKey.set(entry.topicKey, { status: 'published' })
    } else {
      errors.push({
        topicKey: result.topicKey,
        error: result.error,
        code: result.code || null,
        transient: Boolean(result.transient),
      })
    }
  }

  // Varredura automática: tópicos com erro temporário sem clicar de novo
  for (let sweep = 1; sweep <= DAY_SWEEP_RETRIES; sweep += 1) {
    const pending = errors.filter((e) => e.transient)
    if (!pending.length) break

    await updateProgress(
      92,
      `Retentativa automática do dia (${sweep}/${DAY_SWEEP_RETRIES}): ${pending.length} tópico(s) do checkpoint…`,
    )
    await sleep(TOPIC_RETRY_DELAY_MS * 2)

    const stillErrors = []
    for (const errItem of errors) {
      if (!errItem.transient) {
        stillErrors.push(errItem)
        continue
      }
      const entry = topicStates.find((t) => t.topicKey === errItem.topicKey)
      if (!entry) {
        stillErrors.push(errItem)
        continue
      }
      const result = await runTopicEntry(entry, false)
      if (result.ok) {
        done += 1
        dayByKey.set(entry.topicKey, { status: 'published' })
      } else {
        stillErrors.push({
          topicKey: result.topicKey,
          error: result.error,
          code: result.code || null,
          transient: Boolean(result.transient),
        })
      }
    }
    errors.length = 0
    errors.push(...stillErrors)
  }

  await finalizeLocalDayStatus(courseId, targetDate, { errors, total: topics.length })

  try {
    const todayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
    }).format(new Date())
    if (targetDate === todayKey) {
      await setDoc(
        doc(db, 'courses', courseId, 'config', 'guiaMentorado'),
        {
          automation: {
            lastDailyRunDayKey: todayKey,
            lastDailyRunAt: serverTimestamp(),
            lastError: errors.length ? errors[0]?.error || 'partial' : null,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    }
  } catch {
    /* ignore */
  }

  await updateProgress(
    95,
    `Concluído — ${done}/${topics.length} tópico(s) (auto-retry + checkpoint)`,
  )
  return { publishedCount: done, totalTopics: topics.length, errors }
}

async function collectCronogramaDayKeysLocal(courseId, endDate) {
  const cronogramaSnap = await getDocs(collection(db, 'courses', courseId, 'cronograma'))
  const dayKeys = []
  for (const monthDoc of cronogramaSnap.docs) {
    const days = monthDoc.data().days || {}
    for (const [dateKey, entry] of Object.entries(days)) {
      if (dateKey > endDate) continue
      const tipo = entry.type || entry.tipo || 'estudo'
      if (tipo === 'simulado' || tipo === 'descanso') continue
      dayKeys.push(dateKey)
    }
  }
  return [...new Set(dayKeys)].sort()
}

async function isMentoradoDayFullyDone(courseId, dayKey) {
  const snap = await getDoc(doc(db, 'courses', courseId, 'mentoradoAutomation', dayKey))
  if (!snap.exists()) return false
  const data = snap.data()
  if (data.status === 'done') return true
  const total = Number(data.totalTopics) || 0
  const published = Number(data.publishedCount) || 0
  return total > 0 && published >= total
}

/**
 * Backfill local: percorre dayKeys e gera cada dia (checkpoint + auto-retry).
 * Mantém a aba do admin aberta.
 */
async function processGuiaMentoradoBackfill(
  courseId,
  serverPayload,
  updateProgress,
  { userId, jobId } = {},
) {
  const todayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date())

  const dayKeys = Array.isArray(serverPayload?.dayKeys) && serverPayload.dayKeys.length
    ? [...serverPayload.dayKeys].sort()
    : await collectCronogramaDayKeysLocal(courseId, todayKey)

  if (!dayKeys.length) {
    throw new Error('Nenhum dia de estudo encontrado no cronograma até hoje.')
  }

  const startDayIndex = Math.max(0, Number(serverPayload?.resumeFromDayIndex) || 0)
  const autoPublish = serverPayload?.autoPublish !== false
  const totalDays = dayKeys.length
  let processed = 0
  let skipped = 0
  const dayErrors = []

  await updateProgress(2, `Backfill: ${totalDays} dia(s) no cronograma (a partir do ${startDayIndex + 1})…`)

  // Import dinâmico evita ciclo com aiGenerationRunner
  const { prepareMentoradoDayAutomation } = await import('./guiaMentoradoAutomationService')

  for (let i = startDayIndex; i < dayKeys.length; i += 1) {
    const dayKey = dayKeys[i]
    const pctBase = Math.round((i / totalDays) * 92) + 3

    if (await isMentoradoDayFullyDone(courseId, dayKey)) {
      skipped += 1
      await updateProgress(pctBase, `${dayKey}: já completo — pulando (${i + 1}/${totalDays})`)
      continue
    }

    await updateProgress(pctBase, `Gerando dia ${dayKey} (${i + 1}/${totalDays})…`)

    const prepared = await prepareMentoradoDayAutomation({
      courseId,
      targetDate: dayKey,
      autoPublish,
    })

    if (!prepared.ok) {
      if (prepared.reason === 'skip_day_type' || prepared.reason === 'no_topics') {
        skipped += 1
        await updateProgress(pctBase + 1, `${dayKey}: sem conteúdo — pulando`)
        continue
      }
      if (prepared.reason === 'missing_edital') {
        throw new Error('Edital não encontrado. Gere o edital verticalizado primeiro.')
      }
      dayErrors.push({ dayKey, error: prepared.reason || 'prepare_failed' })
      continue
    }

    try {
      const dayResult = await processGuiaMentoradoDay(
        courseId,
        {
          topics: prepared.topics,
          targetDate: dayKey,
          autoPublish,
          forceFresh: false,
        },
        async (p, msg) => {
          const mapped = pctBase + Math.round(((p || 0) / 100) * Math.max(1, Math.round(92 / totalDays) - 1))
          await updateProgress(Math.min(mapped, 94), `[${dayKey}] ${msg || ''}`)
        },
        { userId, jobId },
      )
      processed += 1
      if (dayResult?.errors?.length) {
        dayErrors.push(
          ...dayResult.errors.map((e) => ({
            dayKey,
            topicKey: e.topicKey,
            error: e.error,
          })),
        )
      }
    } catch (err) {
      const message = err?.message || String(err)
      console.error(`[localJob] backfill dia ${dayKey}:`, message)
      dayErrors.push({ dayKey, error: message })
      await updateProgress(pctBase + 2, `${dayKey}: erro — ${message.slice(0, 120)}`)
    }
  }

  await updateProgress(
    96,
    `Backfill concluído — ${processed} dia(s) gerado(s), ${skipped} pulado(s)${
      dayErrors.length ? `, ${dayErrors.length} aviso(s)` : ''
    }`,
  )

  return {
    daysProcessed: processed,
    daysSkipped: skipped,
    totalDays,
    courseId,
    errors: dayErrors,
  }
}

async function processGuiaMentoradoCronograma(courseId, serverPayload, updateProgress) {
  const config = serverPayload?.config || {}
  await updateProgress(10, 'Gerando cronograma…')

  const today = dayjs().startOf('day')
  const planningEnd = resolvePlanningEndDate(config)
  const editalSnap = await getDoc(doc(db, 'courses', courseId, 'editalVerticalizado', 'atual')).catch(() => null)
  let editalSummary = []
  if (editalSnap?.exists()) {
    editalSummary = editalSnap.data()?.materias || editalSnap.data()?.edital || []
  }

  const prompt = buildMentoradoCronogramaPrompt({
    today,
    planningEnd,
    config,
    editalSummary,
    usingDefaultWindow: !config.dataProva,
  })

  const parsed = await generateAiJson(prompt, {
    courseId,
    trustedGeneration: true,
    generationConfig: { maxOutputTokens: 32000, temperature: 0.3 },
  })

  const days = parsed?.cronograma || []
  await updateProgress(70, `Salvando ${days.length} dias…`)

  const byMonth = {}
  for (const day of days) {
    const date = day.data
    if (!date) continue
    const monthKey = date.slice(0, 7)
    if (!byMonth[monthKey]) byMonth[monthKey] = { days: {} }
    byMonth[monthKey].days[date] = {
      type: day.tipo || 'estudo',
      tipo: day.tipo || 'estudo',
      fase: day.fase || '',
      materias: day.materias || [],
      taf_exercicio: day.taf_exercicio || '',
      descricao: day.descricao || '',
    }
  }

  for (const [monthKey, data] of Object.entries(byMonth)) {
    const ref = doc(db, 'courses', courseId, 'cronograma', monthKey)
    const existing = await getDoc(ref)
    const prevDays = existing.exists() ? existing.data()?.days || {} : {}
    await setDoc(
      ref,
      {
        days: { ...prevDays, ...data.days },
        updatedAt: serverTimestamp(),
        generatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  }

  await setDoc(
    doc(db, 'courses', courseId, 'guiaMentorado', 'config'),
    { ...(config || {}), updatedAt: serverTimestamp() },
    { merge: true },
  )

  return {
    totalDays: days.length,
    monthsCount: Object.keys(byMonth).length,
    autoGerarConteudo: Boolean(config?.autoGerarConteudo),
  }
}

async function processAdminEdital(courseId, serverPayload, updateProgress) {
  const editalText = serverPayload?.editalText || ''
  if (!editalText.trim()) throw new Error('Texto do edital ausente.')
  await updateProgress(15, 'Estruturando edital verticalizado…')

  const prompt = `Transforme o edital abaixo em JSON verticalizado para concurso.

EDITAL:
${editalText.slice(0, 120000)}

Retorne APENAS JSON:
{
  "materias": [
    {
      "nome": "Nome da matéria",
      "topicos": [
        { "numero": "1.1", "nome": "Nome do tópico" }
      ]
    }
  ]
}`

  const parsed = await generateAiJson(prompt, {
    courseId,
    trustedGeneration: true,
    generationConfig: { maxOutputTokens: 32000, temperature: 0.2 },
  })

  await updateProgress(85, 'Salvando edital…')
  await setDoc(
    doc(db, 'courses', courseId, 'editalVerticalizado', 'atual'),
    {
      ...parsed,
      rawText: editalText.slice(0, 50000),
      updatedAt: serverTimestamp(),
      generatedAt: serverTimestamp(),
    },
    { merge: true },
  )
  await setDoc(
    doc(db, 'courses', courseId, 'prompts', 'edital'),
    { pdfText: editalText, prompt: editalText.slice(0, 20000), updatedAt: serverTimestamp() },
    { merge: true },
  )
  return { resultRef: { collection: 'editalVerticalizado', docId: 'atual' }, parsed }
}

/**
 * Executa o payload que antes ia para Cloud Functions — agora no browser.
 */
export async function processLocalGenerationJob({
  jobType,
  courseId,
  serverPayload = {},
  updateProgress = async () => {},
  userId = null,
  jobId = null,
}) {
  if (!courseId) throw new Error('courseId ausente.')
  if (!jobType) throw new Error('jobType ausente.')

  switch (jobType) {
    case 'conteudo_completo': {
      const topicKey = serverPayload.savePlan?.topicKey || ''
      const docId = sanitizeTopicKey(topicKey)
      return processPromptSave(
        courseId,
        serverPayload,
        updateProgress,
        'conteúdo',
        'conteudosCompletos',
        docId,
        {
          topicKey,
          disciplina: serverPayload.savePlan?.disciplina || '',
          contentType: 'material',
          status: serverPayload.savePlan?.status || 'indisponivel',
        },
        { jobId },
      )
    }
    case 'questoes_topico': {
      const topicKey = serverPayload.savePlan?.topicKey || ''
      const nivel = serverPayload.savePlan?.nivel ?? 1
      const docId = `${sanitizeTopicKey(topicKey)}_nivel_${nivel}`
      return processPromptSave(
        courseId,
        serverPayload,
        updateProgress,
        'questões',
        'questoesTopico',
        docId,
        {
          topicKey,
          topico: serverPayload.savePlan?.topicoNome || topicKey,
          nivel,
          disciplina: serverPayload.savePlan?.disciplina || '',
          contentType: 'questoes',
          status: serverPayload.savePlan?.status || 'indisponivel',
        },
        { jobId },
      )
    }
    case 'conteudo_incidencia': {
      const docId =
        serverPayload.savePlan?.docId ||
        sanitizeDisciplinaKey(serverPayload.savePlan?.disciplinaNome)
      return processPromptSave(
        courseId,
        serverPayload,
        updateProgress,
        'conteúdo de incidência',
        'conteudosIncidencia',
        docId,
        {
          disciplinaIdx: serverPayload.savePlan?.disciplinaIdx,
          status: serverPayload.savePlan?.status || 'indisponivel',
        },
      )
    }
    case 'questoes_incidencia': {
      const nivel = serverPayload.savePlan?.nivel ?? 1
      const docId =
        serverPayload.savePlan?.docId ||
        `${sanitizeDisciplinaKey(serverPayload.savePlan?.disciplinaNome)}_nivel_${nivel}`
      return processPromptSave(
        courseId,
        serverPayload,
        updateProgress,
        'questões de incidência',
        'questoesIncidencia',
        docId,
        {
          disciplinaIdx: serverPayload.savePlan?.disciplinaIdx,
          nivel,
          status: serverPayload.savePlan?.status || 'indisponivel',
        },
      )
    }
    case 'admin_materia_revisada': {
      const materia = serverPayload.savePlan?.materia || 'materia'
      const docId =
        serverPayload.savePlan?.docId ||
        String(materia)
          .replace(/[^a-zA-Z0-9À-ÿ_-]+/g, '_')
          .substring(0, 100)
      return processPromptSave(
        courseId,
        serverPayload,
        updateProgress,
        'matéria revisada',
        'materiasRevisadas',
        docId,
        {
          materia,
          status: serverPayload.savePlan?.status || 'indisponivel',
        },
      )
    }
    case 'flashcards_topico':
      return processFlashcardsTopico(courseId, serverPayload, updateProgress, { jobId })
    case 'guia_mentorado_automation':
      return processGuiaMentoradoDay(courseId, serverPayload, updateProgress, { userId, jobId })
    case 'guia_mentorado_cronograma':
      return processGuiaMentoradoCronograma(courseId, serverPayload, updateProgress)
    case 'guia_mentorado_backfill': {
      if (serverPayload?.topics?.length && serverPayload?.targetDate) {
        return processGuiaMentoradoDay(courseId, serverPayload, updateProgress, { userId, jobId })
      }
      return processGuiaMentoradoBackfill(courseId, serverPayload, updateProgress, {
        userId,
        jobId,
      })
    }
    case 'admin_edital_verticalizado':
      return processAdminEdital(courseId, serverPayload, updateProgress)
    case 'vespera_prova': {
      const docId = serverPayload.savePlan?.docId || `vespera_${Date.now()}`
      return processPromptSave(
        courseId,
        serverPayload,
        updateProgress,
        'véspera de prova',
        'vesperaProva',
        docId,
        serverPayload.savePlan || {},
      )
    }
    case 'professor_supervisor': {
      const { processProfessorFlagLocal } = await import('./localProfessorFlagProcessor')
      if (serverPayload?.itemType === 'flag' || serverPayload?.payload?.flagId) {
        return processProfessorFlagLocal({
          courseId,
          payload: serverPayload.payload || serverPayload,
          updateProgress,
        })
      }
      throw new Error('Professor IA local: apenas sinalizações da Moderação por enquanto.')
    }
    default:
      throw new Error(`Tipo de job não suportado no modo local: ${jobType}`)
  }
}
