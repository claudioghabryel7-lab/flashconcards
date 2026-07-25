/**
 * Escolhe modelo de chat SEM gastar generateContent de probe.
 * Preferência: sessionStorage → allowlist Flash/Lite (nunca Pro).
 */

import { getChatGeminiModels } from './geminiModels.js'

const STORAGE_KEY = 'fc_gemini_chat_model_v1'

export function getPreferredChatModel() {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (saved && !/pro/i.test(saved)) return saved
  } catch {
    // ignore
  }
  return getChatGeminiModels()[0]
}

export function rememberChatModel(model) {
  if (!model || /pro/i.test(model)) return
  try {
    sessionStorage.setItem(STORAGE_KEY, model)
  } catch {
    // ignore
  }
}

/** Lista ordenada para fallback em runtime (sem probe prévio). */
export function listChatModelFallbacks() {
  return getChatGeminiModels().filter((m) => !/pro/i.test(m))
}

/**
 * Executa fn(model) tentando fallbacks só quando a chamada real falhar com 404/modelo.
 * @param {(model: string) => Promise<any>} fn
 */
export async function withChatModelFallback(fn) {
  const models = listChatModelFallbacks()
  const preferred = getPreferredChatModel()
  const ordered = [preferred, ...models.filter((m) => m !== preferred)]
  let lastErr
  for (const model of ordered) {
    try {
      const result = await fn(model)
      rememberChatModel(model)
      return { model, result }
    } catch (err) {
      lastErr = err
      const msg = String(err?.message || err || '')
      const status = err?.status || err?.code
      const modelMissing =
        status === 404 ||
        /not found|is not found|unsupported|not supported|404/i.test(msg)
      if (!modelMissing) throw err
    }
  }
  throw lastErr || new Error('Nenhum modelo de chat disponível')
}
