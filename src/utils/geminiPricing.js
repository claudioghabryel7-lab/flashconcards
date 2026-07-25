/**
 * Preços estimados Gemini (USD por 1M tokens) — tabela editável.
 * Fonte aproximada: Google AI pricing (jul/2026). Ajuste se a Google mudar tarifas.
 */

/** @typedef {{ inputPer1M: number, outputPer1M: number }} ModelPrice */

/** @type {Record<string, ModelPrice>} */
export const GEMINI_PRICE_PER_1M = {
  'gemini-3.6-flash': { inputPer1M: 1.5, outputPer1M: 7.5 },
  'gemini-3.5-flash': { inputPer1M: 1.5, outputPer1M: 9.0 },
  'gemini-3.1-pro-preview': { inputPer1M: 2.0, outputPer1M: 12.0 },
  'gemini-3.1-pro': { inputPer1M: 2.0, outputPer1M: 12.0 },
  'gemini-2.5-flash': { inputPer1M: 0.3, outputPer1M: 2.5 },
  'gemini-2.5-pro': { inputPer1M: 1.25, outputPer1M: 10.0 },
  'gemini-flash-latest': { inputPer1M: 1.5, outputPer1M: 7.5 },
  'gemini-pro-latest': { inputPer1M: 2.0, outputPer1M: 12.0 },
}

const DEFAULT_PRICE = { inputPer1M: 1.5, outputPer1M: 7.5 }

export function getModelPrice(model = '') {
  const key = String(model || '').trim().toLowerCase()
  if (GEMINI_PRICE_PER_1M[key]) return GEMINI_PRICE_PER_1M[key]
  // match parcial (ex.: models/gemini-3.6-flash)
  for (const [name, price] of Object.entries(GEMINI_PRICE_PER_1M)) {
    if (key.includes(name)) return price
  }
  return DEFAULT_PRICE
}

/**
 * Estima custo USD a partir do usageMetadata do Gemini.
 * @param {object} usage
 * @param {string} model
 */
export function estimateGeminiUsd(usage = {}, model = '') {
  const prompt = Number(usage.promptTokenCount || usage.prompt_token_count || 0) || 0
  const candidates =
    Number(usage.candidatesTokenCount || usage.candidates_token_count || 0) || 0
  const thoughts =
    Number(usage.thoughtsTokenCount || usage.thoughts_token_count || 0) || 0
  // thinking tokens cobrados como output na tabela Google
  const output = candidates + thoughts
  const total =
    Number(usage.totalTokenCount || usage.total_token_count || 0) || prompt + output

  const { inputPer1M, outputPer1M } = getModelPrice(model)
  const usd = (prompt / 1_000_000) * inputPer1M + (output / 1_000_000) * outputPer1M

  return {
    promptTokens: prompt,
    candidatesTokens: candidates,
    thoughtsTokens: thoughts,
    outputTokens: output,
    totalTokens: total,
    estimatedUsd: Number(usd.toFixed(6)),
    inputPer1M,
    outputPer1M,
  }
}

export function formatUsd(value) {
  const n = Number(value) || 0
  if (n < 0.01 && n > 0) return `US$ ${n.toFixed(4)}`
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function formatTokens(n) {
  const v = Number(n) || 0
  return v.toLocaleString('pt-BR')
}

export function todayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
