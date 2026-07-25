import { NextRequest, NextResponse } from 'next/server'
import { requireApiAuth } from '@/lib/apiAuth'
import { getGeminiApiKey } from '@/lib/serverSecrets'
import { getDefaultGeminiModels } from '@/utils/geminiModels.js'

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

    const apiKey = getGeminiApiKey()
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'Nenhuma API key Gemini no servidor. Configure GEMINI_API_KEY (recomendado) no .env.local ou no Vercel.',
        },
        { status: 503 },
      )
    }

    let lastError = 'Erro desconhecido'
    const modelList = Array.isArray(models) && models.length ? models : DEFAULT_MODELS

    for (const model of modelList) {
      const requestBody: Record<string, unknown> = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig,
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

      if (response.ok) {
        return NextResponse.json(data)
      }

      lastError = data.error?.message || `HTTP ${response.status}`
      if (response.status === 429 || response.status === 503 || response.status === 404) {
        continue
      }
    }

    return NextResponse.json({ error: lastError }, { status: 502 })
  } catch (error) {
    console.error('[api/gemini/generate]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao chamar Gemini' },
      { status: 500 },
    )
  }
}
