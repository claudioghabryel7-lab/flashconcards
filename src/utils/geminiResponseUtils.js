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
 * Detecta JSON cortado no meio (chaves/colchetes abertos) — comum no Lite
 * quando finishReason=STOP mas o conteúdo ficou pela metade.
 */
export function isLikelyIncompleteJsonText(text = '') {
  const cleaned = String(text || '')
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim()
  if (!cleaned) return true

  let depth = 0
  let inString = false
  let escape = false
  let started = false

  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i]
    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        escape = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{' || ch === '[') {
      depth += 1
      started = true
      continue
    }
    if (ch === '}' || ch === ']') {
      depth -= 1
    }
  }

  if (inString) return true
  if (!started) return true
  return depth !== 0
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
