import { readEnv } from '../lib/env.js'
import { geminiFetch } from './geminiHttp.js'

export const KEY_BAD_TTL_MS = 15 * 60 * 1000
export const KEY_OK_TTL_MS = 5 * 60 * 1000
export const SILENT_PROBE_MODEL = 'gemini-2.5-flash'

const keyHealth = new Map()

function isValidKey(key) {
  if (!key || typeof key !== 'string') return false
  const trimmed = key.trim()
  if (trimmed.length < 20) return false
  const lower = trimmed.toLowerCase()
  if (
    lower.includes('your-api') ||
    lower.includes('sua-chave') ||
    lower.includes('placeholder') ||
    lower === 'undefined' ||
    lower === 'null'
  ) {
    return false
  }
  return true
}

function readKey(envReader, name) {
  const value = envReader(name)
  return isValidKey(value) ? value.trim() : null
}

/** Coleta todas as chaves Gemini configuradas (principal + numeradas). */
export function collectGeminiApiKeys(envReader = readEnv) {
  const keys = []
  const add = (key) => {
    if (key && !keys.includes(key)) keys.push(key)
  }

  add(readKey(envReader, 'VITE_GEMINI_API_KEY'))
  add(readKey(envReader, 'VITE_GOOGLE_AI_API_KEY'))
  add(readKey(envReader, 'GEMINI_API_KEY'))

  for (let i = 1; i <= 10; i += 1) {
    add(readKey(envReader, `VITE_GEMINI_API_KEY_${i}`))
    add(readKey(envReader, `GEMINI_API_KEY_${i}`))
  }

  return keys
}

export function hasGeminiApiKeys(envReader = readEnv) {
  return collectGeminiApiKeys(envReader).length > 0
}

function getHealth(key) {
  return keyHealth.get(key) || null
}

function isKeyGood(key) {
  const h = getHealth(key)
  return h?.status === 'ok' && h.until > Date.now()
}

function isKeyBad(key) {
  const h = getHealth(key)
  return h?.status === 'bad' && h.until > Date.now()
}

export function markGeminiKeyOk(key) {
  if (!key) return
  keyHealth.set(key, { status: 'ok', until: Date.now() + KEY_OK_TTL_MS })
}

export function markGeminiKeyBad(key) {
  if (!key) return
  keyHealth.set(key, { status: 'bad', until: Date.now() + KEY_BAD_TTL_MS })
}

/** Ordem: chaves OK recentes → demais → chaves marcadas como esgotadas (retry após TTL). */
export function getGeminiKeysInOrder(envReader = readEnv) {
  const all = collectGeminiApiKeys(envReader)
  const good = []
  const neutral = []
  const bad = []

  for (const key of all) {
    if (isKeyGood(key)) good.push(key)
    else if (isKeyBad(key)) bad.push(key)
    else neutral.push(key)
  }

  return [...good, ...neutral, ...bad]
}

export function isInvalidGeminiKeyError(status, message = '') {
  const msg = String(message).toLowerCase()
  return (
    status === 400 ||
    status === 403 ||
    msg.includes('api key not valid') ||
    msg.includes('api_key_invalid') ||
    msg.includes('invalid api key')
  )
}

export function isGeminiQuotaOrUnavailable(status, message = '') {
  const msg = String(message).toLowerCase()
  return (
    status === 429 ||
    status === 503 ||
    isInvalidGeminiKeyError(status, message) ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('resource has been exhausted') ||
    msg.includes('exceeded') ||
    msg.includes('too many requests')
  )
}

/** Teste mínimo e silencioso — não consome quota visível ao usuário. */
export async function silentProbeGeminiKey(apiKey) {
  if (!apiKey) return false
  try {
    const response = await geminiFetch(SILENT_PROBE_MODEL, apiKey, {
      contents: [{ parts: [{ text: 'ok' }] }],
      generationConfig: { maxOutputTokens: 1, temperature: 0 },
    })

    if (response.ok) {
      markGeminiKeyOk(apiKey)
      return true
    }

    if (isGeminiQuotaOrUnavailable(response.status)) {
      markGeminiKeyBad(apiKey)
    }
    return false
  } catch {
    return false
  }
}

/**
 * Executa generateContent com rotação silenciosa entre chaves e modelos.
 * @returns {Promise<{ data: object, apiKey: string, model: string }>}
 */
export async function geminiRequestWithKeyFallback({
  buildBody,
  models = ['gemini-2.5-flash', 'gemini-2.5-pro'],
  envReader = readEnv,
  silent = true,
  probeNextOnFail = true,
}) {
  const keys = getGeminiKeysInOrder(envReader)
  if (!keys.length) {
    throw new Error(
      'Nenhuma API key Gemini configurada. Defina VITE_GEMINI_API_KEY no .env.local ou no Vercel.',
    )
  }

  let lastError = 'Erro desconhecido'

  for (const model of models) {
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      const apiKey = keys[keyIndex]

      const response = await geminiFetch(model, apiKey, buildBody(model))
      const data = await response.json().catch(() => ({}))

      if (response.ok) {
        markGeminiKeyOk(apiKey)
        return { data, apiKey, model }
      }

      lastError = data.error?.message || `HTTP ${response.status}`

      if (isGeminiQuotaOrUnavailable(response.status, lastError)) {
        markGeminiKeyBad(apiKey)
        if (probeNextOnFail) {
          for (let j = keyIndex + 1; j < keys.length; j += 1) {
            const nextKey = keys[j]
            if (isKeyBad(nextKey)) continue
            const ok = await silentProbeGeminiKey(nextKey)
            if (ok) {
              keyIndex = j - 1
              break
            }
          }
        }
        continue
      }

      if (!silent) {
        console.warn(`Gemini falhou (${model}, key ${keyIndex + 1}):`, lastError)
      }
    }
  }

  const err = new Error(`Todas as API keys Gemini falharam. Último erro: ${lastError}`)
  if (isGeminiQuotaOrUnavailable(429, lastError)) err.code = 'quota_exceeded'
  throw err
}
