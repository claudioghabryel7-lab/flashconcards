import { GoogleGenerativeAI } from '@google/generative-ai'
import { readEnv } from './env.js'
import {
  GEMINI_FLASH_MODEL,
  GEMINI_FLASH_FALLBACK_MODEL,
  GEMINI_PRO_MODEL,
} from '../utils/geminiModels.js'

const MODELS = [GEMINI_FLASH_MODEL, GEMINI_FLASH_FALLBACK_MODEL, GEMINI_PRO_MODEL]

function getApiKey() {
  return readEnv('VITE_GEMINI_API_KEY') || ''
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
    const model = getGenAI().getGenerativeModel({ model: GEMINI_FLASH_MODEL })
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
