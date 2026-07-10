import { NextRequest, NextResponse } from 'next/server'
import {
  collectGeminiApiKeys,
  geminiRequestWithKeyFallback,
} from '@/utils/geminiKeyPool.js'

const DEFAULT_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro']

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      prompt,
      generationConfig = { temperature: 0.35, maxOutputTokens: 32000 },
      useGoogleSearch = false,
      useFunctionCalling = false,
      tools = [],
      models = DEFAULT_MODELS,
    } = body

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt é obrigatório' }, { status: 400 })
    }

    if (collectGeminiApiKeys().length === 0) {
      return NextResponse.json(
        {
          error:
            'Nenhuma API key Gemini no servidor. Configure VITE_GEMINI_API_KEY no .env.local ou no Vercel.',
        },
        { status: 503 },
      )
    }

    const { data } = await geminiRequestWithKeyFallback({
      models,
      silent: true,
      buildBody: (model) => {
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

        return requestBody
      },
    })

    return NextResponse.json(data)
  } catch (error) {
    console.error('[api/gemini/generate]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao chamar Gemini' },
      { status: 502 },
    )
  }
}
