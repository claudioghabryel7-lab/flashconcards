/**
 * Modelos Gemini oficiais usados em todo o app.
 *
 * Estratégia de custo (sem baixar qualidade):
 * 1) gemini-3.5-flash-lite — principal (mais barato)
 * 2) gemini-3.6-flash — fallback de qualidade se Lite falhar/404/quota
 * 3) gemini-3.5-flash — último fallback Flash
 *
 * Pro fica fora da cadeia padrão (caro); só sob demanda via VITE_GEMINI_MODEL.
 */
import { readEnv } from '../lib/env.js'

/** Mais barato — padrão em todas as gerações. */
export const GEMINI_FLASH_LITE_MODEL = 'gemini-3.5-flash-lite'

/** Alias: modelo principal do app = Lite. */
export const GEMINI_FLASH_MODEL = GEMINI_FLASH_LITE_MODEL

/** Flash “cheio” — fallback de qualidade. */
export const GEMINI_FLASH_QUALITY_MODEL = 'gemini-3.6-flash'

/** Fallback rápido secundário. */
export const GEMINI_FLASH_FALLBACK_MODEL = 'gemini-3.5-flash'

/** Modelo mais capaz (não entra na cadeia padrão de custo). */
export const GEMINI_PRO_MODEL = 'gemini-3.1-pro-preview'

/**
 * Cadeia padrão barata → qualidade.
 * Usar em AdminPanel, chats, API, etc. (única fonte de verdade).
 */
export const GEMINI_COST_MODELS = [
  GEMINI_FLASH_LITE_MODEL,
  GEMINI_FLASH_QUALITY_MODEL,
  GEMINI_FLASH_FALLBACK_MODEL,
]

/**
 * Lista padrão de modelos (ordem de tentativa).
 * Respeita VITE_GEMINI_MODEL se definido (vai para o topo).
 */
export function getDefaultGeminiModels() {
  const preferred = String(readEnv('VITE_GEMINI_MODEL') || '').trim()
  const defaults = [...GEMINI_COST_MODELS]
  if (!preferred) return defaults
  return [preferred, ...defaults.filter((m) => m !== preferred)]
}

export const DEFAULT_GEMINI_MODELS = GEMINI_COST_MODELS

/** Verify / healthcheck — Lite (barato). */
export const VERIFY_GEMINI_MODELS = [GEMINI_FLASH_LITE_MODEL]

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
