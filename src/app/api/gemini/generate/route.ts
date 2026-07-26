import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth } from '@/lib/apiAuth'
import {
  getGeminiApiKeys,
  geminiKeyExpiredUserMessage,
  isGeminiApiKeyError,
} from '@/lib/serverSecrets'
import { getDefaultGeminiModels } from '@/utils/geminiModels.js'
import {
  hasUsableGeminiText,
  withLiteThinkingConfig,
  markThinkingConfigRejected,
  getGeminiFinishReason,
} from '@/utils/geminiResponseUtils.js'

const DEFAULT_MODELS = getDefaultGeminiModels()
/** Texto vazio: no máx. 1 modelo extra (Lite → 1 fallback). Evita 3× em cadeia. */
const MAX_EMPTY_MODEL_FALLBACKS = 1

export async function POST(request: NextRequest) {
  const authResult = await requireApiAuth(request)
  if ('error' in authResult) return authResult.error

  try {
    const body = await request.json()
    const {
      prompt,
      generationConfig = { temperature: 0.35, maxOutputTokens: 32000 },
      useGoogleSearch = true,
      useFunctionCalling = false,
      tools = [],
      models = DEFAULT_MODELS,
    } = body

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt é obrigatório' }, { status: 400 })
    }

    const apiKeys = getGeminiApiKeys()
    if (!apiKeys.length) {
      return NextResponse.json(
        {
          error:
            'Nenhuma API key Gemini no servidor. Configure GEMINI_API_KEY (recomendado) no .env.local ou no Vercel.',
        },
        { status: 503 },
      )
    }

    let lastError = 'Erro desconhecido'
    let sawKeyError = false
    const modelList = Array.isArray(models) && models.length ? models : DEFAULT_MODELS
    const primaryKey = apiKeys[0]
    const backupKeys = apiKeys.slice(1)

    const tryOnce = async (
      apiKey: string,
      model: string,
      genConfig: Record<string, unknown>,
    ) => {
      const requestBody: Record<string, unknown> = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: genConfig,
      }

      if (useGoogleSearch) {
        requestBody.tools = [{ googleSearch: {} }]
      }
      if (useFunctionCalling && Array.isArray(tools) && tools.length > 0) {
        requestBody.tools = [...((requestBody.tools as unknown[]) || []), ...tools]
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        },
      )
      const data = await response.json()
      return { response, data }
    }

    const tryModel = async (apiKey: string, model: string) => {
      let genConfig = withLiteThinkingConfig(generationConfig, model) as Record<string, unknown>
      let { response, data } = await tryOnce(apiKey, model, genConfig)

      if (
        !response.ok &&
        response.status === 400 &&
        /thinking/i.test(String(data.error?.message || '')) &&
        genConfig.thinkingConfig
      ) {
        markThinkingConfigRejected(model)
        genConfig = { ...(generationConfig || {}) }
        delete genConfig.thinkingConfig
        ;({ response, data } = await tryOnce(apiKey, model, genConfig))
      }

      return { response, data }
    }

    // 1) Chave principal × modelos (sem remultipicar por todas as keys)
    let emptyFallbacks = 0
    let keyDied = false

    for (const model of modelList) {
      const { response, data } = await tryModel(primaryKey, model)

      if (response.ok) {
        if (hasUsableGeminiText(data)) {
          return NextResponse.json(data)
        }
        lastError = `A IA não retornou texto (finishReason=${getGeminiFinishReason(data) || 'EMPTY'})`
        emptyFallbacks += 1
        if (emptyFallbacks > MAX_EMPTY_MODEL_FALLBACKS) break
        continue
      }

      lastError = data.error?.message || `HTTP ${response.status}`
      if (isGeminiApiKeyError(lastError)) {
        sawKeyError = true
        keyDied = true
        break
      }
      if (response.status === 429 || response.status === 503 || response.status === 404) {
        continue
      }
      // 400/outros: não queimar o resto da cadeia
      break
    }

    // 2) Só se a chave principal morreu: 1 tentativa por backup no 1º modelo
    if (keyDied && backupKeys.length) {
      const model = modelList[0]
      for (const apiKey of backupKeys) {
        const { response, data } = await tryModel(apiKey, model)
        if (response.ok && hasUsableGeminiText(data)) {
          return NextResponse.json(data)
        }
        lastError = data.error?.message || `HTTP ${response.status}`
        if (isGeminiApiKeyError(lastError)) {
          sawKeyError = true
          continue
        }
        break
      }
    }

    if (sawKeyError && isGeminiApiKeyError(lastError)) {
      return NextResponse.json(
        { error: geminiKeyExpiredUserMessage(), code: 'gemini_api_key_expired' },
        { status: 401 },
      )
    }

    return NextResponse.json({ error: lastError, code: 'ai_empty_response' }, { status: 502 })
  } catch (error) {
    console.error('[api/gemini/generate]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao chamar Gemini' },
      { status: 500 },
    )
  }
}
