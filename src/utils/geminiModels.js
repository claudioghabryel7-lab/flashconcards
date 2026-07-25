/**
 * Modelos Gemini oficiais usados em todo o app.
 * gemini-2.5-* não está mais disponível para novas chaves (404).
 *
 * Custo: NÃO incluir Pro no cascade padrão — thinking alto cobra como output.
 * Conteúdo jurídico continua em Flash (3.6/3.5); Pro só sob demanda explícita.
 */
import { readEnv } from '../lib/env.js'

/** Modelo principal (substitui gemini-2.5-flash). */
export const GEMINI_FLASH_MODEL = 'gemini-3.6-flash'

/** Fallback rápido / tarefas gerais. */
export const GEMINI_FLASH_FALLBACK_MODEL = 'gemini-3.5-flash'

/**
 * Flash-Lite: padrão minimal thinking, barato para chat/resumos.
 * Se a chave não tiver o modelo, o cascade cai no Flash.
 */
export const GEMINI_FLASH_LITE_MODEL = 'gemini-3.5-flash-lite'

/** Modelo mais capaz — NÃO usar no fallback automático (thinking caro). */
export const GEMINI_PRO_MODEL = 'gemini-3.1-pro-preview'

/**
 * Lista padrão de modelos (ordem de tentativa).
 * Só Flash — evita cair em Pro com thinking alto após 429/503.
 * Respeita VITE_GEMINI_MODEL se definido.
 */
export function getDefaultGeminiModels() {
  const preferred = String(readEnv('VITE_GEMINI_MODEL') || '').trim()
  const defaults = [GEMINI_FLASH_MODEL, GEMINI_FLASH_FALLBACK_MODEL]
  if (!preferred) return defaults
  // Se alguém forçar Pro via env, respeita — mas não adiciona Pro de surpresa
  return [preferred, ...defaults.filter((m) => m !== preferred)]
}

/** Cascade barato para chat / respostas curtas. */
export function getChatGeminiModels() {
  const preferred = String(readEnv('VITE_GEMINI_CHAT_MODEL') || '').trim()
  const defaults = [
    GEMINI_FLASH_LITE_MODEL,
    GEMINI_FLASH_MODEL,
    GEMINI_FLASH_FALLBACK_MODEL,
  ]
  if (!preferred) return defaults
  return [preferred, ...defaults.filter((m) => m !== preferred)]
}

/** Cascade explícito com Pro (tarefas raras / sob demanda). */
export function getProGeminiModels() {
  return [GEMINI_FLASH_MODEL, GEMINI_FLASH_FALLBACK_MODEL, GEMINI_PRO_MODEL]
}

export const DEFAULT_GEMINI_MODELS = [
  GEMINI_FLASH_MODEL,
  GEMINI_FLASH_FALLBACK_MODEL,
]

export const VERIFY_GEMINI_MODELS = [GEMINI_FLASH_MODEL]

/** Modelos Gemini TTS (vozes Live: Kore, Aoede, Despina, Charon…). */
export const GEMINI_TTS_MODELS = [
  'gemini-2.5-flash-preview-tts',
  'gemini-2.5-pro-preview-tts',
  'gemini-3.1-flash-tts-preview',
  'gemini-3.1-flash-tts',
]

export function getGeminiTtsModels() {
  const preferred = String(readEnv('VITE_GEMINI_TTS_MODEL') || '').trim()
  if (!preferred) return GEMINI_TTS_MODELS
  return [preferred, ...GEMINI_TTS_MODELS.filter((m) => m !== preferred)]
}

/**
 * thinkingConfig barato por modelo.
 * Gemini 3.x: thinkingLevel (minimal/low/medium/high)
 * Gemini 2.5 Flash: thinkingBudget 0 desliga
 * Pro: minimal não existe — usa low
 *
 * @param {string} model
 * @param {'minimal'|'low'|'medium'|'high'} [level='minimal']
 */
export function buildThinkingConfig(model = '', level = 'minimal') {
  const name = String(model || '').toLowerCase()
  const isPro = name.includes('pro')
  const is25 = name.includes('2.5')
  const safeLevel = isPro && level === 'minimal' ? 'low' : level

  if (is25 && !isPro) {
    // 2.5 Flash: 0 = sem thinking; Pro 2.5 não aceita 0
    return { thinkingBudget: level === 'minimal' || level === 'low' ? 0 : 1024 }
  }

  return { thinkingLevel: safeLevel }
}

/**
 * Mescla generationConfig com thinking barato (não sobrescreve se já veio thinkingConfig).
 * @param {object} generationConfig
 * @param {string} model
 * @param {'minimal'|'low'|'medium'|'high'} [thinkingLevel]
 */
export function withCostSafeThinking(generationConfig = {}, model = '', thinkingLevel = 'minimal') {
  const base = { ...(generationConfig || {}) }
  if (base.thinkingConfig) return base
  return {
    ...base,
    thinkingConfig: buildThinkingConfig(model, thinkingLevel),
  }
}
