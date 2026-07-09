/**
 * HTTP helper para API Gemini (Cloud Functions).
 * Chaves AQ. usam header x-goog-api-key; AIza usam ?key= na URL.
 */

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

async function geminiFetch(model, apiKey, body, action = 'generateContent') {
  return fetch(buildGeminiUrl(model, apiKey, action), {
    method: 'POST',
    headers: buildGeminiHeaders(apiKey),
    body: JSON.stringify(body),
  })
}

module.exports = {
  usesGoogleApiKeyHeader,
  buildGeminiUrl,
  buildGeminiHeaders,
  geminiFetch,
}
