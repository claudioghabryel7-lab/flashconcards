/**
 * Secrets apenas no servidor (Node). Nunca importar em código de client/bundle.
 * Aceita nomes novos (GEMINI_API_KEY) e legados (VITE_*) durante a migração.
 */

function read(key) {
  if (typeof process === 'undefined' || !process.env) return ''
  const v = process.env[key]
  return v != null && String(v).trim() !== '' ? String(v).trim() : ''
}

export function getGeminiApiKey() {
  return read('GEMINI_API_KEY') || read('VITE_GEMINI_API_KEY')
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
