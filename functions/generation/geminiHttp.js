/**
 * HTTP helper para API Gemini (Cloud Functions).
 * Chaves AQ. usam header x-goog-api-key; AIza usam ?key= na URL.
 */

const DEFAULT_GEMINI_TIMEOUT_MS = 120 * 1000
const PROBE_GEMINI_TIMEOUT_MS = 15 * 1000

function usesGoogleApiKeyHeader(apiKey) {
  return String(apiKey || '').trim().startsWith('AQ.')
}

function buildGeminiUrl(model, apiKey, action = 'generateContent') {
  const base = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${action}`
  if (usesGoogleApiKeyHeader(apiKey)) {
    return base
  }
  return `${base}?key=${encodeURIComponent(apiKey)}`
}

function buildGeminiHeaders(apiKey, extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra }
  if (usesGoogleApiKeyHeader(apiKey)) {
    headers['x-goog-api-key'] = apiKey
  }
  return headers
}

/**
 * Fetch Gemini com timeout explícito (evita hang até o timeout da CF).
 * @param {string} model
 * @param {string} apiKey
 * @param {object} body
 * @param {string} [action='generateContent']
 * @param {{ timeoutMs?: number }} [opts]
 */
async function geminiFetch(model, apiKey, body, action = 'generateContent', opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_GEMINI_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(buildGeminiUrl(model, apiKey, action), {
      method: 'POST',
      headers: buildGeminiHeaders(apiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    return response
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutErr = new Error(`Gemini request timeout após ${timeoutMs}ms (${model})`)
      timeoutErr.code = 'gemini_timeout'
      throw timeoutErr
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

module.exports = {
  usesGoogleApiKeyHeader,
  buildGeminiUrl,
  buildGeminiHeaders,
  geminiFetch,
  DEFAULT_GEMINI_TIMEOUT_MS,
  PROBE_GEMINI_TIMEOUT_MS,
}
