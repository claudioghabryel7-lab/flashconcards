/**
 * Processa jobs de geração na aba do admin (Gemini + Firestore client).
 * Sem Cloud Functions / Firebase Admin.
 */
import {
  collection,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase/config'
import { generateAiJson } from '../utils/geminiApi'
import { generateQuestoesInBatches } from '../utils/questoesGeneration'
import { isLikelyLegalDiscipline } from '../utils/contentVerification'
import {
  attachNormalizedIllustration,
  appendVisualMediaAppendix,
} from '../utils/stemVisualContent'
import { buildFlashcardPrompt } from '../utils/unifiedPrompt'
import { buildFlashcardMaterialAnchor } from '../utils/materialSpeechText'
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
  FLASHCARD_MIN_COMPLETE,
  QUESTOES_TARGET,
  QUESTOES_BATCH_SIZE,
  QUESTOES_MIN_COMPLETE,
  appendFlashcardBatch,
  finalizeFlashcardsCheckpoint,
  loadFlashcardsByTopicKey,
  legacyAggressiveTopicKey,
  markBundleAuditPassed,
  prepareFlashcardsRun,
  prepareMaterialRun,
  prepareQuestoesRun,
  loadMaterialDraft,
  saveMaterialCheckpoint,
  saveQuestoesCheckpoint,
  setFlashcardsStatus,
} from './localGenerationCheckpoint'
import {
  generateIncidenciaCompleta,
  isIncidenciaContentComplete,
  sanitizeDisciplinaDocId,
} from '../utils/incidenciaGeneration'
import {
  buildExamFidelityBlock,
  buildExamFidelityInline,
  normalizeExamContext,
  toCourseAiContextShape,
} from '../utils/examFidelityContext'
import {
  appendGoogleAiDossier,
  getGoogleAiTopicDossierOptional,
} from './googleAiBrowserVerifier'

const TRUSTED_AI = {
  trustedGeneration: true,
  useRAG: false,
  // Grounding na geração. Verify pós é ligado por buildTrustedOptions (material/flashcards jurídicos).
  useGoogleSearch: true,
  verifyContent: false, // default; material/flashcards jurídicos sobrescrevem para true
  forceAudit: false,
  // low: qualidade jurídica sem thinking medium/high (caro como output)
  thinkingLevel: 'low',
}

/** Tentativas automáticas por tópico (JSON vazio, rede, qualidade) — sem clicar de novo. */
const TOPIC_AUTO_RETRIES = 3
const TOPIC_RETRY_DELAY_MS = 3000
/** Varredura final nos que falharam com erro temporário. */
const DAY_SWEEP_RETRIES = 2

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Erros em que vale retentar do checkpoint (não precisa clicar "Gerar" de novo). */
function isTransientGenerationError(err) {
  const code = String(err?.code || '')
  const msg = String(err?.message || err || '').toLowerCase()
  // NUNCA retry automático em cota/429 — queima créditos de novo
  if (
    code === 'quota_exceeded' ||
    msg.includes('429') ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests')
  ) {
    return false
  }
  // legal_audit_failed NÃO é transitório — regenerar queima cota sem resolver interpretação
  return (
    code === 'ai_empty_response' ||
    code === 'ai_json_parse_error' ||
    code === 'ai_blocked' ||
    code === 'ai_generation_error' ||
    code === 'flashcards_invalid' ||
    code === 'flashcards_quality' ||
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
  const { verifyContent: verifyOverride, ...rest } = extra
  const defaultVerify =
    rest.contentType === 'material' || (rest.contentType === 'flashcards' && isLegal)
  return {
    ...TRUSTED_AI,
    forceAudit: false,
    useGoogleSearch: true,
    useRAG: false,
    disciplina,
    ...rest,
    isLegalContent: isLegal,
    // Material (e flashcards jurídicos): auditoria pós-geração. Questões: off (JSON + filtro).
    verifyContent: verifyOverride !== undefined ? verifyOverride : defaultVerify,
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
      minCount: QUESTOES_MIN_COMPLETE,
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

  await updateProgress(10, `Gerando ${label} (dossiê factual)…`)
  let dossier = null
  if (topicKey) {
    try {
      const { getOrCreateTopicFactualDossier } = await import('./topicFactualDossierService')
      dossier = await getOrCreateTopicFactualDossier(
        {
          courseId,
          topicKey,
          topicoNome: extra.topico || serverPayload?.savePlan?.topico,
          disciplina,
          ...examCtx,
        },
        { forceFresh },
      )
    } catch {
      dossier = await getGoogleAiTopicDossierOptional(
        {
          courseId,
          topicKey,
          topicoNome: extra.topico || serverPayload?.savePlan?.topico,
          disciplina,
          ...examCtx,
        },
        { forceFresh },
      )
    }
  }
  const richDossier = String(dossier?.text || '').trim().length >= 400
  await updateProgress(
    20,
    richDossier
      ? `Gerando ${label} com dossiê (sem Search por lote)…`
      : dossier?.text
        ? `Gerando ${label} com dossiê + Search…`
        : `Gerando ${label}…`,
  )

  // Questões: sempre em lotes (evita truncar em ~12 quando o alvo é 50)
  if (topicKey && extra.contentType === 'questoes') {
    const totalQuestoes =
      Number(serverPayload?.quantidadeQuestoes) > 0
        ? Number(serverPayload.quantidadeQuestoes)
        : QUESTOES_TARGET
    const promptWithDossier = appendVisualMediaAppendix(
      appendGoogleAiDossier(prompt, dossier?.text),
      disciplina,
      extra.topico || serverPayload?.savePlan?.topicoNome || topicKey || '',
      'questoes',
    )
    const batchResult = await generateQuestoesInBatches({
      total: totalQuestoes,
      batchSize: QUESTOES_BATCH_SIZE,
      examCtx,
      buildBatchPrompt: ({ batchNumber, batches, count }) => `${promptWithDossier}

═══ LOTE ${batchNumber}/${batches} ═══
Ignore qualquer quantidade anterior neste prompt.
Gere EXATAMENTE ${count} questões neste lote (parte de ${totalQuestoes} no total).
Retorne APENAS JSON válido com o array "questoes" contendo ${count} itens.`,
      aiOptions: {
        courseId,
        ...buildTrustedOptions(disciplina, {
          isLegalContent: aiOptions.isLegalContent,
          contentType: 'questoes',
          verifyContent: false,
          // Dossiê rico → sem grounding em cada lote
          useGoogleSearch: !richDossier,
          generationConfig: aiOptions.generationConfig || {
            maxOutputTokens: 24000,
            temperature: 0.2,
          },
          courseContext: toCourseAiContextShape({ ...examCtx, disciplina }),
        }),
      },
      onBatchProgress: async ({ batchNumber, batches, generated, total }) => {
        const pct = 20 + Math.round((generated / Math.max(total, 1)) * 60)
        await updateProgress(
          Math.min(pct, 80),
          `Gerando ${label} lote ${batchNumber}/${batches} (${generated}/${total})…`,
        )
      },
    })
    const parsed = {
      questoes: batchResult.questoes,
      tipoProva: batchResult.tipoLabel,
      banca: examCtx.banca,
      cargo: examCtx.cargo,
      concurso: examCtx.concursoName,
    }
    await updateProgress(85, `Salvando ${label} (checkpoint)…`)
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

  const parsed = await generateAiJson(appendGoogleAiDossier(prompt, dossier?.text), {
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

  const resultRef = await saveMerge(courseId, collectionName, docId, parsed, extra)
  return { resultRef, parsed, resumed: false }
}

function normalizeCard(card = {}) {
  const pergunta = String(card.pergunta || card.frente || card.front || card.question || '').trim()
  const resposta = String(card.resposta || card.verso || card.back || card.answer || '').trim()
  return attachNormalizedIllustration({
    ...card,
    pergunta,
    resposta,
    frente: pergunta,
    verso: resposta,
    dificuldade: card.dificuldade || 'médio',
    prioridade: card.prioridade || 'alta',
  })
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
 * 50 flashcards em lotes de 10 — ancorados no material + edital/banca/cargo.
 * Checkpoint após CADA lote auditado. Retry retoma sem regastar API.
 */
async function processFlashcardsTopico(
  courseId,
  serverPayload,
  updateProgress,
  { jobId = null } = {},
) {
  const meta = serverPayload?.savePlan?.flashcardMeta || {}
  const status = serverPayload?.savePlan?.status || 'indisponivel'
  const forceFresh = Boolean(
    serverPayload?.forceFresh || serverPayload?.savePlan?.forceRegenerate,
  )
  const disciplina = meta.disciplina || ''
  const topicKey = meta.topicKey || serverPayload?.savePlan?.topicKey
  const batchCount = Math.ceil(FLASHCARD_TARGET / FLASHCARD_BATCH_SIZE)
  const examCtx = normalizeExamContext(meta)

  if (!topicKey) {
    throw new Error('topicKey ausente — checkpoint de flashcards exige topicKey.')
  }

  const dossier =
    serverPayload?.savePlan?.googleAiDossier ||
    (
      await getGoogleAiTopicDossierOptional(
        {
          courseId,
          topicKey,
          topicoNome: meta.topicoNome,
          disciplina,
          ...examCtx,
        },
        { forceFresh },
      )
    ).text ||
    ''

  // Material já gerado = fonte factual dos cards (mentorado gera material antes; admin pode regenerar FC com material existente)
  const materialFromPayload = serverPayload?.savePlan?.materialParsed || null
  const materialDraft = materialFromPayload || (await loadMaterialDraft(courseId, topicKey))
  const materialAnchor = buildFlashcardMaterialAnchor(materialDraft)
  const hasMaterialAnchor = Boolean(materialAnchor)

  const prep = await prepareFlashcardsRun({
    courseId,
    topicKey,
    jobId,
    forceFresh,
  })

  let allCards = dedupeCards((prep.existingItems || []).map(normalizeCard))
  let allIds = [...(prep.existingIds || [])]

  if (prep.alreadyComplete && allCards.length >= FLASHCARD_MIN_COMPLETE) {
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
    await updateProgress(
      10,
      hasMaterialAnchor
        ? 'Gerando flashcards ancorados no material do tópico…'
        : 'Gerando flashcards (sem material salvo — usando edital/banca/cargo)…',
    )
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
      `Flashcards lote ${batchNum}/${batchCount} (${cardsInBatch} cards${hasMaterialAnchor ? ' · base: material' : ''})…`,
    )

    const existingFronts = allCards.map((c) => c.pergunta || c.frente).filter(Boolean)
    const existingList = existingFronts.length
      ? `\nNÃO repita estas frentes:\n${existingFronts
          .slice(0, 40)
          .map((f) => `- ${f}`)
          .join('\n')}`
      : ''

    const priorPairs = allCards
      .slice(-12)
      .map((c) => {
        const q = String(c.pergunta || c.frente || '').slice(0, 120)
        const r = String(c.resposta || c.verso || '').slice(0, 160)
        return q && r ? `- Q: ${q} → R: ${r}` : null
      })
      .filter(Boolean)
    const consistencyBlock = priorPairs.length
      ? `\nCONSISTÊNCIA COM CARDS JÁ GERADOS (NÃO CONTRADIGA):\n${priorPairs.join('\n')}`
      : ''

    const topicoNome = meta.topicoNome || meta.topicKey || ''
    const coverageHint =
      batchNum === 1
        ? 'Comece pelos núcleos do MATERIAL (conceitos-chave, artigos, prazos, competências, exceções).'
        : batchNum === batchCount
          ? 'Feche lacunas do MATERIAL: exceções, pegadinhas da banca, distinções e detalhes finos ainda não cobertos.'
          : 'Continue a cobertura sistemática do MATERIAL — subtemas ainda não abordados nas frentes acima.'

    const materialRule = hasMaterialAnchor
      ? `2. FONTE DA VERDADE: o MATERIAL DO TÓPICO abaixo + CONCURSO/CARGO/BANCA/EDITAL (${examCtx.concursoName} / ${examCtx.cargo} / ${examCtx.banca}).
   - Extraia fatos do material. NÃO contradiga o material.
   - Se o material for omisso e a busca confirmar um fato cobrável, pode incluir.
   - Se busca e material conflitarem em detalhe normativo, prefira o texto legal vigente confirmado; na dúvida, OMITA o card.`
      : `2. Alinhe 100% ao CONCURSO, CARGO, BANCA e EDITAL (${examCtx.concursoName} / ${examCtx.cargo} / ${examCtx.banca}). Material do tópico ausente — seja ainda mais conservador com fatos.`

    const promptCore = `${buildExamFidelityBlock(examCtx)}
${basePrompt}

═══ TRAVA DE TÓPICO (OBRIGATÓRIA) ═══
DISCIPLINA: ${disciplina}
TÓPICO EXATO: ${topicoNome}
MÓDULO: ${meta.modulo || ''}
${buildExamFidelityInline(examCtx)}

${materialAnchor || '═══ MATERIAL DO TÓPICO: AUSENTE — baseie-se só em edital/banca/cargo + busca confirmada ═══'}

TAREFA: Criar exatamente ${cardsInBatch} flashcards (lote ${batchNum}/${batchCount} de ${FLASHCARD_TARGET} total).
META DO TÓPICO: ${FLASHCARD_TARGET} cards que, juntos, cubram TODO o tópico — sem lacunas graves e SEM contradizer o material.
${coverageHint}

REGRAS DE OURO (violação = card inválido):
1. CADA card DEVE ser 100% sobre o TÓPICO EXATO acima — nada de assuntos vizinhos ou genéricos da disciplina.
${materialRule}
3. Use Google Search. Confirme leis/artigos. Fato não confirmado → omita. Dúvida factual → NÃO inclua.
4. PROIBIDO: "O que é X?" com definição vaga; curiosidades; conteúdo óbvio; misturar outro tópico.
5. Verso: 2–5 frases técnicas, corretas e cobráveis em prova (estilo ${examCtx.banca}, nível ${examCtx.nivelCurso || 'do cargo'}).
6. NUNCA contradiga outro flashcard deste tópico (sim/não, certo/errado, números, artigos).
7. Prefira fato confirmado a card duvidoso — mas o alvo do tópico continua sendo ${FLASHCARD_TARGET} cards corretos.
${existingList}
${consistencyBlock}

Retorne APENAS JSON:
{ "flashcards": [ { "pergunta": "...", "resposta": "..." } ] }`
    const prompt = appendVisualMediaAppendix(
      appendGoogleAiDossier(promptCore, dossier),
      disciplina,
      topicoNome,
      'flashcards',
    )

    const { validateFlashcardBatchOrThrow } = await import('../utils/flashcardQuality')
    const minKeep = Math.max(1, Math.ceil(cardsInBatch * 0.4))
    let batchCards = []

    // Até 3 tentativas por lote se qualidade falhar (1ª falha NÃO abandona o tópico)
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const parsed = await generateAiJson(
        attempt === 1
          ? prompt
          : `${prompt}

═══ REGENERAÇÃO ${attempt}/3 ═══
O lote anterior foi REJEITADO (vazio/genérico/curto/dúvida factual/contradição com material ou cards).
Gere de novo: 100% no TÓPICO EXATO, alinhado ao MATERIAL e à banca/cargo/edital.
NÃO contradiga o material nem cards já gerados. Prefira menos cards corretos a cards duvidosos.`,
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
              temperature: attempt === 1 ? 0.2 : 0.12,
            },
            auditSoftPassOnFail: true,
          }),
        },
      )

      const rawBatch = dedupeCards(
        (parsed?.flashcards || parsed?.cards || []).map(normalizeCard),
      ).filter((c) => c.pergunta && c.resposta)

      try {
        batchCards = validateFlashcardBatchOrThrow(
          rawBatch,
          { topicoNome, disciplina, priorCards: allCards },
          { minKeep },
        )
        break
      } catch (qualityErr) {
        if (attempt >= 3) throw qualityErr
        await updateProgress(
          pct,
          `Lote ${batchNum}: qualidade baixa — regenerando (tentativa ${attempt + 1}/3)…`,
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
  if (allCards.length < FLASHCARD_MIN_COMPLETE) {
    const err = new Error(
      `Flashcards insuficientes: ${allCards.length} (alvo ${FLASHCARD_TARGET}). Checkpoint mantido — retome o job.`,
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
  await updateProgress(pctBase, `${label}: preparando dossiê factual…`)
  let dossierResult
  try {
    const { getOrCreateTopicFactualDossier } = await import('./topicFactualDossierService')
    dossierResult = await getOrCreateTopicFactualDossier(
      {
        courseId,
        topicKey,
        topicoNome: topic.topicoNome,
        disciplina,
        ...examCtx,
      },
      { forceFresh },
    )
  } catch {
    dossierResult = await getGoogleAiTopicDossierOptional(
      {
        courseId,
        topicKey,
        topicoNome: topic.topicoNome,
        disciplina,
        ...examCtx,
      },
      { forceFresh },
    )
  }
  const googleAiDossier = dossierResult?.text || ''
  const richTopicDossier = googleAiDossier.trim().length >= 400

  let materialParsed = null
  let questoesParsed = null
  let fcResult = null

  await patchLocalTopicStatus(courseId, topic._targetDate, topicKey, {
    status: 'generating',
    step: 'material',
    error: null,
  })
  await updateProgress(
    pctBase,
    richTopicDossier
      ? `Tópico ${index + 1}/${total}: ${label} — material (dossiê)`
      : `Tópico ${index + 1}/${total}: ${label} — material (Search)`,
  )

  const matPrep = await prepareMaterialRun({ courseId, topicKey, jobId, forceFresh })
  if (matPrep.alreadyComplete && matPrep.existingDraft) {
    materialParsed = matPrep.existingDraft
    await updateProgress(pctBase + 1, `${label}: material do checkpoint — sem API`)
  } else if (topic.conteudoPrompt) {
    materialParsed = await generateAiJson(
      appendGoogleAiDossier(topic.conteudoPrompt, googleAiDossier),
      {
        courseId,
        ...buildTrustedOptions(disciplina, {
          contentType: 'material',
          verifyContent: true,
          useGoogleSearch: !richTopicDossier,
          courseContext,
          generationConfig: { maxOutputTokens: 32000, temperature: 0.15 },
        }),
      },
    )

    // Sanitiza questões embutidas no material (mesmo filtro das questões do tópico)
    try {
      const { filterValidQuestoes } = await import('../utils/questoesQuality')
      const tipoProva = examCtx.tipoProva || courseContext?.tipoProva || 'ABCD'
      const pred = materialParsed?.questoesPreditivas
      if (Array.isArray(pred) && pred.length) {
        const { ok, dropped } = filterValidQuestoes(pred, { tipoProva, minKeep: 0 })
        if (dropped) {
          console.warn(
            `[mentorado] material ${topicKey}: ${dropped} questão(ões) preditiva(s) inválida(s) removida(s)`,
          )
        }
        materialParsed = { ...materialParsed, questoesPreditivas: ok }
      }
    } catch (sanitizeErr) {
      console.warn('[mentorado] sanitizar questões do material:', sanitizeErr?.message || sanitizeErr)
    }

    const { ensureMaterialContentComplete } = await import('../utils/contentDepthRules')
    const { generateAiJson: genJson } = await import('../utils/geminiApi')
    materialParsed = await ensureMaterialContentComplete(materialParsed, {
      generateAiJson: genJson,
      generateOptions: {
        courseId,
        ...buildTrustedOptions(disciplina, {
          contentType: 'material',
          verifyContent: false,
          useGoogleSearch: !richTopicDossier,
          courseContext,
          generationConfig: { maxOutputTokens: 32000, temperature: 0.2 },
        }),
      },
      context: {
        topico: topic.topicoNome || label,
        banca: examCtx.banca,
        cargo: examCtx.cargo,
        concurso: examCtx.concursoName,
      },
      maxRepairs: 2,
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

  await updateProgress(
    pctBase + 3,
    richTopicDossier
      ? `Tópico ${index + 1}/${total}: ${label} — questões (dossiê)`
      : `Tópico ${index + 1}/${total}: ${label} — questões (Search)`,
  )
  const qPrep = await prepareQuestoesRun({
    courseId,
    topicKey,
    jobId,
    nivel: 1,
    forceFresh,
    minCount: QUESTOES_MIN_COMPLETE,
  })
  if (qPrep.alreadyComplete && qPrep.existingDraft) {
    questoesParsed = qPrep.existingDraft
    await updateProgress(pctBase + 4, `${label}: questões do checkpoint — sem API`)
  } else if (topic.questoesPrompt) {
    const promptWithDossier = appendVisualMediaAppendix(
      appendGoogleAiDossier(topic.questoesPrompt, googleAiDossier),
      disciplina,
      topic.topicoNome || topicKey,
      'questoes',
    )
    let batchResult
    try {
      batchResult = await generateQuestoesInBatches({
        total: QUESTOES_TARGET,
        batchSize: QUESTOES_BATCH_SIZE,
        examCtx,
        buildBatchPrompt: ({ batchNumber, batches, count }) => `${promptWithDossier}

═══ LOTE ${batchNumber}/${batches} ═══
Ignore qualquer quantidade anterior neste prompt.
Gere EXATAMENTE ${count} questões neste lote (parte de ${QUESTOES_TARGET} no total).
TODA questão DEVE ter "correta": "A"|"B"|"C"|"D"|"E" (ou "C"|"E" se Certo/Errado).
alternativas A-E com texto real (não vazio), se múltipla escolha.
Retorne APENAS JSON válido com o array "questoes" contendo ${count} itens.`,
        aiOptions: {
          courseId,
          ...buildTrustedOptions(disciplina, {
            contentType: 'questoes',
            verifyContent: false,
            useGoogleSearch: !richTopicDossier,
            courseContext,
            generationConfig: { maxOutputTokens: 24000, temperature: 0.15 },
          }),
        },
        onBatchProgress: async ({ batchNumber, batches, generated, total: tot }) => {
          await updateProgress(
            pctBase + 3,
            `${label}: questões lote ${batchNumber}/${batches} (${generated}/${tot})…`,
          )
        },
      })
    } catch (batchErr) {
      console.warn('[mentorado] questões em lotes:', batchErr?.message || batchErr)
      const err = new Error(
        batchErr?.message ||
          'Não foi possível gerar questões válidas em lotes (gabarito/alternativas).',
      )
      err.code = batchErr?.code || 'questoes_invalid'
      throw err
    }

    if (batchResult.dropped) {
      console.warn(
        `[mentorado] ${batchResult.dropped} questão(ões) inválida(s) descartada(s) em ${topicKey}`,
      )
    }

    if (!batchResult.questoes?.length) {
      const err = new Error('Não foi possível gerar questões válidas (gabarito/alternativas).')
      err.code = 'questoes_invalid'
      throw err
    }

    questoesParsed = {
      questoes: batchResult.questoes,
      tipoProva: batchResult.tipoLabel,
      banca: examCtx.banca,
      cargo: examCtx.cargo,
      concurso: examCtx.concursoName,
    }
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
          googleAiDossier,
          materialParsed,
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
      const dayResult =
        prepared.kind === 'incidencia'
          ? await processGuiaMentoradoIncidenciaDay(
              courseId,
              {
                items: prepared.items,
                targetDate: dayKey,
                autoPublish,
                courseMeta: prepared.courseMeta,
              },
              async (p, msg) => {
                const mapped =
                  pctBase +
                  Math.round(((p || 0) / 100) * Math.max(1, Math.round(92 / totalDays) - 1))
                await updateProgress(Math.min(mapped, 94), `[${dayKey}] ${msg || ''}`)
              },
              { userId, jobId },
            )
          : await processGuiaMentoradoDay(
              courseId,
              {
                topics: prepared.topics,
                targetDate: dayKey,
                autoPublish,
                forceFresh: false,
              },
              async (p, msg) => {
                const mapped =
                  pctBase +
                  Math.round(((p || 0) / 100) * Math.max(1, Math.round(92 / totalDays) - 1))
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
  await updateProgress(10, 'Carregando edital verticalizado…')

  const today = dayjs().startOf('day')
  const planningEnd = resolvePlanningEndDate(config)

  // Documento real: editalVerticalizado/principal (disciplinas) — NÃO "atual"
  const { loadEditalVerticalizado } = await import('../utils/editalVerticalizadoLoader')
  const edital = await loadEditalVerticalizado(courseId)
  if (!edital?.disciplinas?.length) {
    throw new Error(
      'Edital verticalizado não encontrado neste curso. Gere o edital no Admin antes do cronograma.',
    )
  }

  await updateProgress(25, 'Montando guia (bot: tópicos + 5 dias de incidência)…')

  if (!config.dataProva) {
    // Sem data: usa janela padrão (não bloqueia o bot)
    console.warn('[mentorado] cronograma sem dataProva — usando janela padrão')
  }

  const { buildDeterministicMentoradoCronograma } = await import('../utils/buildMentoradoCronograma')
  let built
  try {
    built = buildDeterministicMentoradoCronograma({
      edital,
      today,
      planningEnd,
      config: {
        ...config,
        // Se não tiver data, o builder usa planningEnd (90 dias) sem exigir dataProva
        dataProva: config.dataProva || planningEnd.format('YYYY-MM-DD'),
      },
    })
  } catch (buildErr) {
    buildErr.message = buildErr.message || 'Falha ao montar o guia mentorado.'
    throw buildErr
  }
  const { cronograma: days, meta } = built

  if (!Array.isArray(days) || days.length < 1) {
    const err = new Error('Não foi possível montar dias de cronograma a partir do edital.')
    err.code = 'cronograma_empty'
    throw err
  }

  await updateProgress(
    70,
    `Salvando ${days.length} dias (${meta?.totalTopics || 0} tópicos)…`,
  )

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
      ...(day.incidencia ? { incidencia: true } : {}),
    }
  }

  if (!Object.keys(byMonth).length) {
    const err = new Error('Cronograma sem datas válidas (YYYY-MM-DD). Tente gerar de novo.')
    err.code = 'cronograma_invalid'
    throw err
  }

  // Regenerar = APAGA cronograma + automação do dia e grava só o novo plano
  const todayKey = today.format('YYYY-MM-DD')
  await updateProgress(72, 'Apagando cronograma e automação antigos…')

  const monthsSnap = await getDocs(collection(db, 'courses', courseId, 'cronograma'))
  for (const monthDoc of monthsSnap.docs) {
    // Remove mês inteiro (inclui dias anteriores). Depois regrava só o novo.
    try {
      await deleteDoc(monthDoc.ref)
    } catch (delErr) {
      // fallback: zera days se delete falhar
      await setDoc(monthDoc.ref, { days: {}, updatedAt: serverTimestamp() }, { merge: true }).catch(
        () => {},
      )
      console.warn('[mentorado] delete cronograma mês:', monthDoc.id, delErr?.message || delErr)
    }
  }

  // Limpa status da automação diária (PENDENTE/ERRO/LIBERADO do dia)
  try {
    const autoSnap = await getDocs(collection(db, 'courses', courseId, 'mentoradoAutomation'))
    for (const autoDoc of autoSnap.docs) {
      await deleteDoc(autoDoc.ref).catch(() => {})
    }
  } catch (autoErr) {
    console.warn('[mentorado] limpar mentoradoAutomation:', autoErr?.message || autoErr)
  }

  await updateProgress(80, `Gravando ${days.length} dias novos do guia…`)

  for (const [monthKey, data] of Object.entries(byMonth)) {
    await setDoc(doc(db, 'courses', courseId, 'cronograma', monthKey), {
      days: data.days,
      updatedAt: serverTimestamp(),
      generatedAt: serverTimestamp(),
      generatedFrom: todayKey,
      source: 'bot_deterministic',
      replacedAt: serverTimestamp(),
    })
  }

  // Permite o tick diário gerar conteúdos de hoje de novo após regenerar o guia
  const cfgRef = doc(db, 'courses', courseId, 'config', 'guiaMentorado')
  try {
    await updateDoc(cfgRef, {
      cronogramaGeradoEm: serverTimestamp(),
      'automation.lastDailyRunDayKey': null,
      'automation.lastError': null,
      updatedAt: serverTimestamp(),
    })
  } catch {
    await setDoc(
      cfgRef,
      {
        cronogramaGeradoEm: serverTimestamp(),
        automation: {
          lastDailyRunDayKey: null,
          lastError: null,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  }

  // Config legado — se falhar por rules, não derruba o guia (cronograma já salvo)
  try {
    await setDoc(
      doc(db, 'courses', courseId, 'guiaMentorado', 'config'),
      {
        dataProva: config.dataProva || null,
        hasTAF: Boolean(config.hasTAF),
        hasRedacao: Boolean(config.hasRedacao),
        tafExercicios: config.tafExercicios || [],
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  } catch (legacyErr) {
    console.warn('[mentorado] guiaMentorado/config:', legacyErr?.message || legacyErr)
  }

  await updateProgress(
    95,
    `Guia regenerado do zero: ${days.length} dias (cronograma + automação limpos)`,
  )

  return {
    totalDays: days.length,
    monthsCount: Object.keys(byMonth).length,
    totalTopics: meta?.totalTopics || 0,
    fromDay: todayKey,
    wiped: true,
    source: 'bot_deterministic',
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

async function processConteudoIncidencia(courseId, serverPayload, updateProgress) {
  const savePlan = serverPayload?.savePlan || {}
  const disciplinaNome = savePlan.disciplinaNome || serverPayload?.disciplinaNome || 'Disciplina'
  const docId = savePlan.docId || sanitizeDisciplinaDocId(disciplinaNome)
  const status = savePlan.status || CONTENT_STATUS.AVAILABLE || 'disponivel'
  const topicos = Array.isArray(savePlan.topicos)
    ? savePlan.topicos
    : Array.isArray(serverPayload?.topicos)
      ? serverPayload.topicos
      : []

  // Já completo? não regera
  try {
    const existing = await getDoc(doc(db, 'courses', courseId, 'conteudosIncidencia', docId))
    if (existing.exists() && isIncidenciaContentComplete(existing.data(), topicos.length)) {
      await updateProgress(95, `Incidência de ${disciplinaNome} já completa — pulando`)
      return {
        resultRef: { collection: 'conteudosIncidencia', docId, resumed: true },
        parsed: existing.data(),
        resumed: true,
      }
    }
  } catch {
    /* segue geração */
  }

  const meta = serverPayload?.courseMeta || {}
  const parsed = await generateIncidenciaCompleta({
    disciplinaNome,
    topicos,
    banca: meta.banca || savePlan.banca || '',
    cargo: meta.cargo || savePlan.cargo || '',
    concursoName: meta.concursoName || meta.competition || meta.courseName || savePlan.courseName || '',
    courseName: meta.courseName || savePlan.courseName || 'Curso Preparatório',
    nivelCurso: meta.nivelCurso || meta.nivel || '',
    editalText: meta.editalText || serverPayload?.editalText || '',
    courseId,
    generateFn: generateAiJson,
    onProgress: updateProgress,
    aiOptions: serverPayload?.aiOptions || {},
  })

  await updateProgress(92, `Salvando incidência: ${disciplinaNome}`)
  const resultRef = await saveMerge(courseId, 'conteudosIncidencia', docId, parsed, {
    disciplinaIdx: savePlan.disciplinaIdx,
    status,
  })
  return { resultRef, parsed, resumed: false }
}

async function processGuiaMentoradoIncidenciaDay(
  courseId,
  serverPayload,
  updateProgress,
  { userId, jobId } = {},
) {
  const items = Array.isArray(serverPayload?.items) ? serverPayload.items : []
  const targetDate = serverPayload?.targetDate
  if (!targetDate) throw new Error('Data do dia ausente.')
  if (!items.length) throw new Error('Nenhuma matéria de incidência no dia.')

  const autoPublish = serverPayload?.autoPublish !== false
  const status = autoPublish ? CONTENT_STATUS.AVAILABLE : CONTENT_STATUS.UNAVAILABLE
  const courseMeta = serverPayload?.courseMeta || {}
  const errors = []
  let done = 0

  await setDoc(
    doc(db, 'courses', courseId, 'mentoradoAutomation', targetDate),
    {
      status: 'running',
      kind: 'incidencia',
      jobId: jobId || null,
      userId: userId || null,
      totalTopics: items.length,
      publishedCount: 0,
      updatedAt: serverTimestamp(),
      startedAt: serverTimestamp(),
    },
    { merge: true },
  )

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]
    const label = item.disciplinaNome || `Matéria ${i + 1}`
    const pctBase = Math.round((i / items.length) * 85) + 5
    try {
      await updateProgress(pctBase, `Incidência do dia: ${label}`)
      const result = await processConteudoIncidencia(
        courseId,
        {
          courseMeta,
          savePlan: {
            disciplinaNome: item.disciplinaNome,
            disciplinaIdx: item.disciplinaIdx,
            docId: item.docId || sanitizeDisciplinaDocId(item.disciplinaNome),
            topicos: item.topicos || [],
            status,
          },
          aiOptions: {
            useRAG: true,
            isLegalContent: true,
          },
        },
        async (p, msg) => {
          const mapped = pctBase + Math.round(((p || 0) / 100) * Math.max(8, Math.round(80 / items.length)))
          await updateProgress(Math.min(mapped, 92), msg || label)
        },
      )
      if (result?.parsed) done += 1
    } catch (err) {
      errors.push({
        topicKey: item.docId || item.disciplinaNome,
        error: err?.message || String(err),
        code: err?.code || null,
      })
    }
  }

  await setDoc(
    doc(db, 'courses', courseId, 'mentoradoAutomation', targetDate),
    {
      status: errors.length ? 'partial' : 'done',
      kind: 'incidencia',
      totalTopics: items.length,
      publishedCount: done,
      errors,
      updatedAt: serverTimestamp(),
      finishedAt: serverTimestamp(),
    },
    { merge: true },
  )

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

  await updateProgress(96, `Incidência do dia: ${done}/${items.length} matéria(s)`)
  return { publishedCount: done, totalTopics: items.length, errors, kind: 'incidencia' }
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
      return processConteudoIncidencia(courseId, serverPayload, updateProgress)
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
    case 'guia_mentorado_incidencia':
      return processGuiaMentoradoIncidenciaDay(courseId, serverPayload, updateProgress, {
        userId,
        jobId,
      })
    case 'guia_mentorado_cronograma':
      return processGuiaMentoradoCronograma(courseId, serverPayload, updateProgress)
    case 'guia_mentorado_backfill': {
      if (serverPayload?.kind === 'incidencia' || serverPayload?.items?.length) {
        return processGuiaMentoradoIncidenciaDay(courseId, serverPayload, updateProgress, {
          userId,
          jobId,
        })
      }
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
