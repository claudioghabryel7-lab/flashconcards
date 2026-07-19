/**
 * Geração unificada — flashcards (30), material e questões com o mesmo pipeline confiável.
 */

const { generateTrustedJson } = require('./trustedGeneration')
const { buildFlashcardPrompt, buildMaterialPrompt, buildQuestoesPrompt } = require('./unifiedGenerationPrompts')
const {
  validateFlashcardsList,
  MIN_FLASHCARDS,
  MAX_FLASHCARDS,
  FLASHCARD_BATCH_SIZE,
} = require('./flashcardsValidate')
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

/**
 * 30 flashcards em 3 lotes de 10 — cada lote passa pelo pipeline confiável completo.
 */
async function generateTrustedFlashcardsSet(meta = {}, { onBatch = null } = {}) {
  const batchCount = Math.ceil(MAX_FLASHCARDS / FLASHCARD_BATCH_SIZE)
  let allItems = []
  const ctx = buildGenerationContext(meta, { contentType: 'flashcards' })

  for (let batchNum = 1; batchNum <= batchCount; batchNum += 1) {
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

    allItems = dedupeFlashcards([...allItems, ...(parsed.flashcards || [])])
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

async function generateTrustedMaterial(params = {}) {
  const prompt =
    params.prompt ||
    buildMaterialPrompt({
      disciplina: params.disciplina,
      topicoNome: params.topicoNome,
      topicKey: params.topicKey,
      banca: params.banca,
      concursoName: params.concursoName || params.courseName,
      courseName: params.courseName,
      cargo: params.cargo,
      editalText: params.editalText,
    })

  return generateTrustedJson(
    prompt,
    { contentType: 'material', rejectTruncatedJson: true },
    buildGenerationContext(params, { contentType: 'material' }),
  )
}

async function generateTrustedQuestoes(params = {}, expectedCount = 50) {
  const prompt =
    params.prompt ||
    buildQuestoesPrompt({
      disciplina: params.disciplina,
      topicoNome: params.topicoNome,
      topicKey: params.topicKey,
      banca: params.banca,
      concursoName: params.concursoName,
      cargo: params.cargo,
      editalText: params.editalText,
      nivel: params.nivel ?? 1,
      maxNivel: params.maxNivel ?? 10,
      expectedCount,
    })

  return generateTrustedJson(
    prompt,
    { contentType: 'questoes' },
    buildGenerationContext(params, { contentType: 'questoes', expectedCount }),
  )
}

/** Auditoria cruzada automática antes de publicar tópico. */
async function auditTopicBundleConsistency({ flashcards = [], materialSample = '', questoesSample = '', courseContext = {} }) {
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
