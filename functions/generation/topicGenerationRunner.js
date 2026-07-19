/**
 * Orquestra geração de tópico com checkpoints (flashcards, material, questões).
 */

const {
  generateTrustedFlashcardsSet,
  generateTrustedMaterial,
  generateTrustedQuestoes,
} = require('./unifiedContentGeneration')
const {
  prepareFlashcardsRun,
  appendFlashcardBatch,
  finalizeFlashcardsCheckpoint,
  prepareMaterialRun,
  saveMaterialPhaseDraft,
  finalizeMaterialCheckpoint,
  prepareQuestoesRun,
  appendQuestoesBatch,
  finalizeQuestoesCheckpoint,
  DEFAULT_QUESTOES_COUNT,
  MATERIAL_PHASE_CORE,
  MATERIAL_PHASE_EXTRAS,
} = require('./generationCheckpoint')
const { hydrateConteudoCompletoMaterial } = require('./materialFormatting')
const { sanitizeQuestaoAlternativas } = require('./aiTextFormatting')

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

async function runFlashcardsWithCheckpoint({
  courseId,
  jobId,
  meta,
  forceFresh = false,
  draftStatus = 'indisponivel',
  onProgress = null,
}) {
  const prep = await prepareFlashcardsRun({
    courseId,
    topicKey: meta.topicKey,
    jobId,
    meta,
    forceFresh,
  })

  if (onProgress) {
    await onProgress(
      prep.resume
        ? `Retomando flashcards — lote ${prep.startBatch}/3 (${prep.existingItems.length} já salvos)…`
        : 'Preparando 30 flashcards estratégicos…',
      prep.existingItems.length,
    )
  }

  const allItems = await generateTrustedFlashcardsSet(
    { ...meta, editalText: meta.editalText || '' },
    {
      existingItems: prep.existingItems,
      startBatch: prep.startBatch,
      onBatch: async (n, total) => {
        if (onProgress) await onProgress(`Flashcards auditados — lote ${n}/${total}…`)
      },
      onBatchComplete: async (batchNum, _total, all, batchItems) => {
        const startOrder = all.length - batchItems.length
        await appendFlashcardBatch({
          courseId,
          jobId,
          meta,
          batchItems,
          batchNum,
          draftStatus,
          startOrder,
        })
        if (onProgress) await onProgress(`Flashcards — lote ${batchNum} salvo (${all.length}/30)`, all.length)
      },
    },
  )

  await finalizeFlashcardsCheckpoint({
    courseId,
    topicKey: meta.topicKey,
    jobId,
    finalStatus: draftStatus,
    meta,
  })

  return { count: allItems.length, items: allItems, resumed: prep.resume }
}

async function runMaterialWithCheckpoint({
  courseId,
  jobId,
  params,
  forceFresh = false,
  finalStatus = 'indisponivel',
  onProgress = null,
}) {
  const prep = await prepareMaterialRun({
    courseId,
    topicKey: params.topicKey,
    jobId,
    forceFresh,
  })

  if (onProgress) {
    await onProgress(
      prep.resume
        ? `Retomando material — fase ${prep.startPhase}/2…`
        : 'Gerando conteúdo confiável (fase 1/2)…',
    )
  }

  const parsed = await generateTrustedMaterial(params, {
    startPhase: prep.startPhase,
    existingDraft: prep.existingDraft,
    onPhaseComplete: async (phase, data) => {
      const hydrated = hydrateConteudoCompletoMaterial(data, params.topicKey)
      await saveMaterialPhaseDraft({
        courseId,
        topicKey: params.topicKey,
        parsed: hydrated,
        jobId,
        phase,
        extraFields: {
          materia: hydrated.materia,
          numero: hydrated.numero || params.topicKey,
        },
      })
      if (onProgress) {
        await onProgress(
          phase === MATERIAL_PHASE_CORE
            ? 'Material — núcleo salvo (checkpoint). Fase 2/2…'
            : 'Material — complemento salvo (checkpoint)…',
        )
      }
    },
  })

  const normalized = hydrateConteudoCompletoMaterial(parsed, params.topicKey)
  await finalizeMaterialCheckpoint({
    courseId,
    topicKey: params.topicKey,
    jobId,
    finalStatus,
    extraFields: {
      materia: normalized.materia,
      numero: normalized.numero || params.topicKey,
      topicKey: params.topicKey,
    },
  })

  return { parsed: normalized, resumed: prep.resume }
}

async function runQuestoesWithCheckpoint({
  courseId,
  jobId,
  params,
  expectedCount = DEFAULT_QUESTOES_COUNT,
  forceFresh = false,
  finalStatus = 'indisponivel',
  onProgress = null,
}) {
  const nivel = params.nivel ?? 1
  const prep = await prepareQuestoesRun({
    courseId,
    topicKey: params.topicKey,
    jobId,
    nivel,
    forceFresh,
  })

  if (onProgress) {
    await onProgress(
      prep.resume
        ? `Retomando questões — lote ${prep.startBatch}/${Math.ceil(expectedCount / 10)} (${prep.existingQuestoes.length} já salvas)…`
        : 'Gerando questões confiáveis…',
    )
  }

  let parsedBase = prep.existingParsed

  const parsed = await generateTrustedQuestoes(params, expectedCount, {
    existingQuestoes: prep.existingQuestoes,
    startBatch: prep.startBatch,
    onBatchComplete: async (batchNum, _total, all, batchItems, batchParsed) => {
      parsedBase = await appendQuestoesBatch({
        courseId,
        topicKey: params.topicKey,
        jobId,
        nivel,
        batchQuestoes: batchItems,
        batchNum,
        parsedBase: parsedBase || batchParsed,
        extraFields: {
          topico: batchParsed.topico || params.topicoNome || params.topicKey,
        },
      })
    },
  })

  const normalized = normalizeParsedQuestoes(parsed)
  await finalizeQuestoesCheckpoint({
    courseId,
    topicKey: params.topicKey,
    jobId,
    nivel,
    finalStatus,
    extraFields: {
      topico: normalized.topico || params.topicoNome || params.topicKey,
      nivel,
      topicKey: params.topicKey,
    },
  })

  return { parsed: normalized, resumed: prep.resume }
}

module.exports = {
  runFlashcardsWithCheckpoint,
  runMaterialWithCheckpoint,
  runQuestoesWithCheckpoint,
  normalizeParsedQuestoes,
}
