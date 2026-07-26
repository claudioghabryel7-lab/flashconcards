/**
 * Secrets / config apenas no servidor (Node). Nunca importar em código de client/bundle.
 * Aceita nomes novos (GEMINI_API_KEY) e legados (VITE_*) durante a migração.
 *
 * LLM principal = IA local (Ollama no PC). Gemini ficou opcional/legado.
 */

function read(key) {
  if (typeof process === 'undefined' || !process.env) return ''
  const v = process.env[key]
  return v != null && String(v).trim() !== '' ? String(v).trim() : ''
}

/** URL base do Ollama no PC (ou túnel público apontando para o PC). */
export function getOllamaBaseUrl() {
  return read('OLLAMA_BASE_URL') || 'http://localhost:11434'
}

/** Modelo principal no Ollama (ex.: phi, llama3.2, qwen2.5:14b). */
export function getOllamaModel() {
  return read('OLLAMA_MODEL') || read('VITE_GEMINI_MODEL') || 'phi'
}

/**
 * Modo raw do Ollama (sem template de chat).
 * Phi-2 costuma devolver vazio sem raw=true.
 * OLLAMA_RAW=true|false — se vazio, auto para modelos "phi".
 */
export function getOllamaRaw(model) {
  const forced = read('OLLAMA_RAW').toLowerCase()
  if (forced === 'true' || forced === '1' || forced === 'yes') return true
  if (forced === 'false' || forced === '0' || forced === 'no') return false
  const name = String(model || getOllamaModel() || '').toLowerCase()
  return name.includes('phi')
}

/**
 * Cadeia de modelos Ollama (ordem de tentativa).
 * OLLAMA_MODELS=modelo1,modelo2  — opcional.
 */
export function getOllamaModels() {
  const list = read('OLLAMA_MODELS')
  if (list) {
    return list
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  const primary = getOllamaModel()
  return primary ? [primary] : []
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
