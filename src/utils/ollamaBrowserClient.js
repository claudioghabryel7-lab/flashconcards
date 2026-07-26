/**
 * IA local direto no browser → http://127.0.0.1:11434
 *
 * Assim o site na Vercel (aberto no Chrome do PC) usa o Ollama do PC
 * SEM túnel. Exige CORS no Ollama: OLLAMA_ORIGINS=*
 */
import { readEnv } from '../lib/env.js'

const DEFAULT_LOCAL_URL = 'http://127.0.0.1:11434'
const DEFAULT_MODEL = 'phi'

function getBrowserOllamaBaseUrl() {
  const fromEnv =
    readEnv('VITE_OLLAMA_BASE_URL') ||
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_OLLAMA_BASE_URL) ||
    ''
  return String(fromEnv || DEFAULT_LOCAL_URL).replace(/\/$/, '')
}

function getBrowserOllamaModel(preferred) {
  if (preferred && String(preferred).trim()) return String(preferred).trim()
  const fromEnv =
    readEnv('VITE_OLLAMA_MODEL') ||
    readEnv('VITE_GEMINI_MODEL') ||
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_OLLAMA_MODEL) ||
    ''
  return String(fromEnv || DEFAULT_MODEL).trim() || DEFAULT_MODEL
}

function needsRaw(model) {
  const name = String(model || '').toLowerCase()
  return name.includes('phi') && !name.includes('phi3') && !name.includes('phi-3')
}

function wrapPromptForPhi(prompt, model, useRaw) {
  const text = String(prompt ?? '')
  if (!useRaw || !needsRaw(model)) return text
  if (/###\s*Instruction:|Instruct:|###\s*Response:/i.test(text)) return text
  return `### Instruction:\n${text}\n\n### Response:\n`
}

function toGeminiShape(ollamaData, model) {
  const text = String(ollamaData?.response ?? ollamaData?.message?.content ?? '')
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
        content: { parts: [{ text }] },
        finishReason: finish,
      },
    ],
    modelVersion: ollamaData?.model || model,
    _via: 'browser-localhost',
  }
}

let cachedProbe = { at: 0, ok: false, baseUrl: '' }

/** Probe rápido: Ollama responde neste PC? (cache 20s) */
export async function probeLocalOllama(timeoutMs = 1200) {
  const baseUrl = getBrowserOllamaBaseUrl()
  const now = Date.now()
  if (cachedProbe.baseUrl === baseUrl && now - cachedProbe.at < 20000) {
    return cachedProbe.ok
  }
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(`${baseUrl}/api/tags`, {
      method: 'GET',
      signal: ctrl.signal,
    })
    clearTimeout(t)
    cachedProbe = { at: now, ok: res.ok, baseUrl }
    return res.ok
  } catch {
    cachedProbe = { at: now, ok: false, baseUrl }
    return false
  }
}

/**
 * Gera via Ollama no localhost do PC (browser).
 * @returns {Promise<object>} shape Gemini
 */
export async function generateViaLocalOllama(prompt, options = {}) {
  const baseUrl = getBrowserOllamaBaseUrl()
  const models = Array.isArray(options.models) && options.models.length
    ? options.models
    : [getBrowserOllamaModel(options.model)]
  const generationConfig = options.generationConfig || {}
  const temperature = Number(generationConfig.temperature ?? 0.35)
  const requested = Number(generationConfig.maxOutputTokens ?? 1024)
  const numPredict = Math.min(Number.isFinite(requested) ? requested : 1024, 1536)

  let lastError = 'Ollama local indisponível'

  for (const model of models) {
    const useRaw = needsRaw(model)
    try {
      const body = {
        model,
        prompt: wrapPromptForPhi(prompt, model, useRaw),
        stream: false,
        raw: useRaw,
        options: {
          temperature: Number.isFinite(temperature) ? temperature : 0.35,
          num_predict: numPredict,
        },
      }
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const rawText = await res.text()
      let data
      try {
        data = JSON.parse(rawText)
      } catch {
        if (res.status === 503 || /tunnel unavailable|bad gateway/i.test(rawText)) {
          lastError =
            'Túnel/Ollama indisponível (HTTP 503). Não use localtunnel — deixe só o Ollama aberto e acesse o site neste PC.'
        } else {
          lastError = `Ollama local retornou resposta inválida (HTTP ${res.status}). Confira se o app Ollama está aberto e o modelo "${model}" instalado (ollama pull ${model}).`
        }
        continue
      }
      if (!res.ok) {
        lastError =
          data?.error ||
          (res.status === 503
            ? 'Ollama ocupado/indisponível (HTTP 503). Aguarde ou reinicie o Ollama.'
            : `HTTP ${res.status}`)
        continue
      }
      const shaped = toGeminiShape(data, model)
      const text = shaped.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text || !String(text).trim()) {
        // retry raw se ainda não usou
        if (!useRaw) {
          const retry = await fetch(`${baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...body,
              raw: true,
              prompt: wrapPromptForPhi(prompt, model, true),
            }),
          })
          const retryData = await retry.json().catch(() => ({}))
          if (retry.ok) {
            const shapedRetry = toGeminiShape(retryData, model)
            const t2 = shapedRetry.candidates?.[0]?.content?.parts?.[0]?.text
            if (t2 && String(t2).trim()) return shapedRetry
          }
        }
        lastError = `IA local sem texto (modelo=${model})`
        continue
      }
      cachedProbe = { at: Date.now(), ok: true, baseUrl }
      return shaped
    } catch (err) {
      lastError =
        err?.name === 'TypeError'
          ? `Não foi possível conectar em ${baseUrl}. Deixe o Ollama aberto e configure OLLAMA_ORIGINS=* no PC.`
          : err?.message || String(err)
    }
  }

  const error = new Error(lastError)
  error.code = 'ollama_local_unavailable'
  throw error
}

export function getLocalOllamaConfig() {
  return {
    baseUrl: getBrowserOllamaBaseUrl(),
    model: getBrowserOllamaModel(),
  }
}
