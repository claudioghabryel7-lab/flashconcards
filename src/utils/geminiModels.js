/**
 * Modelos Gemini oficiais usados em todo o app.
 * gemini-2.5-* não está mais disponível para novas chaves (404).
 */
import { readEnv } from '../lib/env.js'

/** Modelo principal (substitui gemini-2.5-flash). */
export const GEMINI_FLASH_MODEL = 'gemini-3.6-flash'

/** Fallback rápido / tarefas gerais. */
export const GEMINI_FLASH_FALLBACK_MODEL = 'gemini-3.5-flash'

/** Modelo mais capaz (substitui gemini-2.5-pro). */
export const GEMINI_PRO_MODEL = 'gemini-3.1-pro-preview'

/**
 * Lista padrão de modelos (ordem de tentativa).
 * Respeita VITE_GEMINI_MODEL se definido.
 */
export function getDefaultGeminiModels() {
  const preferred = String(readEnv('VITE_GEMINI_MODEL') || '').trim()
  const defaults = [GEMINI_FLASH_MODEL, GEMINI_FLASH_FALLBACK_MODEL, GEMINI_PRO_MODEL]
  if (!preferred) return defaults
  return [preferred, ...defaults.filter((m) => m !== preferred)]
}

export const DEFAULT_GEMINI_MODELS = [
  GEMINI_FLASH_MODEL,
  GEMINI_FLASH_FALLBACK_MODEL,
  GEMINI_PRO_MODEL,
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
