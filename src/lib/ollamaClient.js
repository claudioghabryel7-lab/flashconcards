/**
 * Cliente da IA local (Ollama no PC).
 * Expõe respostas no formato Gemini (candidates/parts) para o resto do app
 * continuar igual — material, questões, flashcards, chat, etc.
 */

import { getOllamaBaseUrl, getOllamaModel, getOllamaModels } from './serverSecrets.js'

/**
 * Converte resposta Ollama → shape Gemini que o app já parseia.
 * @param {{ response?: string, done?: boolean, model?: string }} ollamaData
 */
export function ollamaToGeminiShape(ollamaData) {
  const text = String(ollamaData?.response ?? '')
  const done = ollamaData?.done !== false
  return {
    candidates: [
      {
        content: {
          parts: [{ text }],
        },
        finishReason: done ? 'STOP' : 'MAX_TOKENS',
      },
    ],
    modelVersion: ollamaData?.model || getOllamaModel(),
  }
}

function buildOllamaGenerateBody(prompt, { model, generationConfig = {} } = {}) {
  const temperature = Number(generationConfig.temperature ?? 0.35)
  const numPredict = Number(
    generationConfig.maxOutputTokens ?? generationConfig.num_predict ?? 32000,
  )
  return {
    model: model || getOllamaModel(),
    prompt: String(prompt ?? ''),
    stream: false,
    options: {
      temperature: Number.isFinite(temperature) ? temperature : 0.35,
      num_predict: Number.isFinite(numPredict) ? numPredict : 32000,
    },
  }
}

/**
 * Gera texto via Ollama e devolve no formato Gemini.
 * @param {string} prompt
 * @param {{ model?: string, generationConfig?: Record<string, unknown>, baseUrl?: string }} [options]
 */
export async function generateWithOllama(prompt, options = {}) {
  const baseUrl = String(options.baseUrl || getOllamaBaseUrl()).replace(/\/$/, '')
  const models = options.model
    ? [options.model]
    : getOllamaModels().length
      ? getOllamaModels()
      : [getOllamaModel()]

  let lastError = 'Erro desconhecido'

  for (const model of models) {
    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          buildOllamaGenerateBody(prompt, {
            model,
            generationConfig: options.generationConfig,
          }),
        ),
      })

      const rawText = await response.text()
      let data
      try {
        data = JSON.parse(rawText)
      } catch {
        lastError = `Ollama retornou resposta inválida (HTTP ${response.status})`
        continue
      }

      if (!response.ok) {
        lastError = data?.error || `HTTP ${response.status}`
        // modelo ausente → tenta próximo
        if (response.status === 404) continue
        continue
      }

      const shaped = ollamaToGeminiShape(data)
      const text = shaped.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text || !String(text).trim()) {
        lastError = `A IA local não retornou texto (modelo=${model})`
        continue
      }
      return shaped
    } catch (err) {
      lastError =
        err?.message ||
        `Falha ao conectar na IA local (${baseUrl}). Ollama está rodando no PC?`
    }
  }

  const error = new Error(
    `IA local indisponível: ${lastError}. Verifique Ollama em ${getOllamaBaseUrl()} e o modelo (${getOllamaModel()}).`,
  )
  error.code = 'ollama_unavailable'
  throw error
}

/** Lista modelos instalados no Ollama (formato compatível com /api/gemini/models). */
export async function listOllamaModels() {
  const baseUrl = getOllamaBaseUrl().replace(/\/$/, '')
  const response = await fetch(`${baseUrl}/api/tags`)
  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(errText || `HTTP ${response.status}`)
  }
  const data = await response.json()
  const models = Array.isArray(data?.models) ? data.models : []
  return {
    models: models.map((m) => ({
      name: `models/${m.name}`,
      displayName: m.name,
      description: m.details?.family || 'Ollama local',
      supportedGenerationMethods: ['generateContent'],
    })),
  }
}

/** Healthcheck simples (tags). */
export async function isOllamaAvailable() {
  try {
    const baseUrl = getOllamaBaseUrl().replace(/\/$/, '')
    const response = await fetch(`${baseUrl}/api/tags`)
    return response.ok
  } catch {
    return false
  }
}
