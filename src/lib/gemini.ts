/**
 * Facade server-only da IA.
 * Mantém a API antiga (geminiModel.generateContent) mas usa Ollama no PC.
 */
import { generateWithOllama } from './ollamaClient.js'
import { collectGeminiTextParts } from '../utils/geminiResponseUtils.js'
import { GEMINI_FLASH_MODEL, getDefaultGeminiModels } from '../utils/geminiModels.js'

const MODELS = getDefaultGeminiModels()

function assertServerOnly() {
  if (typeof window !== 'undefined') {
    throw new Error('gemini.ts é server-only. Use createGeminiBrowserClient() no client.')
  }
}

export const geminiModel = {
  async generateContent(prompt: string) {
    assertServerOnly()
    const data = await generateWithOllama(prompt, { model: GEMINI_FLASH_MODEL })
    const text = collectGeminiTextParts(data)
    return {
      response: {
        text: () => text,
      },
    }
  },
}

export async function callGeminiWithFallback(
  prompt: string,
  options?: { temperature?: number; maxOutputTokens?: number },
) {
  assertServerOnly()
  const { temperature = 0.7, maxOutputTokens = 32000 } = options || {}

  let lastError: unknown
  for (const modelName of MODELS) {
    try {
      const data = await generateWithOllama(prompt, {
        model: modelName,
        generationConfig: { temperature, maxOutputTokens },
      })
      const text = collectGeminiTextParts(data)
      if (text) return text
      lastError = new Error(`Resposta vazia do modelo ${modelName}`)
    } catch (error) {
      console.error(`Erro com modelo ${modelName}:`, error)
      lastError = error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Todos os modelos da IA local falharam')
}

export async function testGeminiAPI() {
  try {
    await callGeminiWithFallback('Olá, você está funcionando?')
    return true
  } catch {
    return false
  }
}

/** Compat: código antigo importava genAI do SDK Google — removido. */
export function genAI() {
  throw new Error('SDK Google removido. Use geminiModel / generateWithOllama (IA local).')
}
