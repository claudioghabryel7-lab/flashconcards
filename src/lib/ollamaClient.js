/**
 * Cliente da IA local (Ollama no PC).
 * Expõe respostas no formato Gemini (candidates/parts) para o resto do app
 * continuar igual — material, questões, flashcards, chat, etc.
 */

import {
  getOllamaBaseUrl,
  getOllamaModel,
  getOllamaModels,
  getOllamaRaw,
} from './serverSecrets.js'

/**
 * Converte resposta Ollama → shape Gemini que o app já parseia.
 * @param {{ response?: string, message?: { content?: string }, done?: boolean, model?: string }} ollamaData
 */
export function ollamaToGeminiShape(ollamaData) {
  const text = String(
    ollamaData?.response ?? ollamaData?.message?.content ?? '',
  )
  const done = ollamaData?.done !== false
  const finish =
    String(ollamaData?.done_reason || '').toLowerCase() === 'length'
      ? 'MAX_TOKENS'
      : done
        ? 'STOP'
        : 'MAX_TOKENS'
  return {
    candidates: [
      {
        content: {
          parts: [{ text }],
        },
        finishReason: finish,
      },
    ],
    modelVersion: ollamaData?.model || getOllamaModel(),
  }
}

/**
 * Phi-2 (base) ignora instruções soltas e “completa código”.
 * Empacota o prompt em formato Instruct/Response.
 */
function wrapPromptForModel(prompt, model, useRaw) {
  const text = String(prompt ?? '')
  const name = String(model || '').toLowerCase()
  if (!useRaw || !name.includes('phi') || name.includes('phi3') || name.includes('phi-3')) {
    return text
  }
  if (/###\s*Instruction:|Instruct:|###\s*Response:/i.test(text)) return text
  return `### Instruction:\n${text}\n\n### Response:\n`
}

function buildOllamaGenerateBody(prompt, { model, generationConfig = {}, raw } = {}) {
  const temperature = Number(generationConfig.temperature ?? 0.35)
  // phi tem context ~2048 — num_predict alto demais costuma atrapalhar
  const requested = Number(
    generationConfig.maxOutputTokens ?? generationConfig.num_predict ?? 1024,
  )
  const numPredict = Math.min(
    Number.isFinite(requested) ? requested : 1024,
    1536,
  )
  const useRaw = raw ?? getOllamaRaw(model)
  const modelName = model || getOllamaModel()
  return {
    model: modelName,
    prompt: wrapPromptForModel(prompt, modelName, useRaw),
    stream: false,
    raw: Boolean(useRaw),
    options: {
      temperature: Number.isFinite(temperature) ? temperature : 0.35,
      num_predict: numPredict,
    },
  }
}

async function postGenerate(baseUrl, body) {
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const rawText = await response.text()
  let data
  try {
    data = JSON.parse(rawText)
  } catch {
    const tunnelDown =
      response.status === 503 || /tunnel unavailable|bad gateway/i.test(rawText)
    const err = new Error(
      tunnelDown
        ? `Túnel indisponível (HTTP ${response.status}) em ${baseUrl}. Remova OLLAMA_BASE_URL do Vercel ou use o site no Chrome do PC com Ollama local (sem túnel).`
        : `Ollama retornou resposta inválida (HTTP ${response.status}) em ${baseUrl}`,
    )
    err.status = response.status
    throw err
  }
  if (!response.ok) {
    const err = new Error(data?.error || `HTTP ${response.status}`)
    err.status = response.status
    throw err
  }
  return data
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
      const preferRaw = getOllamaRaw(model)
      let data = await postGenerate(
        baseUrl,
        buildOllamaGenerateBody(prompt, {
          model,
          generationConfig: options.generationConfig,
          raw: preferRaw,
        }),
      )

      let shaped = ollamaToGeminiShape(data)
      let text = shaped.candidates?.[0]?.content?.parts?.[0]?.text

      // Phi sem raw costuma devolver só espaço — tenta de novo em raw
      if ((!text || !String(text).trim()) && !preferRaw) {
        data = await postGenerate(
          baseUrl,
          buildOllamaGenerateBody(prompt, {
            model,
            generationConfig: options.generationConfig,
            raw: true,
          }),
        )
        shaped = ollamaToGeminiShape(data)
        text = shaped.candidates?.[0]?.content?.parts?.[0]?.text
      }

      if (!text || !String(text).trim()) {
        lastError = `A IA local não retornou texto (modelo=${model})`
        continue
      }
      return shaped
    } catch (err) {
      lastError =
        err?.message ||
        `Falha ao conectar na IA local (${baseUrl}). Ollama está rodando no PC?`
      if (err?.status === 404) continue
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
