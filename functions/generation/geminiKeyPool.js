const functions = require('firebase-functions')
const path = require('path')
const fs = require('fs')
const { geminiFetch, PROBE_GEMINI_TIMEOUT_MS } = require('./geminiHttp')

const KEY_RATE_LIMIT_TTL_MS = 45 * 1000
const KEY_QUOTA_TTL_MS = 15 * 60 * 1000
const KEY_INVALID_TTL_MS = 24 * 60 * 60 * 1000
const KEY_OK_TTL_MS = 5 * 60 * 1000
const SILENT_PROBE_MODEL = 'gemini-2.5-flash'
const GEMINI_MOTHER_KEY_LABEL = 'CHAVE MOTHER'

const MOTHER_ENV_NAMES = ['GEMINI_API_KEY_MAE', 'VITE_GEMINI_API_KEY_MAE']

/** @type {Map<string, { status: string, reason?: string, until: number }>} */
const keyHealth = new Map()
/** Contagem de uso simultâneo por chave (round-robin entre jobs). */
const keyInUse = new Map()
let rootEnvLoaded = false
let rrCursor = 0

function loadRootEnvLocal() {
  if (rootEnvLoaded) return
  rootEnvLoaded = true

  const candidates = [
    path.join(__dirname, '../../.env.local'),
    path.join(__dirname, '../../.env'),
  ]

  for (const envPath of candidates) {
    try {
      if (!fs.existsSync(envPath)) continue

      const content = fs.readFileSync(envPath, 'utf8')
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eq = trimmed.indexOf('=')
        if (eq <= 0) continue
        const key = trimmed.slice(0, eq).trim()
        let val = trimmed.slice(eq + 1).trim()
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1)
        }
        if (!process.env[key]) process.env[key] = val
      }
      return
    } catch {
      // tenta próximo arquivo
    }
  }
}

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

function readKey(name) {
  const value = process.env[name]
  return isValidKey(value) ? value.trim() : null
}

function collectGeminiApiKeys() {
  const keys = []
  const add = (key) => {
    if (isValidKey(key) && !keys.includes(key.trim())) keys.push(key.trim())
  }

  const cfg = functions.config().gemini || {}
  add(cfg.api_key)
  add(process.env.GEMINI_API_KEY)
  add(process.env.VITE_GEMINI_API_KEY)

  for (let i = 1; i <= 10; i += 1) {
    add(cfg[`api_key_${i}`])
    add(process.env[`GEMINI_API_KEY_${i}`])
    add(process.env[`VITE_GEMINI_API_KEY_${i}`])
  }

  if (!keys.length) {
    if (!rootEnvLoaded) loadRootEnvLocal()
    add(process.env.GEMINI_API_KEY)
    add(process.env.VITE_GEMINI_API_KEY)
    for (let i = 1; i <= 10; i += 1) {
      add(process.env[`GEMINI_API_KEY_${i}`])
      add(process.env[`VITE_GEMINI_API_KEY_${i}`])
    }
  }

  return keys
}

function collectMotherGeminiApiKey() {
  const cfg = functions.config().gemini || {}
  if (isValidKey(cfg.api_key_mae)) return cfg.api_key_mae.trim()
  for (const name of MOTHER_ENV_NAMES) {
    const key = readKey(name)
    if (key) return key
  }
  loadRootEnvLocal()
  for (const name of MOTHER_ENV_NAMES) {
    const key = readKey(name)
    if (key) return key
  }
  return null
}

function isKeyGood(key) {
  const h = keyHealth.get(key)
  return h?.status === 'ok' && h.until > Date.now()
}

function isKeyBad(key) {
  const h = keyHealth.get(key)
  return h?.status === 'bad' && h.until > Date.now()
}

function isKeyUnavailable(key) {
  return isKeyBad(key)
}

function ttlForReason(reason) {
  if (reason === 'invalid') return KEY_INVALID_TTL_MS
  if (reason === 'rate_limit') return KEY_RATE_LIMIT_TTL_MS
  return KEY_QUOTA_TTL_MS
}

function markGeminiKeyOk(key) {
  if (!key) return
  keyHealth.set(key, { status: 'ok', until: Date.now() + KEY_OK_TTL_MS })
}

function markGeminiKeyBad(key, reason = 'quota') {
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

/**
 * Ordem preferencial: OK recentes → neutras (round-robin) → bad (só como último recurso).
 * Dentro de cada grupo, prioriza chaves com menos uso simultâneo.
 */
function getGeminiKeysInOrder() {
  const all = collectGeminiApiKeys()
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

/** Só chaves que não estão marcadas como ocupadas/expiradas/invalidas agora. */
function getAvailableGeminiKeysInOrder() {
  return getGeminiKeysInOrder().filter((key) => !isKeyUnavailable(key))
}

function isInvalidGeminiKeyError(status, message = '') {
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
  // Probe/listagem: 400 sem corpo útil quase sempre é chave inválida
  if (status === 400 && (!msg || msg.includes('key') || msg.includes('api'))) {
    return true
  }
  return false
}

function classifyGeminiKeyFailure(status, message = '') {
  const msg = String(message).toLowerCase()
  if (isInvalidGeminiKeyError(status, message)) return 'invalid'
  if (
    status === 429 ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('too many requests')
  ) {
    if (
      msg.includes('quota') ||
      msg.includes('billing') ||
      msg.includes('exceeded your current quota') ||
      msg.includes('free_tier')
    ) {
      return 'quota'
    }
    return 'rate_limit'
  }
  if (
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    msg.includes('internal') ||
    msg.includes('unavailable') ||
    msg.includes('overloaded') ||
    msg.includes('deadline')
  ) {
    return 'rate_limit'
  }
  if (
    msg.includes('quota') ||
    msg.includes('resource has been exhausted') ||
    msg.includes('exceeded') ||
    status === 503
  ) {
    if (status === 503) return 'rate_limit'
    return 'quota'
  }
  return null
}

function isGeminiQuotaOrUnavailable(status, message = '') {
  return Boolean(classifyGeminiKeyFailure(status, message))
}

async function silentProbeGeminiKey(apiKey) {
  if (!apiKey) return false
  if (isKeyUnavailable(apiKey)) return false
  try {
    const response = await geminiFetch(
      SILENT_PROBE_MODEL,
      apiKey,
      {
        contents: [{ parts: [{ text: 'ok' }] }],
        generationConfig: { maxOutputTokens: 1, temperature: 0 },
      },
      'generateContent',
      { timeoutMs: PROBE_GEMINI_TIMEOUT_MS },
    )

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

async function geminiRequestWithKeyFallback({
  buildBody,
  models = ['gemini-2.5-flash', 'gemini-2.5-pro'],
  // Com 1 chave, probe de outras só gasta quota. Default off.
  probeNextOnFail = false,
}) {
  const motherKey = collectMotherGeminiApiKey()
  const allKeys = collectGeminiApiKeys()
  if (!allKeys.length && !motherKey) {
    throw new Error(
      'GEMINI_API_KEY não configurada nas Cloud Functions. Rode `npm run sync:gemini-env` e faça deploy.',
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
          const response = await geminiFetch(model, apiKey, buildBody(model))
          const data = await response.json().catch(() => ({}))

          if (response.ok) {
            markGeminiKeyOk(apiKey)
            return { data, apiKey, model }
          }

          lastError = data.error?.message || `HTTP ${response.status}`
          const reason = classifyGeminiKeyFailure(response.status, lastError)
          if (reason) {
            lastWasKeyFailure = true
            markGeminiKeyBad(apiKey, reason)
            if (probeNextOnFail) {
              for (const nextKey of getAvailableGeminiKeysInOrder()) {
                if (nextKey === apiKey || triedPairs.has(`${model}::${nextKey}`)) continue
                const ok = await silentProbeGeminiKey(nextKey)
                if (ok) break
              }
            }
          }
          // Qualquer falha HTTP → tenta próxima chave/modelo
          continue
        } catch (fetchErr) {
          lastError = fetchErr?.message || String(fetchErr)
          lastWasKeyFailure = true
          // Rede/timeout: marca rate_limit curto e segue
          markGeminiKeyBad(apiKey, 'rate_limit')
          continue
        } finally {
          releaseGeminiKey(apiKey)
        }
      }
    }
    return null
  }

  // 1) Preferir chaves disponíveis (não ocupadas / não expiradas)
  let result = await tryKeys(getAvailableGeminiKeysInOrder(), false)
  if (result) return result

  // 2) Se nenhuma disponível, tentar as restantes (TTL pode ter expirado no meio)
  result = await tryKeys(getGeminiKeysInOrder(), true)
  if (result) return result

  // 3) CHAVE MOTHER
  if (motherKey && !allKeys.includes(motherKey)) {
    for (const model of models) {
      if (isKeyUnavailable(motherKey)) break
      acquireGeminiKey(motherKey)
      try {
        const response = await geminiFetch(model, motherKey, buildBody(model))
        const data = await response.json().catch(() => ({}))
        if (response.ok) {
          markGeminiKeyOk(motherKey)
          return { data, apiKey: motherKey, model, keyLabel: GEMINI_MOTHER_KEY_LABEL }
        }
        lastError = data.error?.message || `HTTP ${response.status}`
        const reason = classifyGeminiKeyFailure(response.status, lastError)
        if (reason) {
          lastWasKeyFailure = true
          markGeminiKeyBad(motherKey, reason)
        }
      } finally {
        releaseGeminiKey(motherKey)
      }
    }
    lastError = `${lastError} (${GEMINI_MOTHER_KEY_LABEL} também falhou)`
  }

  const err = new Error(lastError)
  if (lastWasKeyFailure || isGeminiQuotaOrUnavailable(429, lastError)) {
    err.code = 'api_quota_exhausted'
  }
  throw err
}

module.exports = {
  collectGeminiApiKeys,
  collectMotherGeminiApiKey,
  geminiRequestWithKeyFallback,
  silentProbeGeminiKey,
  getGeminiKeysInOrder,
  getAvailableGeminiKeysInOrder,
  markGeminiKeyOk,
  markGeminiKeyBad,
  isKeyUnavailable,
  isGeminiQuotaOrUnavailable,
  classifyGeminiKeyFailure,
  GEMINI_MOTHER_KEY_LABEL,
}
