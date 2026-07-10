import {
  collectGeminiApiKeys,
  geminiRequestWithKeyFallback,
} from '../utils/geminiKeyPool.js'

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro']

export async function callGeminiWithFallback(
  prompt,
  options = {},
) {
  const { temperature = 0.7, maxOutputTokens = 32000 } = options

  if (collectGeminiApiKeys().length === 0) {
    throw new Error('Chave Gemini não configurada no .env')
  }

  const { data } = await geminiRequestWithKeyFallback({
    models: MODELS,
    silent: true,
    buildBody: () => ({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens },
    }),
  })

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  if (!text.trim()) throw new Error('Resposta vazia da IA')
  return text.trim()
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
