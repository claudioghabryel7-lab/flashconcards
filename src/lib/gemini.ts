import { GoogleGenerativeAI } from '@google/generative-ai'
import { readEnv } from './env.js'
import {
  GEMINI_FLASH_MODEL,
  getDefaultGeminiModels,
  withCostSafeThinking,
} from '../utils/geminiModels.js'

const MODELS = getDefaultGeminiModels()

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
    const model = getGenAI().getGenerativeModel({
      model: GEMINI_FLASH_MODEL,
      // @ts-expect-error thinkingConfig suportado na API REST Gemini 3.x
      generationConfig: {
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingLevel: 'minimal' },
      },
    })
    return model.generateContent(prompt)
  },
}

export async function callGeminiWithFallback(
  prompt: string,
  options?: { temperature?: number; maxOutputTokens?: number; thinkingLevel?: string },
) {
  const {
    temperature = 0.7,
    maxOutputTokens = 8192,
    thinkingLevel = 'minimal',
  } = options || {}

  for (const modelName of MODELS) {
    try {
      const generationConfig = withCostSafeThinking(
        { temperature, maxOutputTokens },
        modelName,
        thinkingLevel as 'minimal' | 'low' | 'medium' | 'high',
      )
      const model = getGenAI().getGenerativeModel({
        model: modelName,
        // @ts-expect-error thinkingConfig suportado na API REST Gemini 3.x
        generationConfig,
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
    await callGeminiWithFallback('Olá, você está funcionando?', {
      maxOutputTokens: 16,
      thinkingLevel: 'minimal',
    })
    return true
  } catch {
    return false
  }
}

export { getGenAI as genAI }
