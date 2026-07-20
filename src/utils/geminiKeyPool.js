import { readEnv } from '../lib/env.js'
import { geminiFetch } from './geminiHttp.js'

export const KEY_RATE_LIMIT_TTL_MS = 20 * 1000
/** Quota dura (free_tier / billing) — bloqueio curto o bastante para retomar quando o crédito existe */
export const KEY_QUOTA_TTL_MS = 90 * 1000
export const KEY_INVALID_TTL_MS = 24 * 60 * 60 * 1000
export const KEY_BAD_TTL_MS = KEY_QUOTA_TTL_MS
export const KEY_OK_TTL_MS = 5 * 60 * 1000
export const SILENT_PROBE_MODEL = 'gemini-2.5-flash'
export const GEMINI_MOTHER_KEY_LABEL = 'CHAVE MOTHER'
const RATE_LIMIT_RETRIES = 3

const MOTHER_ENV_NAMES = ['VITE_GEMINI_API_KEY_MAE', 'GEMINI_API_KEY_MAE']

/** @type {Map<string, { status: string, reason?: string, until: number }>} */
const keyHealth = new Map()
/** Contagem de uso simultâneo por chave. */
const keyInUse = new Map()
let rrCursor = 0

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

/** Chave reserva — só usada quando todas as demais falharem (CHAVE MOTHER). */
export function collectMotherGeminiApiKey(envReader = readEnv) {
  for (const name of MOTHER_ENV_NAMES) {
    const key = readKey(envReader, name)
    if (key) return key
  }
  return null
}

/** Lista rotulada para painel de status (regulares + MÃE por último). */
export function listGeminiApiKeyEntries(envReader = readEnv) {
  const entries = []
  const seen = new Set()
  const add = (label, name) => {
    const key = readKey(envReader, name)
    if (!key || seen.has(key)) return
    seen.add(key)
    entries.push({ key, label })
  }

  add('VITE_GEMINI_API_KEY (Principal)', 'VITE_GEMINI_API_KEY')
  add('VITE_GOOGLE_AI_API_KEY', 'VITE_GOOGLE_AI_API_KEY')
  for (let i = 1; i <= 10; i += 1) {
    add(`VITE_GEMINI_API_KEY_${i}`, `VITE_GEMINI_API_KEY_${i}`)
  }

  const mother = collectMotherGeminiApiKey(envReader)
  if (mother && !seen.has(mother)) {
    entries.push({ key: mother, label: GEMINI_MOTHER_KEY_LABEL })
  }
  return entries
}

export function hasGeminiApiKeys(envReader = readEnv) {
  return collectGeminiApiKeys(envReader).length > 0 || Boolean(collectMotherGeminiApiKey(envReader))
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

export function isKeyUnavailable(key) {
  return isKeyBad(key)
}

function ttlForReason(reason) {
  if (reason === 'invalid') return KEY_INVALID_TTL_MS
  if (reason === 'rate_limit') return KEY_RATE_LIMIT_TTL_MS
  return KEY_QUOTA_TTL_MS
}

export function markGeminiKeyOk(key) {
  if (!key) return
  keyHealth.set(key, { status: 'ok', until: Date.now() + KEY_OK_TTL_MS })
}

export function markGeminiKeyBad(key, reason = 'quota') {
  if (!key) return
  const normalized =
    reason === 'invalid' || reason === 'rate_limit' || reason === 'quota' ? reason : 'quota'
  keyHealth.set(key, {
    status: 'bad',
    reason: normalized,
    until: Date.now() + ttlForReason(normalized),
  })
}

function acquireGeminiKey(key) {
  if (!key) return
  keyInUse.set(key, (keyInUse.get(key) || 0) + 1)
}

function releaseGeminiKey(key) {
  if (!key) return
  const n = (keyInUse.get(key) || 1) - 1
  if (n <= 0) keyInUse.delete(key)
  else keyInUse.set(key, n)
}

function sortByLeastInUse(keys) {
  return [...keys].sort((a, b) => (keyInUse.get(a) || 0) - (keyInUse.get(b) || 0))
}

/** Ordem: OK → neutras (round-robin) → bad (último recurso). Prioriza menos uso simultâneo. */
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

  const rotate = (list) => {
    if (list.length <= 1) return list
    const start = rrCursor % list.length
    rrCursor += 1
    return [...list.slice(start), ...list.slice(0, start)]
  }

  return [
    ...sortByLeastInUse(good),
    ...sortByLeastInUse(rotate(neutral)),
    ...sortByLeastInUse(bad),
  ]
}

/** Só chaves livres agora (não ocupadas/expiradas/inválidas no TTL). */
export function getAvailableGeminiKeysInOrder(envReader = readEnv) {
  return getGeminiKeysInOrder(envReader).filter((key) => !isKeyUnavailable(key))
}

export function isInvalidGeminiKeyError(status, message = '') {
  const msg = String(message).toLowerCase()
  if (
    msg.includes('api key not valid') ||
    msg.includes('api_key_invalid') ||
    msg.includes('invalid api key') ||
    msg.includes('api key expired') ||
    (msg.includes('expired') && msg.includes('api')) ||
    msg.includes('api_key_service_blocked')
  ) {
    return true
  }
  if (status === 403 && (msg.includes('api') || msg.includes('permission') || msg.includes('blocked'))) {
    return true
  }
  if (status === 400 && (!msg || msg.includes('key') || msg.includes('api'))) {
    return true
  }
  return false
}

export function classifyGeminiKeyFailure(status, message = '') {
  const msg = String(message).toLowerCase()
  if (isInvalidGeminiKeyError(status, message)) return 'invalid'

  // Free tier explícito / billing desligado → quota dura
  const hardQuota =
    msg.includes('free_tier') ||
    msg.includes('free tier') ||
    msg.includes('generate_content_free_tier') ||
    (msg.includes('billing') && (msg.includes('disabled') || msg.includes('not enabled'))) ||
    msg.includes('require billing') ||
    msg.includes('billing account')

  if (hardQuota) return 'quota'

  // 429 / RESOURCE_EXHAUSTED na prática costuma ser RPM/TPM (mesmo com crédito).
  // Tratar como rate_limit com retry curto — NÃO como "limite gratuito".
  if (
    status === 429 ||
    status === 503 ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('too many requests') ||
    msg.includes('resource has been exhausted') ||
    msg.includes('resource_exhausted') ||
    msg.includes('exceeded your current quota') ||
    msg.includes('quota exceeded') ||
    (msg.includes('quota') && (status === 429 || status === 503 || !status))
  ) {
    return 'rate_limit'
  }

  return null
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function backoffMs(attempt, retryAfterHeader) {
  const fromHeader = Number(retryAfterHeader)
  if (Number.isFinite(fromHeader) && fromHeader > 0) {
    return Math.min(30_000, Math.max(1000, fromHeader * 1000))
  }
  // 2s, 4s, 8s (+ jitter leve)
  return Math.min(20_000, 2000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 400))
}

export function isGeminiQuotaOrUnavailable(status, message = '') {
  return Boolean(classifyGeminiKeyFailure(status, message))
}

/** Teste mínimo e silencioso — não consome quota visível ao usuário. */
export async function silentProbeGeminiKey(apiKey) {
  if (!apiKey) return false
  if (isKeyUnavailable(apiKey)) return false
  try {
    const response = await geminiFetch(SILENT_PROBE_MODEL, apiKey, {
      contents: [{ parts: [{ text: 'ok' }] }],
      generationConfig: { maxOutputTokens: 1, temperature: 0 },
    })

    if (response.ok) {
      markGeminiKeyOk(apiKey)
      return true
    }

    const errBody = await response.json().catch(() => ({}))
    const msg = errBody?.error?.message || `HTTP ${response.status}`
    const reason = classifyGeminiKeyFailure(response.status, msg)
    if (reason) markGeminiKeyBad(apiKey, reason)
    return false
  } catch {
    return false
  }
}

/**
 * Executa generateContent com rotação silenciosa entre chaves e modelos.
 * Se uma chave estiver ocupada (rate limit) ou expirada/inválida, pula para a próxima.
 * @returns {Promise<{ data: object, apiKey: string, model: string }>}
 */
export async function geminiRequestWithKeyFallback({
  buildBody,
  models = ['gemini-2.5-flash', 'gemini-2.5-pro'],
  envReader = readEnv,
  silent = true,
  // Com 1 chave, probe de outras só gasta quota. Default off.
  probeNextOnFail = false,
}) {
  const motherKey = collectMotherGeminiApiKey(envReader)
  const allKeys = collectGeminiApiKeys(envReader)
  if (!allKeys.length && !motherKey) {
    throw new Error(
      'Nenhuma API key Gemini configurada. Defina VITE_GEMINI_API_KEY no .env.local ou no Vercel.',
    )
  }

  let lastError = 'Erro desconhecido'
  let lastWasKeyFailure = false
  const triedPairs = new Set()

  const tryKeys = async (keys, allowBad = false) => {
    for (const model of models) {
      for (const apiKey of keys) {
        if (!allowBad && isKeyUnavailable(apiKey)) continue
        const pair = `${model}::${apiKey}`
        if (triedPairs.has(pair)) continue
        triedPairs.add(pair)

        acquireGeminiKey(apiKey)
        try {
          for (let attempt = 1; attempt <= RATE_LIMIT_RETRIES; attempt += 1) {
            const response = await geminiFetch(model, apiKey, buildBody(model))
            const data = await response.json().catch(() => ({}))

            if (response.ok) {
              markGeminiKeyOk(apiKey)
              return { data, apiKey, model }
            }

            lastError = data.error?.message || `HTTP ${response.status}`
            const reason = classifyGeminiKeyFailure(response.status, lastError)

            if (reason === 'rate_limit' && attempt < RATE_LIMIT_RETRIES) {
              const wait = backoffMs(attempt, response.headers?.get?.('retry-after'))
              if (!silent) {
                console.warn(
                  `Gemini rate limit (${model}) — aguardando ${Math.round(wait / 1000)}s (tentativa ${attempt}/${RATE_LIMIT_RETRIES})…`,
                )
              }
              // Bloqueio curto só durante o wait; não marca quota dura
              markGeminiKeyBad(apiKey, 'rate_limit')
              await sleep(wait)
              continue
            }

            if (reason) {
              lastWasKeyFailure = true
              markGeminiKeyBad(apiKey, reason)
              if (!silent) {
                console.warn(`Gemini key falhou (${reason}, ${model}):`, lastError)
              }
              if (probeNextOnFail) {
                for (const nextKey of getAvailableGeminiKeysInOrder(envReader)) {
                  if (nextKey === apiKey || triedPairs.has(`${model}::${nextKey}`)) continue
                  const ok = await silentProbeGeminiKey(nextKey)
                  if (ok) break
                }
              }
              break
            }

            if (!silent) {
              console.warn(`Gemini falhou (${model}):`, lastError)
            }
            break
          }
        } finally {
          releaseGeminiKey(apiKey)
        }
      }
    }
    return null
  }

  // Inclui MOTHER no final da rotação principal (não só depois do erro)
  const ordered = getAvailableGeminiKeysInOrder(envReader)
  if (motherKey && !ordered.includes(motherKey) && !isKeyUnavailable(motherKey)) {
    ordered.push(motherKey)
  }

  let result = await tryKeys(ordered, false)
  if (result) return result

  const retryAll = getGeminiKeysInOrder(envReader)
  if (motherKey && !retryAll.includes(motherKey)) retryAll.push(motherKey)
  result = await tryKeys(retryAll, true)
  if (result) return result

  const reason = classifyGeminiKeyFailure(429, lastError)
  const err = new Error(`Todas as API keys Gemini falharam. Último erro: ${lastError}`)
  err.code = reason === 'quota' ? 'quota_exceeded' : reason === 'rate_limit' ? 'rate_limited' : 'gemini_failed'
  err.geminiReason = reason
  throw err
}
