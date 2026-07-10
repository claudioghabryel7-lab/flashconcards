const functions = require('firebase-functions')
const path = require('path')
const fs = require('fs')
const { jsonrepair } = require('jsonrepair')
const { geminiRequestWithKeyFallback, collectGeminiApiKeys } = require('./geminiKeyPool')

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

function collectTextFromGeminiResponse(response) {
  const candidate = response?.candidates?.[0]
  if (!candidate) {
    const blockReason = response?.promptFeedback?.blockReason
    return {
      text: '',
      finishReason: blockReason || 'NO_CANDIDATES',
      blocked: Boolean(blockReason),
    }
  }

  const parts = candidate.content?.parts || []
  const chunks = []
  for (const part of parts) {
    if (typeof part?.text === 'string' && part.text.trim()) {
      chunks.push(part.text)
    }
  }

  return {
    text: chunks.join('').trim(),
    finishReason: candidate.finishReason || null,
    blocked: false,
  }
}

function extractGeneratedText(response) {
  const { text, finishReason, blocked } = collectTextFromGeminiResponse(response)

  if (!text) {
    let message = 'A IA não retornou texto'
    if (blocked) {
      message = `Conteúdo bloqueado pela IA (${finishReason}). Tente gerar novamente.`
    } else if (finishReason === 'MAX_TOKENS') {
      message =
        'A IA atingiu o limite de tamanho e não completou o material. Tente gerar novamente.'
    } else if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
      message = 'A IA bloqueou parte do conteúdo por segurança. Tente gerar novamente.'
    } else if (finishReason === 'NO_CANDIDATES') {
      message = 'A IA não retornou resposta. Tente gerar novamente.'
    }

    const err = new Error(message)
    err.code = blocked ? 'ai_blocked' : 'ai_empty_response'
    err.finishReason = finishReason
    throw err
  }

  return text
}

function closeTruncatedJson(raw) {
  let s = String(raw).trim()
  s = s.replace(/,\s*"[^"\\]*(?:\\.[^"\\]*)*$/, '')
  s = s.replace(/,\s*$/, '')
  s = s.replace(/:\s*$/, ': null')
  const openBraces = (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length
  const openBrackets = (s.match(/\[/g) || []).length - (s.match(/\]/g) || []).length
  if (openBrackets > 0) s += ']'.repeat(openBrackets)
  if (openBraces > 0) s += '}'.repeat(openBraces)
  return s
}

async function parseAiJsonText(generatedText) {
  const normalized =
    typeof generatedText === 'string'
      ? generatedText.trim()
      : generatedText == null
        ? ''
        : String(generatedText).trim()

  if (!normalized) {
    const err = new Error('A IA não retornou texto para processar')
    err.code = 'ai_empty_response'
    throw err
  }

  const cleaned = stripConversationalWrapper(
    normalized
      .replace(/```json\s*/gi, '')
      .replace(/```/g, '')
      .trim(),
  )

  const jsonMatch = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
  if (!jsonMatch) {
    const err = new Error('Nenhum JSON válido encontrado na resposta da IA')
    err.code = 'ai_json_parse_error'
    throw err
  }

  const raw = jsonMatch[0]
  const attempts = [
    (s) => JSON.parse(s),
    (s) => JSON.parse(closeTruncatedJson(s)),
    (s) => JSON.parse(jsonrepair(s)),
    (s) => JSON.parse(closeTruncatedJson(s).replace(/,\s*([}\]])/g, '$1').replace(/[\u0000-\u001F]+/g, ' ')),
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

  const err = new Error('Não foi possível reparar o JSON da resposta da IA')
  err.code = 'ai_json_parse_error'
  err.cause = lastError
  throw err
}

function isRetryableAiError(error) {
  const code = error?.code
  const msg = String(error?.message || '').toLowerCase()
  return (
    code === 'ai_empty_response' ||
    code === 'ai_json_parse_error' ||
    msg.includes('json') ||
    msg.includes('reparar')
  )
}

async function callGemini(prompt, options = {}) {
  const apiKeys = collectGeminiApiKeys()
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

  const { data } = await geminiRequestWithKeyFallback({
    buildBody: (model) => {
      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
      }
      if (useGoogleSearch) {
        requestBody.tools = [{ googleSearch: {} }]
      }
      return requestBody
    },
  })

  return data
}

async function generateAiJson(prompt, options = {}) {
  const maxAttempts = options.maxParseAttempts ?? 2
  let lastError

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const effectivePrompt =
        attempt === 1
          ? prompt
          : `${prompt}\n\nIMPORTANTE: a resposta anterior não pôde ser lida. Retorne APENAS um único JSON válido e completo, sem markdown nem texto extra.`

      const response = await callGemini(effectivePrompt, options)
      const text = extractGeneratedText(response)
      const parsed = await parseAiJsonText(text)

      if (parsed?.erro) {
        throw new Error(String(parsed.erro))
      }

      return parsed
    } catch (error) {
      lastError = error
      if (attempt < maxAttempts && isRetryableAiError(error)) continue
      break
    }
  }

  throw lastError || new Error('Falha na geração com IA. Tente novamente.')
}

module.exports = {
  generateAiJson,
  parseAiJsonText,
  loadApiKeys: collectGeminiApiKeys,
}
