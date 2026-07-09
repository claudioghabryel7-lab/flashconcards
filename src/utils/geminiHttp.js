/**
 * HTTP helper para API Gemini — suporta chaves legadas (AIza…) e novas (AQ.…).
 * Chaves AQ. usam header x-goog-api-key; AIza usam ?key= na URL.
 */

export function usesGoogleApiKeyHeader(apiKey) {
  return String(apiKey || '').trim().startsWith('AQ.')
}

export function buildGeminiUrl(model, apiKey, action = 'generateContent') {
  const base = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${action}`
  if (usesGoogleApiKeyHeader(apiKey)) {
    return base
  }
  return `${base}?key=${encodeURIComponent(apiKey)}`
}

export function buildGeminiHeaders(apiKey, extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra }
  if (usesGoogleApiKeyHeader(apiKey)) {
    headers['x-goog-api-key'] = apiKey
  }
  return headers
}

export async function geminiFetch(model, apiKey, body, action = 'generateContent') {
  return fetch(buildGeminiUrl(model, apiKey, action), {
    method: 'POST',
    headers: buildGeminiHeaders(apiKey),
    body: JSON.stringify(body),
  })
}
