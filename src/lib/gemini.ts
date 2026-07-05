import { GoogleGenerativeAI } from '@google/generative-ai'
import { readEnv } from './env.js'

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro']

function getApiKey() {
  const keys = []
  const main = readEnv('VITE_GEMINI_API_KEY') || readEnv('VITE_GOOGLE_AI_API_KEY')
  if (main) keys.push(main)
  for (let i = 1; i <= 10; i++) {
    const k = readEnv(`VITE_GEMINI_API_KEY_${i}`)
    if (k && !keys.includes(k)) keys.push(k)
  }
  return keys[0] || ''
}

let genAI: GoogleGenerativeAI | null = null

function getGenAI() {
  if (!genAI) {
    const apiKey = getApiKey()
    if (!apiKey) {
      throw new Error('Chave Gemini não configurada no .env')
    }
    genAI = new GoogleGenerativeAI(apiKey)
  }
  return genAI
}

export const geminiModel = {
  async generateContent(prompt: string) {
    const model = getGenAI().getGenerativeModel({ model: 'gemini-2.5-flash' })
    return model.generateContent(prompt)
  },
}

export async function callGeminiWithFallback(
  prompt: string,
  options?: { temperature?: number; maxOutputTokens?: number },
) {
  const { temperature = 0.7, maxOutputTokens = 32000 } = options || {}

  for (const modelName of MODELS) {
    try {
      const model = getGenAI().getGenerativeModel({
        model: modelName,
        generationConfig: { temperature, maxOutputTokens },
      })
      const result = await model.generateContent(prompt)
      return result.response.text()
    } catch (error) {
      console.error(`Erro com modelo ${modelName}:`, error)
    }
  }

  throw new Error('Todos os modelos Gemini falharam')
}

export async function testGeminiAPI() {
  try {
    await callGeminiWithFallback('Olá, você está funcionando?')
    return true
  } catch {
    return false
  }
}

export { getGenAI as genAI }
