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
  getGeminiFinishReason,
} from '@/utils/geminiResponseUtils.js'

const DEFAULT_MODELS = getDefaultGeminiModels()

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

    for (const apiKey of apiKeys) {
      for (const model of modelList) {
        const tryOnce = async (genConfig: Record<string, unknown>) => {
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

        let genConfig = withLiteThinkingConfig(generationConfig, model) as Record<string, unknown>
        let { response, data } = await tryOnce(genConfig)

        // thinkingConfig rejeitado → retry sem ele
        if (
          !response.ok &&
          response.status === 400 &&
          /thinking/i.test(String(data.error?.message || '')) &&
          genConfig.thinkingConfig
        ) {
          genConfig = { ...(generationConfig || {}) }
          delete genConfig.thinkingConfig
          ;({ response, data } = await tryOnce(genConfig))
        }

        if (response.ok) {
          if (hasUsableGeminiText(data)) {
            return NextResponse.json(data)
          }
          // 200 vazio → tenta próximo modelo (Lite → Flash)
          lastError = `A IA não retornou texto (finishReason=${getGeminiFinishReason(data) || 'EMPTY'})`
          continue
        }

        lastError = data.error?.message || `HTTP ${response.status}`
        if (isGeminiApiKeyError(lastError) || response.status === 400 || response.status === 403) {
          if (isGeminiApiKeyError(lastError)) {
            sawKeyError = true
            // chave inválida → tenta próxima chave (se houver)
            break
          }
        }
        if (response.status === 429 || response.status === 503 || response.status === 404) {
          continue
        }
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
