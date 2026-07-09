const functions = require('firebase-functions')
const path = require('path')
const fs = require('fs')
const { jsonrepair } = require('jsonrepair')
const { geminiFetch } = require('./geminiHttp')

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro']

const DEFAULT_GENERATION_CONFIG = {
  temperature: 0.35,
  maxOutputTokens: 32000,
}

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

function loadApiKeys() {
  const keys = []
  const cfg = functions.config().gemini || {}

  const addKey = (key) => {
    const trimmed = String(key || '').trim()
    if (isValidKey(trimmed) && !keys.includes(trimmed)) keys.push(trimmed)
  }

  addKey(cfg.api_key)
  addKey(process.env.GEMINI_API_KEY)
  addKey(process.env.VITE_GEMINI_API_KEY)

  for (let i = 1; i <= 10; i += 1) {
    addKey(cfg[`api_key_${i}`])
    addKey(process.env[`GEMINI_API_KEY_${i}`])
    addKey(process.env[`VITE_GEMINI_API_KEY_${i}`])
  }

  if (!keys.length) {
    loadRootEnvLocal()
    addKey(process.env.GEMINI_API_KEY)
    addKey(process.env.VITE_GEMINI_API_KEY)
    for (let i = 1; i <= 10; i += 1) {
      addKey(process.env[`GEMINI_API_KEY_${i}`])
      addKey(process.env[`VITE_GEMINI_API_KEY_${i}`])
    }
  }

  return keys
}

function isInvalidApiKeyError(status, message = '') {
  const msg = String(message).toLowerCase()
  return (
    status === 400 ||
    status === 403 ||
    msg.includes('api key not valid') ||
    msg.includes('api_key_invalid') ||
    msg.includes('invalid api key')
  )
}

function stripConversationalWrapper(text = '') {
  const cleaned = String(text).trim()
  const start = cleaned.search(/[\[{]/)
  if (start > 0) return cleaned.slice(start)
  return cleaned
}

function extractGeneratedText(response) {
  const parts = response?.candidates?.[0]?.content?.parts || []
  return parts.map((p) => p.text || '').join('').trim()
}

async function parseAiJsonText(generatedText) {
  if (!generatedText || typeof generatedText !== 'string') {
    throw new Error('Texto da IA inválido')
  }

  const cleaned = stripConversationalWrapper(
    generatedText
      .replace(/```json\s*/gi, '')
      .replace(/```/g, '')
      .trim(),
  )

  const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
  if (!jsonMatch) {
    throw new Error('JSON não encontrado na resposta da IA')
  }

  const raw = jsonMatch[0]
  const attempts = [
    (s) => JSON.parse(s),
    (s) => JSON.parse(jsonrepair(s)),
    (s) => JSON.parse(s.replace(/,\s*([}\]])/g, '$1').replace(/[\u0000-\u001F]+/g, ' ')),
  ]

  let lastError
  for (const attempt of attempts) {
    try {
      return attempt(raw)
    } catch (err) {
      lastError = err
    }
  }

  throw lastError || new Error('Não foi possível reparar o JSON da resposta')
}

async function callGemini(prompt, options = {}) {
  const apiKeys = loadApiKeys()
  if (!apiKeys.length) {
    throw new Error(
      'GEMINI_API_KEY não configurada nas Cloud Functions. Rode `npm run sync:gemini-env` e faça deploy das functions.',
    )
  }

  const generationConfig = {
    ...DEFAULT_GENERATION_CONFIG,
    ...(options.generationConfig || {}),
  }

  const useGoogleSearch = options.useGoogleSearch ?? options.useRAG ?? false
  let lastError = 'Erro desconhecido'

  for (const model of MODELS) {
    for (const apiKey of apiKeys) {
      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
      }

      if (useGoogleSearch) {
        requestBody.tools = [{ googleSearch: {} }]
      }

      const response = await geminiFetch(model, apiKey, requestBody)
      const data = await response.json()

      if (response.ok) {
        return data
      }

      lastError = data.error?.message || `HTTP ${response.status}`
      if (
        response.status === 429 ||
        response.status === 503 ||
        isInvalidApiKeyError(response.status, lastError)
      ) {
        continue
      }
    }
  }

  throw new Error(lastError)
}

async function generateAiJson(prompt, options = {}) {
  const response = await callGemini(prompt, options)
  const text = extractGeneratedText(response)
  const parsed = await parseAiJsonText(text)

  if (parsed?.erro) {
    throw new Error(String(parsed.erro))
  }

  return parsed
}

module.exports = {
  generateAiJson,
  parseAiJsonText,
  loadApiKeys,
}
