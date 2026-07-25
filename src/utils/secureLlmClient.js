/**
 * Cliente LLM seguro: browser → rotas /api/* autenticadas (key só no servidor).
 */
import { auth } from '../firebase/config'

async function getIdToken() {
  const user = auth?.currentUser
  if (!user) {
    const err = new Error('Faça login para usar a IA.')
    err.code = 'auth_required'
    throw err
  }
  return user.getIdToken()
}

async function authFetch(url, body, { method = 'POST' } = {}) {
  const token = await getIdToken()
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const err = new Error(data.error || `Erro na API (${response.status})`)
    err.status = response.status
    err.code = data.code || null
    throw err
  }
  return data
}

/** Proxy Gemini (generateContent shape). */
export async function callGeminiProxy(options = {}) {
  return authFetch('/api/gemini/generate', options)
}

/** Lista modelos (sem expor key). */
export async function listGeminiModelsProxy() {
  const token = await getIdToken()
  const response = await fetch('/api/gemini/models', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || `Erro ao listar modelos (${response.status})`)
  }
  return data
}

/** Proxy Groq chat completions. */
export async function callGroqProxy({
  messages,
  model = 'llama-3.3-70b-versatile',
  temperature = 0.7,
  max_tokens = 2000,
  system,
} = {}) {
  return authFetch('/api/groq/generate', {
    messages,
    model,
    temperature,
    max_tokens,
    system,
  })
}

/** Proxy Google Custom Search. */
export async function googleSearchProxy(query, numResults = 5) {
  return authFetch('/api/google-search', { query, numResults })
}

/** Texto gerado a partir da resposta Gemini (REST). */
export function extractGeminiProxyText(data) {
  const parts = data?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts.map((p) => p?.text || '').join('')
}
