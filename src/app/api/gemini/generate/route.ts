import { NextRequest, NextResponse } from 'next/server'
import { readEnv } from '@/lib/env.js'
import { getDefaultGeminiModels } from '@/utils/geminiModels.js'

const DEFAULT_MODELS = getDefaultGeminiModels()

function getServerApiKey(): string {
  return readEnv('VITE_GEMINI_API_KEY') || ''
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      prompt,
      generationConfig = { temperature: 0.35, maxOutputTokens: 32000 },
      useGoogleSearch = true,
      verifyContent = true,
      courseId = null,
      useFunctionCalling = false,
      tools = [],
      models = DEFAULT_MODELS,
    } = body

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt é obrigatório' }, { status: 400 })
    }

    const apiKey = getServerApiKey()
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'Nenhuma API key Gemini no servidor. Configure VITE_GEMINI_API_KEY no .env.local ou no Vercel.',
        },
        { status: 503 }
      )
    }

    let lastError = 'Erro desconhecido'

    for (const model of models) {
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
        }
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
      { status: 500 }
    )
  }
}
