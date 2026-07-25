/**
 * Helpers leves de resposta Gemini (sem side-effects / sem imports de client).
 * Usado pelo proxy /api e por geminiApi.js.
 */

export function getGeminiFinishReason(response) {
  return String(response?.candidates?.[0]?.finishReason || response?.candidates?.[0]?.finish_reason || '')
}

export function wasGeminiTruncated(response) {
  const reason = getGeminiFinishReason(response).toUpperCase()
  return reason === 'MAX_TOKENS' || reason === 'LENGTH'
}

/**
 * Junta partes de texto úteis (ignora thought/reasoning do Flash-Lite).
 */
export function collectGeminiTextParts(response, { includeThoughts = false } = {}) {
  const parts = response?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts) || !parts.length) return ''

  const chunks = []
  for (const part of parts) {
    if (!part || typeof part.text !== 'string') continue
    const isThought = part.thought === true
    if (isThought && !includeThoughts) continue
    const text = part.text.trim()
    if (text) chunks.push(text)
  }

  if (!chunks.length && includeThoughts === false) {
    for (const part of parts) {
      if (part?.text && String(part.text).trim()) chunks.push(String(part.text).trim())
    }
  }

  return chunks.join('\n').trim()
}

export function hasUsableGeminiText(response) {
  return Boolean(collectGeminiTextParts(response))
}

/** thinkingConfig mínimo — Lite/Flash 3.x às vezes zeram o texto por thinking. */
export function withLiteThinkingConfig(generationConfig = {}, model = '') {
  const cfg = { ...(generationConfig || {}) }
  const name = String(model || '')
  if (cfg.thinkingConfig) return cfg
  if (name.includes('lite') || name.includes('flash')) {
    cfg.thinkingConfig = { thinkingLevel: 'minimal' }
  }
  return cfg
}
