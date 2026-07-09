import { readEnv } from './env.js'
import { geminiFetch } from '../utils/geminiHttp.js'

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro']

function loadApiKeys() {
  const keys = []
  const main = readEnv('VITE_GEMINI_API_KEY') || readEnv('VITE_GOOGLE_AI_API_KEY')
  if (main) keys.push(main)
  for (let i = 1; i <= 10; i++) {
    const k = readEnv(`VITE_GEMINI_API_KEY_${i}`)
    if (k && !keys.includes(k)) keys.push(k)
  }
  return keys
}

export async function callGeminiWithFallback(
  prompt,
  options = {},
) {
  const { temperature = 0.7, maxOutputTokens = 32000 } = options
  const apiKeys = loadApiKeys()
  if (!apiKeys.length) {
    throw new Error('Chave Gemini não configurada no .env')
  }

  let lastError = null

  for (const modelName of MODELS) {
    for (const apiKey of apiKeys) {
      try {
        const response = await geminiFetch(modelName, apiKey, {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens },
        })
        const data = await response.json()
        if (!response.ok) {
          lastError = new Error(data.error?.message || `HTTP ${response.status}`)
          continue
        }
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
        if (!text.trim()) throw new Error('Resposta vazia da IA')
        return text.trim()
      } catch (error) {
        lastError = error
      }
    }
  }

  throw lastError || new Error('Todos os modelos Gemini falharam')
}

export async function testGeminiAPI() {
  try {
    await callGeminiWithFallback('Olá, você está funcionando?')
    return true
  } catch {
    return false
  }
}

/** @deprecated Use callGeminiWithFallback — mantido para compatibilidade */
export const geminiModel = {
  async generateContent(prompt) {
    const text = await callGeminiWithFallback(prompt)
    return { response: { text: () => text } }
  },
}
