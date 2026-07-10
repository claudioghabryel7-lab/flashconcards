const functions = require('firebase-functions')
const path = require('path')
const fs = require('fs')
const { geminiFetch } = require('./geminiHttp')

const KEY_BAD_TTL_MS = 15 * 60 * 1000
const KEY_OK_TTL_MS = 5 * 60 * 1000
const SILENT_PROBE_MODEL = 'gemini-2.5-flash'

const keyHealth = new Map()
let rootEnvLoaded = false

function loadRootEnvLocal() {
  if (rootEnvLoaded) return
  rootEnvLoaded = true

  try {
    const envPath = path.join(__dirname, '../../.env.local')
    if (!fs.existsSync(envPath)) return

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
  } catch {
    // ignora falha de leitura em produção
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
    loadRootEnvLocal()
    add(process.env.GEMINI_API_KEY)
    add(process.env.VITE_GEMINI_API_KEY)
    for (let i = 1; i <= 10; i += 1) {
      add(process.env[`GEMINI_API_KEY_${i}`])
      add(process.env[`VITE_GEMINI_API_KEY_${i}`])
    }
  }

  return keys
}

function isKeyGood(key) {
  const h = keyHealth.get(key)
  return h?.status === 'ok' && h.until > Date.now()
}

function isKeyBad(key) {
  const h = keyHealth.get(key)
  return h?.status === 'bad' && h.until > Date.now()
}

function markGeminiKeyOk(key) {
  if (!key) return
  keyHealth.set(key, { status: 'ok', until: Date.now() + KEY_OK_TTL_MS })
}

function markGeminiKeyBad(key) {
  if (!key) return
  keyHealth.set(key, { status: 'bad', until: Date.now() + KEY_BAD_TTL_MS })
}

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

  return [...good, ...neutral, ...bad]
}

function isInvalidGeminiKeyError(status, message = '') {
  const msg = String(message).toLowerCase()
  return (
    status === 400 ||
    status === 403 ||
    msg.includes('api key not valid') ||
    msg.includes('api_key_invalid') ||
    msg.includes('invalid api key')
  )
}

function isGeminiQuotaOrUnavailable(status, message = '') {
  const msg = String(message).toLowerCase()
  return (
    status === 429 ||
    status === 503 ||
    isInvalidGeminiKeyError(status, message) ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('resource has been exhausted') ||
    msg.includes('exceeded') ||
    msg.includes('too many requests')
  )
}

async function silentProbeGeminiKey(apiKey) {
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

async function geminiRequestWithKeyFallback({
  buildBody,
  models = ['gemini-2.5-flash', 'gemini-2.5-pro'],
  probeNextOnFail = true,
}) {
  const keys = getGeminiKeysInOrder()
  if (!keys.length) {
    throw new Error(
      'GEMINI_API_KEY não configurada nas Cloud Functions. Rode `npm run sync:gemini-env` e faça deploy.',
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
    }
  }

  throw new Error(lastError)
}

module.exports = {
  collectGeminiApiKeys,
  geminiRequestWithKeyFallback,
  silentProbeGeminiKey,
  getGeminiKeysInOrder,
}
