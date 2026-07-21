/**
 * Geração de questões em lotes (evita truncamento de 50 questões de uma vez)
 * e prompts alinhados à banca/cargo.
 */
import { generateAiJson } from './geminiApi.js'
import { filterValidQuestoes } from './questoesQuality.js'
import {
  buildExamFidelityBlock,
  buildQuestaoJsonSchemaSnippet,
  buildTipoProvaInstructions,
  formatTipoProvaLabel,
  isCertoErradoTipo,
  normalizeExamContext,
} from './examFidelityContext.js'

/**
 * Gera N questões em lotes menores para não cortar por MAX_TOKENS.
 */
export async function generateQuestoesInBatches({
  buildBatchPrompt,
  total = 50,
  batchSize = 10,
  examCtx = {},
  aiOptions = {},
  onBatchProgress,
} = {}) {
  const exam = normalizeExamContext(examCtx)
  const tipoProva = exam.tipoProva
  const batches = Math.ceil(total / batchSize)
  const all = []
  let droppedTotal = 0

  for (let i = 0; i < batches; i += 1) {
    const remaining = total - all.length
    if (remaining <= 0) break
    const count = Math.min(batchSize, remaining)
    const batchNumber = i + 1

    if (typeof onBatchProgress === 'function') {
      await onBatchProgress({
        batchNumber,
        batches,
        count,
        generated: all.length,
        total,
      })
    }

    const prompt = buildBatchPrompt({
      batchNumber,
      batches,
      count,
      exam,
      tipoProva,
      tipoLabel: formatTipoProvaLabel(tipoProva),
    })

    const parsed = await generateAiJson(prompt, {
      ...aiOptions,
      generationConfig: {
        maxOutputTokens: 24000,
        temperature: 0.2,
        ...(aiOptions.generationConfig || {}),
      },
      maxContinues: 2,
    })

    const { ok, dropped } = filterValidQuestoes(parsed?.questoes || parsed, {
      tipoProva,
      banca: exam.banca,
      minKeep: 1,
    })
    droppedTotal += dropped
    all.push(...ok)
  }

  if (all.length < Math.min(5, total)) {
    const err = new Error(
      `Poucas questões válidas no formato ${formatTipoProvaLabel(tipoProva)} (${all.length}/${total}).`,
    )
    err.code = 'questoes_invalid'
    throw err
  }

  return {
    questoes: all.slice(0, total).map((q, idx) => ({ ...q, numero: idx + 1 })),
    tipoProva,
    tipoLabel: formatTipoProvaLabel(tipoProva),
    dropped: droppedTotal,
    exam,
  }
}

/**
 * Bloco padrão de cabeçalho + regras de formato para prompts de questões.
 */
export function buildQuestoesExamHeader(examInput = {}) {
  const exam = normalizeExamContext(examInput)
  const tipoLabel = formatTipoProvaLabel(exam.tipoProva)
  return {
    exam,
    tipoProva: exam.tipoProva,
    tipoLabel,
    fidelityBlock: buildExamFidelityBlock(exam),
    formatInstructions: buildTipoProvaInstructions(exam.tipoProva),
    schemaSnippet: buildQuestaoJsonSchemaSnippet(exam.tipoProva),
    isCE: isCertoErradoTipo(exam.tipoProva),
  }
}
