/**
 * Secrets apenas no servidor (Node). Nunca importar em código de client/bundle.
 * Aceita nomes novos (GEMINI_API_KEY) e legados (VITE_*) durante a migração.
 *
 * Chaves Gemini extras (rotação só em erro de auth):
 * - GEMINI_API_KEY_2, GEMINI_API_KEY_3, …
 * - ou GEMINI_API_KEYS="key1,key2,key3"
 *
 * Não lista GEMINI_API_KEY + VITE_GEMINI_API_KEY juntos (evita 2× tentativas).
 */

function read(key) {
  if (typeof process === 'undefined' || !process.env) return ''
  const v = process.env[key]
  return v != null && String(v).trim() !== '' ? String(v).trim() : ''
}

function uniqueNonEmpty(values) {
  const out = []
  const seen = new Set()
  for (const raw of values) {
    const v = typeof raw === 'string' ? raw.trim() : ''
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

export function getGeminiApiKeys() {
  // Uma chave principal: GEMINI_API_KEY tem prioridade; VITE_* só se a nova não existir
  const primary = read('GEMINI_API_KEY') || read('VITE_GEMINI_API_KEY')

  const fromList = String(read('GEMINI_API_KEYS') || '')
    .split(/[\n,;|]+/)
    .map((s) => s.trim())
    .filter(Boolean)

  const numbered = []
  for (let i = 2; i <= 10; i += 1) {
    const v = read(`GEMINI_API_KEY_${i}`)
    if (v) numbered.push(v)
  }

  return uniqueNonEmpty([primary, ...numbered, ...fromList])
}

export function getGeminiApiKey() {
  return getGeminiApiKeys()[0] || ''
}

export function getGroqApiKey() {
  return read('GROQ_API_KEY') || read('VITE_GROQ_API_KEY')
}

export function getGoogleSearchApiKey() {
  return read('GOOGLE_SEARCH_API_KEY') || read('VITE_GOOGLE_SEARCH_API_KEY')
}

export function getGoogleSearchEngineId() {
  return read('GOOGLE_SEARCH_ENGINE_ID') || read('VITE_GOOGLE_SEARCH_ENGINE_ID')
}

/** Mensagem amigável quando a Google rejeita a chave. */
export function geminiKeyExpiredUserMessage() {
  return (
    'Chave da API Gemini expirada ou inválida. Gere uma nova em ' +
    'https://aistudio.google.com/apikey e atualize GEMINI_API_KEY ' +
    '(e remova a antiga VITE_GEMINI_API_KEY se ainda existir) no Vercel → Settings → Environment Variables. ' +
    'Depois faça Redeploy. O checkpoint não perde o que já foi salvo — clique Gerar de novo.'
  )
}

export function isGeminiApiKeyError(message) {
  const m = String(message || '').toLowerCase()
  return (
    m.includes('api key expired') ||
    m.includes('api key not valid') ||
    m.includes('api_key_invalid') ||
    m.includes('invalid api key') ||
    m.includes('api key is invalid') ||
    (m.includes('permission denied') && m.includes('api key')) ||
    m.includes('consumer_invalid') ||
    (m.includes('expired') && m.includes('api key'))
  )
}
