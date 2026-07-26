/**
 * Modelos da IA usados em todo o app.
 *
 * Fonte: Ollama no PC (gratuito). Nomes configuráveis via env:
 * - OLLAMA_MODEL (principal)
 * - OLLAMA_MODELS (lista separada por vírgula)
 * - VITE_GEMINI_MODEL (legado / alias do principal)
 */
import { readEnv } from '../lib/env.js'

function readServer(key) {
  if (typeof process === 'undefined' || !process.env) return ''
  const v = process.env[key]
  return v != null && String(v).trim() !== '' ? String(v).trim() : ''
}

function resolvePrimaryModel() {
  return (
    readServer('OLLAMA_MODEL') ||
    String(readEnv('VITE_GEMINI_MODEL') || '').trim() ||
    'llama3.2'
  )
}

function resolveModelChain() {
  const list = readServer('OLLAMA_MODELS')
  if (list) {
    return list
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return [resolvePrimaryModel()]
}

/** Modelo principal (Ollama no PC). */
export const GEMINI_FLASH_LITE_MODEL = resolvePrimaryModel()

/** Alias: modelo principal do app. */
export const GEMINI_FLASH_MODEL = GEMINI_FLASH_LITE_MODEL

/** Fallback de qualidade (mesmo modelo se não houver cadeia). */
export const GEMINI_FLASH_QUALITY_MODEL =
  resolveModelChain()[1] || GEMINI_FLASH_LITE_MODEL

/** Fallback secundário. */
export const GEMINI_FLASH_FALLBACK_MODEL =
  resolveModelChain()[2] || GEMINI_FLASH_QUALITY_MODEL

/** Alias legado — não usa Pro pago. */
export const GEMINI_PRO_MODEL = GEMINI_FLASH_LITE_MODEL

/**
 * Cadeia padrão Ollama (única fonte de verdade).
 */
export const GEMINI_COST_MODELS = resolveModelChain()

/**
 * Lista padrão de modelos (ordem de tentativa).
 * Respeita VITE_GEMINI_MODEL / OLLAMA_MODEL se definido (vai para o topo).
 */
export function getDefaultGeminiModels() {
  const preferred =
    String(readEnv('VITE_GEMINI_MODEL') || '').trim() ||
    readServer('OLLAMA_MODEL') ||
    ''
  const defaults = [...GEMINI_COST_MODELS]
  if (!preferred) return defaults.length ? defaults : ['llama3.2']
  return [preferred, ...defaults.filter((m) => m !== preferred)]
}

export const DEFAULT_GEMINI_MODELS = GEMINI_COST_MODELS

/** Verify / healthcheck — modelo principal. */
export const VERIFY_GEMINI_MODELS = [GEMINI_FLASH_LITE_MODEL]

/**
 * TTS ainda usa endpoints Gemini (não cobertos pelo Ollama).
 * Com IA 100% local, voz TTS fica indisponível até haver backend local de áudio.
 */
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
