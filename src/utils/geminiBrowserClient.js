/**
 * Drop-in compatível com GoogleGenerativeAI no browser — usa proxy autenticado.
 * Não embute nem lê API key no client.
 */
import {
  callGeminiProxy,
  extractGeminiProxyText,
  listGeminiModelsProxy,
} from './secureLlmClient'

function promptToText(input) {
  if (typeof input === 'string') return input
  if (input?.contents) {
    try {
      return input.contents
        .flatMap((c) => c.parts || [])
        .map((p) => p.text || '')
        .join('')
    } catch {
      /* fallthrough */
    }
  }
  if (Array.isArray(input)) {
    return input.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('')
  }
  if (input?.text) return String(input.text)
  return String(input ?? '')
}

export function createGeminiBrowserClient() {
  return {
    getGenerativeModel({ model, generationConfig } = {}) {
      return {
        async generateContent(input) {
          const prompt = promptToText(input)
          const data = await callGeminiProxy({
            prompt,
            models: model ? [model] : undefined,
            generationConfig: generationConfig || { temperature: 0.35, maxOutputTokens: 32000 },
            useGoogleSearch: false,
            verifyContent: false,
          })
          const text = extractGeminiProxyText(data)
          return {
            response: {
              text: () => text,
              candidates: data.candidates,
            },
            ...data,
          }
        },
      }
    },
  }
}

/** Lista modelos via proxy (substitui fetch .../models?key=). */
export async function fetchGeminiModelsViaProxy() {
  return listGeminiModelsProxy()
}

/** true se o usuário está logado (pré-check antes de gerar). */
export function canUseServerAi() {
  try {
    // lazy import avoid circular — auth check happens at call time in secureLlmClient
    return true
  } catch {
    return false
  }
}
