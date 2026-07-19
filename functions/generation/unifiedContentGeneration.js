/**
 * Geração unificada — flashcards (30), material e questões com o mesmo pipeline confiável.
 * Suporta checkpoints: salva após cada lote/fase e retoma com existingItems/startBatch/startPhase.
 */

const { generateTrustedJson } = require('./trustedGeneration')
const {
  buildFlashcardPrompt,
  buildMaterialCorePrompt,
  buildMaterialExtrasPrompt,
  buildQuestoesBatchPrompt,
} = require('./unifiedGenerationPrompts')
const {
  validateFlashcardsList,
  MIN_FLASHCARDS,
  MAX_FLASHCARDS,
  FLASHCARD_BATCH_SIZE,
} = require('./flashcardsValidate')
const {
  validateConteudoCompletoPayload,
  validateMaterialCorePayload,
  validateMaterialExtrasPayload,
} = require('./conteudoCompletoValidate')
const { validateQuestoesPayload } = require('./questoesValidate')
const {
  QUESTOES_BATCH_SIZE,
  DEFAULT_QUESTOES_COUNT,
  MATERIAL_PHASE_CORE,
  MATERIAL_PHASE_EXTRAS,
} = require('./generationCheckpoint')
const { isLikelyLegalDiscipline } = require('./unifiedLegalTravas')
const { buildConsistencyAuditPrompt, parseVerificationResult } = require('./contentVerification')
const { callGemini, extractGeneratedText } = require('./geminiServer')

const VERIFY_CONFIG = { temperature: 0, maxOutputTokens: 8192 }

function dedupeFlashcards(items = []) {
  const seen = new Set()
  return items.filter((item) => {
    const front = String(item?.frente || item?.pergunta || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
    if (!front || seen.has(front)) return false
    seen.add(front)
    return true
  })
}

function buildGenerationContext(meta = {}, extra = {}) {
  return {
    disciplina: meta.disciplina || extra.disciplina || '',
    banca: meta.banca || extra.banca || '',
    concursoName: meta.concursoName || meta.courseName || extra.concursoName || '',
    cargo: meta.cargo || extra.cargo || '',
    topicoNome: meta.topicoNome || extra.topicoNome || '',
    forceAudit: true,
    isLegalContent: isLikelyLegalDiscipline(meta.disciplina || extra.disciplina),
    ...extra,
  }
}

function assertMaterialCore(parsed) {
  const v = validateMaterialCorePayload(parsed)
  if (!v.ok) {
    const err = new Error(`Material (núcleo) inválido — ${v.errors.join(' ')}`)
    err.code = 'material_incomplete'
    throw err
  }
}

function assertMaterialExtras(parsed) {
  const v = validateMaterialExtrasPayload(parsed)
  if (!v.ok) {
    const err = new Error(`Material (complemento) inválido — ${v.errors.join(' ')}`)
    err.code = 'material_incomplete'
    throw err
  }
}

/**
 * 30 flashcards em lotes — retoma de startBatch com existingItems.
 */
async function generateTrustedFlashcardsSet(
  meta = {},
  {
    onBatch = null,
    onBatchComplete = null,
    existingItems = [],
    startBatch = 1,
  } = {},
) {
  const batchCount = Math.ceil(MAX_FLASHCARDS / FLASHCARD_BATCH_SIZE)
  let allItems = dedupeFlashcards(existingItems)
  const ctx = buildGenerationContext(meta, { contentType: 'flashcards' })

  if (allItems.length >= MIN_FLASHCARDS) {
    const early = validateFlashcardsList(allItems, { min: MIN_FLASHCARDS, max: MAX_FLASHCARDS })
    if (early.ok) return allItems.slice(0, MAX_FLASHCARDS)
  }

  const firstBatch = Math.max(1, Math.min(startBatch, batchCount + 1))

  for (let batchNum = firstBatch; batchNum <= batchCount; batchNum += 1) {
    const remaining = MAX_FLASHCARDS - allItems.length
    if (remaining <= 0) break

    const cardsInBatch = Math.min(FLASHCARD_BATCH_SIZE, remaining)
    if (onBatch) await onBatch(batchNum, batchCount)

    const prompt = buildFlashcardPrompt(
      meta,
      batchNum,
      batchCount,
      cardsInBatch,
      allItems.map((c) => c.frente || c.pergunta),
    )

    const parsed = await generateTrustedJson(
      prompt,
      { contentType: 'flashcards', rejectTruncatedJson: false },
      {
        ...ctx,
        flashcardLimits: { min: Math.max(1, cardsInBatch - 2), max: cardsInBatch + 1 },
      },
    )

    const batchItems = parsed.flashcards || []
    allItems = dedupeFlashcards([...allItems, ...batchItems])

    if (onBatchComplete) {
      await onBatchComplete(batchNum, batchCount, allItems, batchItems)
    }
  }

  allItems = allItems.slice(0, MAX_FLASHCARDS)

  const validation = validateFlashcardsList(allItems, { min: MIN_FLASHCARDS, max: MAX_FLASHCARDS })
  if (!validation.ok) {
    const err = new Error(`Flashcards inválidos — ${validation.errors.slice(0, 6).join(' ')}`)
    err.code = 'flashcards_invalid'
    throw err
  }

  if (allItems.length < MIN_FLASHCARDS) {
    const err = new Error(
      `Flashcards insuficientes: ${allItems.length} (exigido ${MIN_FLASHCARDS}).`,
    )
    err.code = 'flashcards_invalid'
    throw err
  }

  return allItems
}

/**
 * Material em 2 fases — núcleo (Raio-X + Revisão) e complemento (pegadinhas + questões embutidas).
 */
async function generateTrustedMaterial(
  params = {},
  {
    onPhaseComplete = null,
    startPhase = 1,
    existingDraft = null,
  } = {},
) {
  const ctx = buildGenerationContext(params, { contentType: 'material' })
  const promptParams = {
    disciplina: params.disciplina,
    topicoNome: params.topicoNome,
    topicKey: params.topicKey,
    banca: params.banca,
    concursoName: params.concursoName || params.courseName,
    courseName: params.courseName,
    cargo: params.cargo,
    editalText: params.editalText,
  }

  let core = existingDraft

  if (startPhase <= MATERIAL_PHASE_CORE) {
    const corePrompt = params.prompt || buildMaterialCorePrompt(promptParams)
    core = await generateTrustedJson(
      corePrompt,
      { contentType: 'material_core', rejectTruncatedJson: true },
      ctx,
    )
    assertMaterialCore(core)
    if (onPhaseComplete) await onPhaseComplete(MATERIAL_PHASE_CORE, core)
  }

  if (startPhase <= MATERIAL_PHASE_EXTRAS) {
    const extrasPrompt = buildMaterialExtrasPrompt(
      promptParams,
      JSON.stringify({
        titulo: core?.titulo,
        raioXProbabilidade: core?.raioXProbabilidade,
        revisaoTurbo: core?.revisaoTurbo,
      }),
    )
    const extras = await generateTrustedJson(
      extrasPrompt,
      { contentType: 'material_extras', rejectTruncatedJson: true },
      ctx,
    )
    assertMaterialExtras(extras)

    const merged = {
      ...core,
      pegadinhas: extras.pegadinhas,
      questoesPreditivas: extras.questoesPreditivas,
    }

    const fullValidation = validateConteudoCompletoPayload(merged)
    if (!fullValidation.ok) {
      const err = new Error(`Material inválido — ${fullValidation.errors.slice(0, 6).join(' ')}`)
      err.code = 'material_incomplete'
      throw err
    }

    const embedded = merged.questoesPreditivas || []
    if (embedded.length > 0) {
      const qv = validateQuestoesPayload(
        { questoes: embedded },
        { expectedCount: embedded.length, banca: params.banca },
      )
      if (!qv.ok) {
        const err = new Error(`Questões embutidas inválidas — ${qv.errors.slice(0, 6).join(' ')}`)
        err.code = 'questoes_invalid'
        throw err
      }
    }

    if (onPhaseComplete) await onPhaseComplete(MATERIAL_PHASE_EXTRAS, merged)
    return merged
  }

  return core
}

/**
 * Questões em lotes de 10 — retoma de startBatch com existingQuestoes.
 */
async function generateTrustedQuestoes(
  params = {},
  expectedCount = DEFAULT_QUESTOES_COUNT,
  {
    onBatchComplete = null,
    existingQuestoes = [],
    startBatch = 1,
  } = {},
) {
  const ctx = buildGenerationContext(params, { contentType: 'questoes', expectedCount })
  const batchCount = Math.ceil(expectedCount / QUESTOES_BATCH_SIZE)
  let allQuestoes = [...existingQuestoes]
  const firstBatch = Math.max(1, Math.min(startBatch, batchCount + 1))

  if (allQuestoes.length >= expectedCount) {
    const early = validateQuestoesPayload(
      { questoes: allQuestoes.slice(0, expectedCount) },
      { expectedCount, banca: params.banca },
    )
    if (early.ok) {
      return {
        topico: params.topicoNome || params.topicKey || '',
        nivel: params.nivel ?? 1,
        questoes: allQuestoes.slice(0, expectedCount),
      }
    }
  }

  for (let batchNum = firstBatch; batchNum <= batchCount; batchNum += 1) {
    const remaining = expectedCount - allQuestoes.length
    if (remaining <= 0) break

    const questionsInBatch = Math.min(QUESTOES_BATCH_SIZE, remaining)
    const startNum = allQuestoes.length + 1

    const prompt =
      params.prompt && batchNum === firstBatch && firstBatch === 1 && !existingQuestoes.length
        ? params.prompt
        : buildQuestoesBatchPrompt({
            disciplina: params.disciplina,
            topicoNome: params.topicoNome,
            topicKey: params.topicKey,
            banca: params.banca,
            concursoName: params.concursoName,
            cargo: params.cargo,
            editalText: params.editalText,
            nivel: params.nivel ?? 1,
            maxNivel: params.maxNivel ?? 10,
            batchNumber: batchNum,
            totalBatches: batchCount,
            questionsInBatch,
            startNum,
            expectedCount,
            existingEnunciados: allQuestoes.map((q) => q.enunciado || q.pergunta),
          })

    const parsed = await generateTrustedJson(prompt, { contentType: 'questoes' }, ctx)

    const batchItems = parsed.questoes || parsed.questions || []
    const batchValidation = validateQuestoesPayload(
      { questoes: batchItems },
      { expectedCount: questionsInBatch, banca: params.banca },
    )
    if (!batchValidation.ok) {
      const err = new Error(`Questões (lote) inválidas — ${batchValidation.errors.slice(0, 6).join(' ')}`)
      err.code = 'questoes_invalid'
      throw err
    }

    allQuestoes = [...allQuestoes, ...batchItems]

    if (onBatchComplete) {
      await onBatchComplete(batchNum, batchCount, allQuestoes, batchItems, parsed)
    }
  }

  const result = {
    topico: params.topicoNome || params.topicKey || '',
    nivel: params.nivel ?? 1,
    questoes: allQuestoes.slice(0, expectedCount),
  }

  const validation = validateQuestoesPayload(result, { expectedCount, banca: params.banca })
  if (!validation.ok) {
    const err = new Error(`Questões inválidas — ${validation.errors.slice(0, 8).join(' ')}`)
    err.code = 'questoes_invalid'
    throw err
  }

  return result
}

/** Auditoria cruzada automática antes de publicar tópico. */
async function auditTopicBundleConsistency({
  flashcards = [],
  materialSample = '',
  questoesSample = '',
  courseContext = {},
}) {
  const fcSample = flashcards
    .slice(0, 12)
    .map((c, i) => `${i + 1}. F: ${c.frente || c.pergunta}\n   V: ${c.verso || c.resposta}`)
    .join('\n')

  const prompt = buildConsistencyAuditPrompt({
    flashcardsSample: fcSample,
    materialSample: materialSample.slice(0, 6000),
    questoesSample: questoesSample.slice(0, 6000),
    courseContext,
  })

  const response = await callGemini(prompt, {
    useGoogleSearch: true,
    generationConfig: VERIFY_CONFIG,
  })
  const text = extractGeneratedText(response)
  const result = parseVerificationResult(text)
  if (!result.aprovado) {
    const err = new Error(
      `Inconsistência entre flashcards/material/questões: ${(result.problemas || [])
        .slice(0, 3)
        .map((p) => p.motivo || p.status)
        .join('; ')}`,
    )
    err.code = 'bundle_consistency_failed'
    throw err
  }
  return result
}

module.exports = {
  generateTrustedFlashcardsSet,
  generateTrustedMaterial,
  generateTrustedQuestoes,
  auditTopicBundleConsistency,
  dedupeFlashcards,
  buildGenerationContext,
}
