const functions = require('firebase-functions')
const { jsonrepair } = require('jsonrepair')

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro']

const DEFAULT_GENERATION_CONFIG = {
  temperature: 0.35,
  maxOutputTokens: 32000,
}

function loadApiKeys() {
  const keys = []
  const cfg = functions.config().gemini || {}
  const main = cfg.api_key || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY
  if (main) keys.push(main)

  for (let i = 1; i <= 10; i += 1) {
    const k = cfg[`api_key_${i}`] || process.env[`GEMINI_API_KEY_${i}`] || process.env[`VITE_GEMINI_API_KEY_${i}`]
    if (k && !keys.includes(k)) keys.push(k)
  }

  return keys
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
    throw new Error('GEMINI_API_KEY não configurada nas Cloud Functions.')
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

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        },
      )

      const data = await response.json()

      if (response.ok) {
        return data
      }

      lastError = data.error?.message || `HTTP ${response.status}`
      if (response.status === 429 || response.status === 503) {
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
